import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
// The shipped browser file is a classic script; the server package is ESM.
const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {createParser,createCapture,createController,createReviewParser}=clientModule.exports;
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
async function finishAudio(harness,index){await until(()=>harness.audios[index]);harness.audios[index].onended?.();await flush();}

const momentId='moment_priya_formulation_001';
const profile=id=>id===momentId?{id,maxTurns:4}:null;
function momentHarness(){
 const h=environment((path,options)=>{const b=JSON.parse(options.body);if(b.action==='debrief')return Promise.resolve(new Response([{type:'review-start',state:'closed'},{type:'review-unavailable',code:'preview_review_unavailable'},{type:'review-complete',state:'closed'}].map(e=>JSON.stringify(e)+'\n').join(''),{headers:{'content-type':'application/x-ndjson'}}));return Promise.resolve(response(frames(b.action==='start'?0:b.action==='retry'?b.turnId:h.calls.filter(c=>c.body.action==='turn').length,['Patient reply.']),options.signal));});
 const c=createController(h.env,{getMomentProfile:profile});return {h,c};
}
async function complete(h,job){await until(()=>h.audios.at(-1)?.onended);h.audios.at(-1).onended();await job;await flush();}
test('four automatic moment responses then explicit local summary and one terminal spoken alternative',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',true,momentId));
 for(let i=0;i<4;i++){h.speaks('I want to understand.');h.advance(4499);assert.equal(h.calls.length,i+1);h.advance(1);await until(()=>h.audios.length===i+2);h.audios.at(-1).onended();await until(()=>!c.getSnapshot().busy);}
 assert.equal(c.getSnapshot().phase,'ended');assert.equal(c.getSnapshot().maxTurns,4);assert.equal(h.live(),undefined);assert.equal(h.calls.length,5);
 assert.ok(h.calls.every(call=>call.path==='/api/practice-moment'&&call.body.scenarioId===momentId&&!Object.hasOwn(call.body,'caseId')));
 c.recordTeamFormulation();h.speaks('She wants help and has concerns.');h.advance(4500);await flush();assert.equal(h.calls.length,5);assert.equal(c.getSnapshot().teamFormulation,'She wants help and has concerns.');
 c.setSummaryUncertain(true);await c.requestMomentReview();assert.equal(h.calls.length,6);assert.equal(h.calls[5].body.outputs.summaryUncertain,true);assert.equal(c.getSnapshot().closedReceiptAvailable,true);
 c.recordAlternative(1);h.speaks('What did I miss?');h.advance(4500);await until(()=>h.audios.length===6);h.audios.at(-1).onended();await until(()=>!c.getSnapshot().busy);assert.equal(h.calls[6].body.action,'retry');assert.equal(h.live(),undefined);assert.equal(c.getSnapshot().messages.filter(m=>m.alternative).length,2);assert.equal(await c.send('Continue'),false);assert.equal(await c.requestMomentReview(),false);
});
test('reflection stops pending automatic capture preserves draft and requires deliberate resume',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',true,momentId));h.speaks('I am thinking.');c.openPrivateReflection();h.advance(10000);assert.equal(h.calls.length,1);assert.equal(c.getSnapshot().draft,'I am thinking.');assert.equal(h.live(),undefined);assert.equal(await c.send(),false);c.closePrivateReflection();assert.equal(h.live(),undefined);c.resume();assert.ok(h.live());c.clear();h.advance(10000);assert.equal(h.calls.length,1);assert.equal(c.getSnapshot().teamFormulation,'');assert.equal(c.getSnapshot().review,null);
});
test('zero-turn ending sends no review or alternative',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',false,momentId));c.end();assert.equal(await c.requestMomentReview(),false);assert.equal(c.recordAlternative(1),false);assert.equal(h.calls.length,1);
});
test('review parser is separate strict bounded and ordered',()=>{
 const valid=[{type:'review-start',state:'closed'},{type:'review-unavailable',code:'preview_review_unavailable'},{type:'review-complete',state:'closed'}];
 function parse(events){const p=createReviewParser({scenarioId:momentId});p.push(events.map(e=>JSON.stringify(e)+'\n').join(''));return p.finish();}
 assert.equal(parse(valid).state,'closed');
 for(const events of [[valid[1],valid[0],valid[2]],[...valid,valid[2]],[valid[0],valid[1],{...valid[2],state:'other'}],[valid[0],valid[1],valid[1],valid[2]],[valid[0],{type:'audio',data:'x'},valid[2]],[{...valid[0],extra:true},...valid.slice(1)]])assert.throws(()=>parse(events));
 const p=createReviewParser({scenarioId:momentId});assert.throws(()=>p.push('x'.repeat(32769)));
});
test('Clear during review suppresses late report and all new state',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',false,momentId));await complete(h,c.send('Hello'));c.end();let release;h.env.fetch=()=>new Promise(r=>{release=r;});const review=c.requestMomentReview();c.clear();release(new Response('',{status:503}));await review;assert.equal(c.getSnapshot().phase,'gate');assert.equal(c.getSnapshot().review,null);assert.equal(c.getSnapshot().error,'');assert.equal(c.getSnapshot().closedReceiptAvailable,false);
});

test('late failed alternative cannot mark a freshly started moment completed',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',false,momentId));await complete(h,c.send('Hello'));c.end();await c.requestMomentReview();
 const originalFetch=h.env.fetch;let release;h.env.fetch=()=>new Promise(resolve=>{release=resolve;});
 const oldRetry=c.retry(1,'Alternative');c.clear();h.env.fetch=originalFetch;
 await complete(h,c.start('fixture',false,momentId));assert.equal(c.getSnapshot().momentStage,'dialogue');
 release(new Response('',{status:503}));await oldRetry;
 assert.equal(c.getSnapshot().momentStage,'dialogue');assert.equal(c.getSnapshot().phase,'ready');
});
test('submitted summary and preserved evidence source have identical text',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',false,momentId));await complete(h,c.send('Hello'));c.end();c.setTeamFormulation('  Priya wants help.  ');await c.requestMomentReview();
 assert.equal(c.getSnapshot().teamFormulation,h.calls.at(-1).body.outputs.teamFormulation);
});

async function startAuxiliaryCapture(target){
 const {h,c}=momentHarness();
 await complete(h,c.start('fixture',true,momentId));
 await complete(h,c.send('I want to understand.'));c.end();
 if(target==='alternative')await c.requestMomentReview();
 assert.equal(target==='team_formulation'?c.recordTeamFormulation():c.recordAlternative(1),true);
 return {h,c};
}
for(const target of ['team_formulation','alternative']){
 for(const initialWords of ['', 'Some captured words.'])test(`${target}: repeated pause preserves ${initialWords?'spoken':'empty'} draft and resumes only on request`,async()=>{
  const {h,c}=await startAuxiliaryCapture(target);
  if(initialWords)h.speaks(initialWords);
  const callsBefore=h.calls.length;
  c.pause();c.pause();h.advance(10000);
  assert.equal(c.getSnapshot().phase,'paused');assert.equal(c.getSnapshot().captureTarget,target);
  assert.equal(c.getSnapshot().draft,initialWords);assert.equal(h.live(),undefined);assert.equal(h.calls.length,callsBefore);
  assert.equal(c.resume(),true);assert.equal(c.getSnapshot().phase,'listening');assert.equal(c.getSnapshot().draft,initialWords);
  h.speaks('More words.');h.advance(4500);await flush();
  const expected=initialWords?initialWords+' More words.':'More words.';
  if(target==='team_formulation'){
   assert.equal(c.getSnapshot().teamFormulation,expected);assert.equal(h.calls.length,callsBefore);
  }else{
   await until(()=>h.audios.at(-1)?.onended);h.audios.at(-1).onended();await until(()=>!c.getSnapshot().busy);
   assert.equal(h.calls.at(-1).body.action,'retry');assert.equal(h.calls.at(-1).body.text,expected);assert.equal(h.calls.length,callsBefore+1);
  }
  assert.equal(c.getSnapshot().captureTarget,'patient');assert.equal(c.resume(),false);
  assert.equal(await c.send('Continue the ended patient conversation.'),false);assert.equal(h.live(),undefined);
 });
 test(`${target}: hidden page stays paused until visible and deliberately resumed`,async()=>{
  const {h,c}=await startAuxiliaryCapture(target);h.speaks('Keep these words.');
  h.env.document.hidden=true;c.pause();h.advance(10000);
  assert.equal(c.getSnapshot().phase,'paused');assert.equal(c.resume(),false);assert.equal(h.live(),undefined);
  h.env.document.hidden=false;h.advance(10000);assert.equal(h.live(),undefined);
  assert.equal(c.resume(),true);assert.equal(c.getSnapshot().draft,'Keep these words.');
  c.pause();c.clear();h.advance(10000);
  assert.equal(c.resume(),false);assert.equal(h.live(),undefined);assert.equal(c.getSnapshot().captureTarget,'patient');assert.equal(c.getSnapshot().draft,'');
 });
 test(`${target}: closing private reflection leaves a resumable paused draft`,async()=>{
  const {h,c}=await startAuxiliaryCapture(target);h.speaks('Keep this draft.');
  c.openPrivateReflection();assert.equal(c.resume(),false);c.closePrivateReflection();h.advance(10000);
  assert.equal(c.getSnapshot().phase,'paused');assert.equal(c.getSnapshot().draft,'Keep this draft.');assert.equal(h.live(),undefined);
  assert.equal(c.resume(),true);assert.equal(c.getSnapshot().captureTarget,target);assert.equal(c.getSnapshot().draft,'Keep this draft.');
  c.clear();
 });
}
test('auxiliary resume cannot reopen zero-turn, reviewed, or cleared patient dialogue',async()=>{
 const {h,c}=momentHarness();await complete(h,c.start('fixture',true,momentId));c.end();
 assert.equal(c.recordTeamFormulation(),false);assert.equal(c.recordAlternative(1),false);assert.equal(c.resume(),false);
 c.clear();await complete(h,c.start('fixture',true,momentId));await complete(h,c.send('Hello.'));c.end();
 assert.equal(c.recordAlternative(1),false);assert.equal(c.resume(),false);
 await c.requestMomentReview();assert.equal(c.recordTeamFormulation(),false);assert.equal(c.resume(),false);
 assert.equal(c.recordAlternative(1),true);c.pause();c.clear();
 assert.equal(c.recordAlternative(1),false);assert.equal(c.resume(),false);
});
