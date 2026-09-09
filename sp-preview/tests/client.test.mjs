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
    Audio:class{constructor(src){this.src=src;this.pauses=0;this.plays=0;this.loads=0;audios.push(this);}play(){this.plays++;return Promise.resolve();}pause(){this.pauses++;}removeAttribute(){this.src='';}load(){this.loads++;}},
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
      // The spec allows a result list to shrink: an interim may be withdrawn
      // without ever being replaced by a final.
      withdraw(){this.results.length=this.cursor;this.fire();}
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
async function finishAudio(harness,index){await until(()=>harness.audios[index]?.plays===1);harness.audios[index].onended?.();await flush();}

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
  const opening=controller.start('private-passcode',false);await until(()=>h.audios[0]?.plays===1);
  assert.equal(controller.getSnapshot().phase,'speaking');assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.headers['x-preview-key'],'private-passcode');assert.equal(JSON.stringify(controller.getSnapshot()).includes('private-passcode'),false);
  await finishAudio(h,0);await finishAudio(h,1);assert.equal(await opening,true);assert.equal(controller.getSnapshot().phase,'ready');
  const next=controller.send('What has been hardest?');await until(()=>h.calls.length===2);
  assert.deepEqual(h.calls[1].body,{action:'turn',caseId:'sp_depression_gated_si_001',state:'complete-0',text:'What has been hardest?',previousPlayback:'played',previousCompletedSegments:2});
  assert.equal(await controller.send('Duplicate'),false);assert.equal(h.calls.length,2);
  await finishAudio(h,2);await finishAudio(h,3);await next;assert.equal(controller.getSnapshot().turn,1);assert.equal(h.revoked.length,4);
});

test('interrupting second segment keeps first completed segment and original question',async()=>{
  const h=environment(),controller=createController(h.env);const opening=controller.start('key',false);
  await finishAudio(h,0);await until(()=>h.audios[1]?.plays===1);controller.interrupt();await opening;
  assert.equal(controller.getSnapshot().restartRequired,false);assert.equal(controller.getSnapshot().phase,'paused');
  const next=controller.send('Let me check what I heard.');await until(()=>h.calls.length===2);
  assert.equal(h.calls[1].body.state,'complete-0');assert.equal(h.calls[1].body.previousPlayback,'interrupted');assert.equal(h.calls[1].body.previousCompletedSegments,1);
  await finishAudio(h,2);await finishAudio(h,3);await next;
  assert.equal(controller.getSnapshot().messages[1].text,'Let me check what I heard.');assert.equal(h.revoked.length,4);
});

test('the next recording loads while the first plays, but cannot play or count as heard early',async()=>{
  const h=environment(),controller=createController(h.env),work=controller.start('key',false);
  await until(()=>h.audios[0]?.plays===1);await flush();
  assert.equal(h.audios.length,2);assert.equal(h.audios[1].preload,'auto');assert.equal(h.audios[1].loads,1);
  assert.equal(h.audios[1].plays,0);assert.equal(h.audios[0].pauses,0);
  h.audios[1].onended?.();await flush();
  assert.equal(h.audios[1].plays,0);assert.equal(h.revoked.length,0);
  await finishAudio(h,0);assert.equal(h.audios[1].plays,1);
  await finishAudio(h,1);assert.equal(await work,true);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,2);assert.equal(h.revoked.length,2);
});

test('interrupting the first recording immediately releases prepared audio and sends no unheard segment receipt',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(number===1?frames():frames(1,['A fresh reply.']),options.signal))),controller=createController(h.env);
  const work=controller.start('key',true);await until(()=>h.audios[0]?.plays===1);await flush();
  assert.equal(h.audios.length,2);const staleFirst=h.audios[0].onended,staleQueued=h.audios[1].onended;
  controller.interrupt();assert.equal(h.audios[0].pauses,1);assert.equal(h.audios[1].pauses,1);assert.equal(h.revoked.length,2);
  assert.equal(await work,false);staleFirst?.();staleQueued?.();await flush();
  assert.equal(h.audios[1].plays,0);assert.equal(h.revoked.length,2);assert.equal(controller.getSnapshot().phase,'paused');
  assert.equal(h.recognizers.some(item=>item.active),false);
  const next=controller.send('Let me ask about sleep.');await until(()=>h.calls.length===2);
  assert.equal(h.calls[1].body.previousCompletedSegments,0);assert.equal(h.calls[1].body.previousPlayback,'interrupted');
  await finishAudio(h,2);assert.equal(await next,true);
});

test('a queued loading failure preserves the playing segment and never counts or plays the failed recording',async()=>{
  const h=environment(),controller=createController(h.env),work=controller.start('key',false);
  await until(()=>h.audios[0]?.plays===1);await flush();assert.equal(h.audios.length,2);
  h.audios[1].onerror();await flush();
  assert.equal(h.audios[0].pauses,0);assert.equal(h.audios[1].plays,0);assert.equal(h.revoked.length,1);
  await finishAudio(h,0);assert.equal(await work,false);
  const snapshot=controller.getSnapshot();assert.equal(snapshot.phase,'paused');assert.match(snapshot.error,/voice could not finish/i);
  assert.equal(snapshot.messages[0].completedSegments,1);assert.equal(h.revoked.length,2);
  const next=controller.send('What did you mean?');await until(()=>h.calls.length===2);
  assert.equal(h.calls[1].body.previousCompletedSegments,1);assert.equal(h.calls[1].body.previousPlayback,'interrupted');
  await finishAudio(h,2);await finishAudio(h,3);assert.equal(await next,true);
});

test('cleared prepared recordings cannot complete or stop a new encounter when old callbacks arrive',async()=>{
  const h=environment((path,options)=>Promise.resolve(response(frames(),options.signal))),controller=createController(h.env);
  const old=controller.start('old-key',false);await until(()=>h.audios[0]?.plays===1);await flush();
  assert.equal(h.audios.length,2);const staleFirst=h.audios[0].onended,staleQueued=h.audios[1].onended;
  controller.clear();const fresh=controller.start('new-key',false);await until(()=>h.audios[2]?.plays===1);
  staleFirst?.();staleQueued?.();assert.equal(await old,false);await flush();
  assert.equal(controller.getSnapshot().phase,'speaking');assert.equal(h.audios[1].plays,0);assert.equal(h.audios[2].pauses,0);
  assert.equal(h.revoked.length,2);assert.equal(new Set(h.revoked).size,2);
  await finishAudio(h,2);await finishAudio(h,3);assert.equal(await fresh,true);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,2);assert.equal(h.revoked.length,4);
});

for(const action of ['pause','end'])test(`${action} immediately releases both playing and prepared recordings`,async()=>{
  const h=environment(),controller=createController(h.env),work=controller.start('key',true);
  await until(()=>h.audios[0]?.plays===1);await flush();assert.equal(h.audios.length,2);
  controller[action]();assert.equal(h.revoked.length,2);assert.equal(h.audios[0].pauses,1);assert.equal(h.audios[1].pauses,1);
  assert.equal(await work,false);assert.equal(h.audios[1].plays,0);assert.equal(h.revoked.length,2);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,0);assert.equal(h.recognizers.some(item=>item.active),false);
});

test('an active playback error releases queued audio without playing it',async()=>{
  const h=environment(),controller=createController(h.env),work=controller.start('key',false);
  await until(()=>h.audios[0]?.plays===1);await flush();assert.equal(h.audios.length,2);
  h.audios[0].onerror();assert.equal(await work,false);
  assert.equal(h.revoked.length,2);assert.equal(h.audios[1].plays,0);assert.equal(controller.getSnapshot().messages[0].completedSegments,0);
});

test('a stalled playing recording times out and releases the prepared recording without starting it',async()=>{
  const h=environment(),controller=createController(h.env),work=controller.start('key',false);
  await until(()=>h.audios[0]?.plays===1);await flush();assert.equal(h.audios.length,2);
  h.advance(65000);assert.equal(await work,false);
  assert.equal(h.revoked.length,2);assert.equal(h.audios[1].plays,0);assert.equal(h.timers.size,0);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,0);assert.equal(controller.getSnapshot().phase,'paused');
});

test('a pause during the speaking update prevents late play after resources were released',async()=>{
  const h=environment();let paused=false;
  const controller=createController(h.env,{onChange(snapshot){if(snapshot.phase==='speaking'&&!paused){paused=true;controller.pause();}}});
  assert.equal(await controller.start('key',false),false);
  assert.equal(h.audios.length,1);assert.equal(h.audios[0].plays,0);assert.deepEqual(h.revoked,h.urls);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,0);
});

test('an audio constructor failure revokes its URL and leaves a recoverable unheard reply',async()=>{
  const h=environment(),controller=createController(h.env);h.env.Audio=class{constructor(){throw new Error('Unavailable output device');}};
  assert.equal(await controller.start('key',false),false);
  assert.equal(h.urls.length,1);assert.deepEqual(h.revoked,h.urls);assert.equal(controller.getSnapshot().messages[0].completedSegments,0);
  assert.equal(controller.getSnapshot().phase,'paused');assert.equal(controller.getSnapshot().restartRequired,false);
});

for(const [name,failure,expected] of [
  ['provider',{type:'error',code:'preview_provider_unavailable'},/patient’s reply could not be completed/i],
  ['protocol',{type:'audio',index:0,data:audio,state:'duplicate-audio'},/response could not be verified/i],
])test(`a partial-stream ${name} failure keeps its real error while cancelling active and prepared audio`,async()=>{
  let append;
  const h=environment(()=>Promise.resolve(new Response(new ReadableStream({start(stream){
    append=event=>stream.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));
    frames().slice(0,3).forEach(append);
  },cancel(){}}),{headers:{'content-type':'application/x-ndjson; charset=utf-8'}}))),controller=createController(h.env);
  const work=controller.start('key',false);await until(()=>h.audios[0]?.plays===1);await flush();
  assert.equal(h.audios.length,2);assert.equal(h.audios[1].plays,0);append(failure);
  assert.equal(await work,false);assert.match(controller.getSnapshot().error,expected);
  assert.equal(h.revoked.length,2);assert.equal(new Set(h.revoked).size,2);assert.equal(h.audios[0].pauses,1);assert.equal(h.audios[1].plays,0);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,0);assert.equal(controller.getSnapshot().restartRequired,false);
});

test('a second audio constructor failure keeps its audio error when cancelling the first recording',async()=>{
  const h=environment(),Audio=h.env.Audio;let constructions=0;
  h.env.Audio=class extends Audio{constructor(){if(++constructions===2)throw new Error('Unavailable output device');super();}};
  const controller=createController(h.env);assert.equal(await controller.start('key',false),false);
  assert.equal(h.audios[0].plays,1);assert.match(controller.getSnapshot().error,/voice could not finish playing/i);
  assert.equal(h.urls.length,2);assert.equal(h.revoked.length,2);assert.equal(new Set(h.revoked).size,2);assert.equal(h.audios[0].pauses,1);
  assert.equal(controller.getSnapshot().messages[0].completedSegments,0);assert.equal(controller.getSnapshot().restartRequired,false);
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
  const old=controller.start('old-key',false);controller.clear();const fresh=controller.start('new-key',false);await until(()=>h.audios[0]?.plays===1);
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

test('speech the recognizer has not yet reported is never overwritten by an earlier draft — R2',()=>{
  // A finalized draft exists; the learner starts speaking again; no interim or final
  // has arrived. Grace expiry is not evidence of silence — the Web Speech contract
  // gives no delivery deadline — so it must not send the earlier draft.
  const t=spoken();t.capture.start();t.h.speaks('the earlier question');
  t.h.advance(1000);t.h.live().speechStart();
  t.h.advance(60000);
  assert.equal(t.submissions(),0,'nothing is sent while speech is open and unreported');
  assert.deepEqual(t.notices,['unfinished_speech'],'the learner is told once that it stalled');
  assert.equal(t.draft(),'the earlier question','the completed words are kept');
  assert.equal(t.capture.isActive(),true,'and the microphone stays available');
});

test('new speech ending starts a fresh quiet window even before its words arrive',()=>{
  // speechend reports the end of speech, not the arrival of its final words.
  // Reusing the older draft's deadline could send before that result arrives.
  const t=spoken();t.capture.start();t.h.speaks('the real question');
  t.h.advance(1000);
  const recognition=t.h.live();recognition.speechStart();
  t.h.advance(500);recognition.speechEnd();
  t.h.advance(4499);
  assert.equal(t.submissions(),0,'the quiet window begins after the latest speech ends');
  t.h.advance(1);
  assert.equal(t.submissions(),1);
  assert.deepEqual(t.notices,[],'and nothing needed explaining');
});

for(const [thinking,wait] of [[false,4500],[true,8000]]){
  test('a delayed final after resumed speech is included before automatic sending ('+wait+' ms)',async()=>{
    const h=environment((path,options,number)=>Promise.resolve(response(frames(number-1,['A completed reply.']),options.signal))),
      controller=createController(h.env);
    const opening=controller.start('key',true);await finishAudio(h,0);await opening;
    controller.setThinking(thinking);
    const recognition=h.live();recognition.final('Could you explain');h.advance(wait-500);
    recognition.speechStart();h.advance(1000);recognition.speechEnd();h.advance(0);
    assert.equal(h.calls.length,1,'speechend must not immediately send the old question prefix');
    h.advance(400);recognition.final('how you slept last night');
    h.advance(wait-1);assert.equal(h.calls.length,1,'the complete question gets its full quiet window');
    h.advance(1);await until(()=>h.calls.length===2);
    assert.equal(h.calls[1].body.text,'Could you explain how you slept last night');
    assert.equal(controller.getDiagnostics().automaticSubmissions,1);
    assert.equal(controller.getDiagnostics().explicitSubmissions,0);
    await finishAudio(h,1);controller.dispose();
  });
}

test('words arriving after a stall clear it without an explicit action — R2',()=>{
  const t=spoken();t.capture.start();t.h.speaks('the earlier question');
  t.h.advance(1000);t.h.live().speechStart();
  t.h.advance(60000);
  assert.equal(t.submissions(),0);
  t.h.speaks('and the rest of it');
  t.h.advance(4500);
  assert.equal(t.submissions(),1,'late speech resumes automatic sending');
  assert.equal(t.draft(),'the earlier question and the rest of it');
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
  const h=environment(),controller=createController(h.env);const work=controller.start('key',true);await until(()=>h.audios[0]?.plays===1);controller.dispose();await work;
  assert.equal(h.revoked.length,2);assert.equal(h.audios[0].pauses,1);assert.equal(h.audios[1].plays,0);assert.equal(controller.resume(),false);assert.equal(controller.getSnapshot().draft,'');assert.deepEqual(controller.getSnapshot().messages,[]);
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
  const next=controller.send('And after that?');await until(()=>h.audios[2]?.plays===1);
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

test('an alternative can be asked once, only after the encounter ends, and never resent after a failure',async()=>{
  const h=environment((path,options,number)=>{const body=JSON.parse(options.body);
    return Promise.resolve(response(frames(body.action==='retry'?body.turnId:number-1,['One completed reply.']),options.signal));}),
    controller=createController(h.env);
  let work=controller.start('key',false);await finishAudio(h,0);await work;
  assert.equal(await controller.retry(1,'Too early'),false,'no alternative before the encounter ends');
  for(let turn=1;turn<=10;turn++){work=controller.send('Question '+turn);await finishAudio(h,turn);await work;}
  assert.equal(controller.getSnapshot().phase,'ended');
  const before=h.calls.length;
  const alternative=controller.retry(3,'A different way of asking');
  await until(()=>h.calls.length===before+1);
  assert.deepEqual(Object.keys(h.calls.at(-1).body).sort(),['action','caseId','state','text','turnId']);
  assert.equal(h.calls.at(-1).body.action,'retry');
  assert.equal(h.calls.at(-1).body.turnId,3);
  await finishAudio(h,11);await alternative;
  assert.equal(controller.getSnapshot().retryUsed,true);
  assert.equal(controller.getSnapshot().phase,'ended','an alternative does not reopen the encounter');
  assert.equal(controller.getSnapshot().turn,10,'nor does it rewind the turn count');
  assert.equal(await controller.retry(4,'A second alternative'),false,'only one alternative per encounter');
  assert.equal(h.calls.length,before+1);
});

test('an alternative that fails before its receipt does not resend and asks for a restart',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(number<=11?frames(number-1,['A reply.']):[],options.signal))),
    controller=createController(h.env);
  let work=controller.start('key',false);await finishAudio(h,0);await work;
  for(let turn=1;turn<=10;turn++){work=controller.send('Question '+turn);await finishAudio(h,turn);await work;}
  const alternative=controller.retry(2,'An alternative');await flush();controller.interrupt();await alternative;
  const snapshot=controller.getSnapshot();
  assert.equal(snapshot.restartRequired,true);
  assert.match(snapshot.error,/outcome is unknown/);
  const count=h.calls.length;
  assert.equal(await controller.retry(2,'Again'),false);
  assert.equal(h.calls.length,count,'an uncertain alternative is never repeated automatically');
});

test('the chosen case travels on every request and cannot change mid-encounter',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(frames(number-1,['A reply.']),options.signal))),
    controller=createController(h.env);
  let work=controller.start('key',false,'sp_mania_redirect_001');await finishAudio(h,0);await work;
  assert.equal(controller.getSnapshot().caseId,'sp_mania_redirect_001');
  assert.equal(h.calls[0].body.caseId,'sp_mania_redirect_001');
  work=controller.send('A question');await finishAudio(h,1);await work;
  assert.equal(h.calls[1].body.caseId,'sp_mania_redirect_001','a turn carries the same case');
  assert.equal(h.calls.every(call=>call.body.caseId==='sp_mania_redirect_001'),true);
});

test('an encounter refuses to start without a registered case',async()=>{
  const h=environment(),controller=createController(h.env);
  assert.equal(await controller.start('key',false,'not_a_case'),false);
  assert.equal(h.calls.length,0,'no request is made for an unregistered case');
});

test('an encounter with no case named defaults to Dana, so existing callers are unchanged',async()=>{
  const h=environment(),controller=createController(h.env);
  // The default fixture opening has two segments; both must finish.
  const work=controller.start('key',false);await finishAudio(h,0);await finishAudio(h,1);await work;
  assert.equal(h.calls[0].body.caseId,'sp_depression_gated_si_001');
  assert.equal(controller.getSnapshot().caseId,'sp_depression_gated_si_001');
});

test('a new encounter after Clear gets its own alternative — R7',async()=>{
  // Turn numbering restarts with each encounter, so track it from the action.
  let turnNo=0;
  const h=environment((path,options)=>{const body=JSON.parse(options.body);
    const turn=body.action==='start'?(turnNo=0):body.action==='retry'?body.turnId:++turnNo;
    return Promise.resolve(response(frames(turn,['One completed reply.']),options.signal));}),
    controller=createController(h.env);
  let work=controller.start('key',false);await finishAudio(h,0);await work;
  for(let turn=1;turn<=10;turn++){work=controller.send('Question '+turn);await finishAudio(h,turn);await work;}
  const alternative=controller.retry(3,'An alternative');await finishAudio(h,11);await alternative;
  assert.equal(controller.getSnapshot().retryUsed,true);

  controller.clear();
  assert.equal(controller.getSnapshot().retryUsed,false,'Clear must return the alternative to a fresh encounter');
  work=controller.start('key',false);await finishAudio(h,12);await work;
  assert.equal(controller.getSnapshot().retryUsed,false,'and the new encounter still has it');
});

test('a withdrawn interim never lets the earlier final be sent as the whole question — R3',()=>{
  const t=spoken();t.capture.start();
  t.h.speaks('I wanted to ask');
  const recognition=t.h.live();
  recognition.speechStart();recognition.interim('about your sleep');
  t.h.advance(300);
  recognition.withdraw();                       // interim vanishes, no final replaces it
  t.h.advance(60000);
  assert.equal(t.submissions(),0,'the earlier final is not the whole question');
  assert.deepEqual(t.notices,['unfinished_speech'],'the learner is told, once');
  assert.equal(t.draft(),'I wanted to ask','completed words are kept');
  assert.equal(t.capture.isActive(),true,'and the microphone stays available');
});

test('after a withdrawn interim, new speech resumes normally — R3',()=>{
  const t=spoken();t.capture.start();
  t.h.speaks('I wanted to ask');
  const recognition=t.h.live();
  recognition.speechStart();recognition.interim('about your sleep');
  t.h.advance(300);recognition.withdraw();t.h.advance(10000);
  assert.equal(t.submissions(),0);
  t.h.speaks('about your sleep');
  t.h.advance(4500);
  assert.equal(t.submissions(),1,'repeating the lost words restores automatic sending');
  assert.equal(t.draft(),'I wanted to ask about your sleep');
});

test('the page identifies the patient actually chosen — R5',()=>{
  const {applyIdentity}=clientModule.exports;
  const nodes={};
  const doc={getElementById:id=>nodes[id]||(nodes[id]={textContent:''}),title:''};
  applyIdentity(doc,{displayName:'Marcus',voice:'Cedar',title:'Marcus — A focused interview'});
  assert.match(doc.title,/Marcus/,'the tab names Marcus');
  assert.equal(doc.title.includes('Dana'),false);
  assert.match(nodes['patient-name'].textContent,/Marcus/);
  assert.match(nodes['voice-tag'].textContent,/Cedar/,'his voice, not Marin');
  assert.equal(nodes['voice-tag'].textContent.includes('Marin'),false);

  applyIdentity(doc,{displayName:'Dana',voice:'Marin',title:'Dana — Admission interview'});
  assert.match(nodes['patient-name'].textContent,/Dana/,'and switches back');
  assert.match(nodes['voice-tag'].textContent,/Marin/);
});

test('status and transcript labels name the chosen patient — R5',()=>{
  const {statusLine,speakerLabel}=clientModule.exports;
  assert.equal(speakerLabel('you','Marcus'),'You');
  assert.equal(speakerLabel('dana','Marcus'),'Marcus','a patient row is labelled by name, not by role');
  assert.match(statusLine('responding','Marcus'),/Marcus/);
  assert.match(statusLine('speaking','Ray'),/Ray/);
  assert.equal(statusLine('responding','Marcus').includes('Dana'),false);
});

test('a failed Marcus request does not identify its patient as Dana',async()=>{
  const h=environment(()=>Promise.resolve(Response.json({error:'preview_provider_unavailable'},{status:503}))),
    controller=createController(h.env);
  assert.equal(await controller.start('key',false,'sp_mania_redirect_001'),false);
  const snapshot=controller.getSnapshot();
  assert.equal(snapshot.caseId,'sp_mania_redirect_001');
  assert.equal(snapshot.error.includes('Dana'),false,'a shared failure message must not introduce another patient');
  assert.match(snapshot.error,/reply could not be completed/i);
  assert.equal(h.calls.length,1,'the failed request is not sent again');
  controller.dispose();
});
test('the shared chrome carries no gendered pronoun — the case set is mixed',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  // Dana is she/her; Marcus and Ray are he/him. Anything in the shared page that
  // assumes a pronoun is wrong for two of the three patients.
  const chrome=html.replace(/<option[^>]*>[^<]*<\/option>/g,'');
  const found=chrome.match(/\b(her|hers|his|she|he)\b/gi)||[];
  assert.deepEqual(found,[],'shared chrome must not assume a pronoun: '+found.join(', '));
});

test('applyIdentity names the patient in the door heading too — R5 follow-up',()=>{
  const {applyIdentity}=clientModule.exports;
  const nodes={};
  const doc={getElementById:id=>nodes[id]||(nodes[id]={textContent:''}),title:''};
  applyIdentity(doc,{displayName:'Marcus',voice:'Cedar',title:'Marcus — A focused interview'});
  assert.match(nodes['door-title'].textContent,/Marcus/,'the door heading names Marcus');
  assert.equal(/\b(her|his|she|he)\b/i.test(nodes['door-title'].textContent),false,'and assumes no pronoun');
});

test('family name-first routing distinguishes direct address from mentioning a person',()=>{
 const route=clientModule.exports.addressedFamilyRole;
 for(const text of ['Maya, how do you see it?','Maya what could you offer?','Okay, Morgan, what matters most?'])assert.equal(route(text),/maya/i.test(text)?'maya':'morgan');
 for(const text of ['Maya is willing to call once a week. How do you feel about that?','Morgan would like to choose. What is your perspective?','Morgan can help. What do you think?','Maya said she would call.','Morgan told me something.','What did Maya say?','Can I ask both of you?'])assert.equal(route(text),null,text);
});
function familyEnvironment(){return environment((path,options)=>{
 const body=JSON.parse(options.body),turn=body.action==='start'?0:body.action==='retry'?body.turnId:Number(body.state.split('-').at(-1))+1;
 const output=frames(turn,['A completed reply.']);output[0].speakerId=body.action==='start'?'morgan':body.action==='retry'?'maya':body.targetRoleId;
 return Promise.resolve(response(output,options.signal));
});}
test('family automatic turns switch named respondent without a selector click',async()=>{
 const h=familyEnvironment(),controller=createController(h.env);
 let work=controller.start('key',true,'family_morgan_maya_001');await finishAudio(h,0);await work;
 h.speaks('Maya, what support could you offer?');h.advance(4500);await finishAudio(h,1);await flush();
 assert.equal(h.calls[1].body.targetRoleId,'maya');assert.equal(controller.getSnapshot().messages.at(-1).speakerId,'maya');
 assert.equal(controller.getDiagnostics().automaticSubmissions,1);
 assert.equal(controller.setTargetRole('morgan'),true);
 work=controller.send('How would that feel?');await finishAudio(h,2);await work;
 assert.equal(h.calls[2].body.targetRoleId,'morgan');
 controller.end();controller.clear();assert.equal(controller.getSnapshot().targetRoleId,'morgan');
});
test('family retry keeps its original participant and does not transmit a replacement target',async()=>{
 const h=familyEnvironment(),controller=createController(h.env);
 let work=controller.start('key',false,'family_morgan_maya_001');await finishAudio(h,0);await work;
 work=controller.send('Maya, what matters?');await finishAudio(h,1);await work;
 work=controller.send('Morgan, what matters?');await finishAudio(h,2);await work;
 controller.end();work=controller.retry(1,'Could you say more?');await finishAudio(h,3);assert.equal(await work,true);
 assert.equal(h.calls[3].body.targetRoleId,undefined,'server restores original authenticated target');
 assert.equal(controller.getSnapshot().messages.at(-2).targetRoleId,'maya');
 assert.equal(controller.getSnapshot().messages.at(-1).speakerId,'maya');
});
test('family parser refuses a reply attributed to a different or unknown participant',()=>{
 for(const speakerId of ['morgan','dana',undefined]){
  const output=frames(1);if(speakerId)output[0].speakerId=speakerId;
  assert.throws(()=>{const parser=createParser({expectedTurn:1,expectedSpeakerId:'maya'});parser.push(output.map(e=>JSON.stringify(e)).join('\n'));parser.finish();},{code:'protocol_error'});
 }
});
