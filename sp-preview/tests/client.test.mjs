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
  const env={document:{hidden:false},crypto:{randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'},atob,Blob,
    setTimeout(callback,delay){const key=++id;timers.set(key,{callback,at:now+delay});return key;},clearTimeout(key){timers.delete(key);},
    URL:{createObjectURL(){const value='blob:preview-'+urls.length;urls.push(value);return value;},revokeObjectURL(value){revoked.push(value);}},
    fetch(path,options){calls.push({path,options,body:JSON.parse(options.body)});return fetcher?fetcher(path,options,calls.length):Promise.resolve(response(frames(calls.length-1),options.signal));},
    Audio:class{constructor(src){this.src=src;this.pauses=0;audios.push(this);}play(){return Promise.resolve();}pause(){this.pauses++;}removeAttribute(){this.src='';}load(){}},
    SpeechRecognition:class{constructor(){this.results=[];this.active=false;recognizers.push(this);}start(){this.active=true;this.onstart?.();}abort(){this.active=false;}emit(text,final=true){const result=Object.assign([{transcript:text}],{isFinal:final});if(final)this.results.push(result);this.onspeechstart?.();this.onresult?.({results:final?this.results:[...this.results,result]});this.onspeechend?.();}}
  };
  function advance(ms){now+=ms;let due;while((due=[...timers].filter(([,timer])=>timer.at<=now).sort((a,b)=>a[1].at-b[1].at)[0])){timers.delete(due[0]);due[1].callback();}}
  return {env,calls,audios,recognizers,revoked,urls,timers,advance};
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

test('interim words prevent sending and unfinished speech service endings pause with completed words retained',()=>{
  const h=environment();let draft='',submissions=0,problem;const capture=createCapture(h.env,{hasDraft:()=>!!draft,onFinal:text=>draft=text,onSubmit:()=>submissions++,onError:error=>problem=error.code});
  capture.start();h.recognizers[0].emit('I wanted to ask');h.recognizers[0].emit('what matters',false);h.advance(10000);assert.equal(submissions,0);
  h.recognizers[0].onend();assert.equal(problem,'unfinished_speech');assert.equal(draft,'I wanted to ask');assert.equal(capture.isActive(),false);
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
