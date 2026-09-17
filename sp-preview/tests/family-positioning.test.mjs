import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const module={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})')(module,module.exports);
const {createController}=module.exports,FAMILY='family_morgan_maya_001';
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
async function until(check){for(let n=0;n<40&&!check();n++)await flush();assert.ok(check(),'expected audio lifecycle step');}
function harness({unsupported=false,missingPanner=false,rejectResume=false,deferResume=false,failConnection=false}={}){
  const contexts=[],audios=[],calls=[],revoked=[],timers=new Map();let timer=0,sequence=0,parts=null;
  class Audio{
    constructor(){this.plays=0;this.pauses=0;this.playbackRate=1;audios.push(this);}
    play(){this.plays++;return Promise.resolve();}pause(){this.pauses++;}load(){}removeAttribute(){this.src='';}
  }
  class Context{
    constructor(){this.state='suspended';this.destination={};this.sources=[];this.panners=[];this.resumes=0;this.closes=0;contexts.push(this);if(missingPanner)this.createStereoPanner=undefined;}
    resume(){this.resumes++;if(rejectResume)return Promise.reject(Error('fixture unavailable'));if(deferResume)return new Promise(resolve=>{this.release=()=>{this.state='running';resolve();};});this.state='running';return Promise.resolve();}
    close(){this.closes++;this.state='closed';return Promise.resolve();}
    transition(state){this.state=state;this.onstatechange?.();}
    createStereoPanner(){const node={pan:{value:0},disconnected:0,connect(){},disconnect(){this.disconnected++;}};this.panners.push(node);return node;}
    createMediaElementSource(audio){assert.equal(audio.routed,undefined,'a media element may be routed only once');audio.routed=this;const node={audio,disconnected:0,connect(panner){if(failConnection)throw Error('fixture graph failed');this.panner=panner;},disconnect(){this.disconnected++;}};this.sources.push(node);return node;}
  }
  const env={document:{hidden:false},crypto:{randomUUID:()=>crypto.randomUUID()},atob,Blob,Audio,
    setTimeout(fn,delay){timers.set(++timer,{fn,delay});return timer;},clearTimeout(id){timers.delete(id);},
    URL:{createObjectURL:()=>`blob:fixture-${++sequence}`,revokeObjectURL:url=>revoked.push(url)},
    async fetch(path,options){const body=JSON.parse(options.body);calls.push(body);let events;
      if(body.action==='start'&&body.caseId===FAMILY){events=[{type:'ready',caseId:FAMILY,turn:0,state:'ready'},{type:'complete',state:'ready'}];}
      else{const turn=body.action==='start'?0:body.action==='retry'?body.turnId:calls.filter(item=>item.action==='turn').length;
        const role=body.caseId===FAMILY?(body.targetRoleId||'morgan'):undefined;
        const texts=parts||['A complete reply.'];parts=null;
        const bid=texts[1]===' Could I add something?'?{speakerId:role==='morgan'?'maya':'morgan',text:'Could I add something?'}:undefined;
        events=[{type:'reply',turn,state:'reply-'+sequence,reply:texts.join(''),segments:texts.map(text=>({text})),...(role?{speakerId:role}:{}),...(bid?{familyBid:bid}:{})},...texts.map((text,index)=>({type:'audio',index,state:'audio-'+index,data:Buffer.alloc(100,1).toString('base64')})),{type:'complete',state:'complete-'+sequence}];
      }
      return new Response(events.map(event=>JSON.stringify(event)).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
    }};
  if(!unsupported)env.AudioContext=Context;
  const controller=createController(env);
  return {controller,contexts,audios,calls,revoked,timers,parts(value){parts=value;},
    start(selected=true){return controller.start('fixture-passcode',false,FAMILY,{familyBriefAcknowledged:true,familyPositioning:selected});},
    playing(){return audios.findLast(audio=>audio.plays&&!audio.pauses);},
    async finish(){await until(()=>this.playing());this.playing().onended();await flush();}
  };
}

test('positioning is opt-in and cannot initialize audio processing for a nonfamily case',async()=>{
  const h=harness();assert.equal(h.controller.getSnapshot().familyPositioning,false);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'off');
  await h.start(false);assert.equal(h.contexts.length,0);
  h.controller.clear();const request=h.controller.start('fixture',false,'sp_depression_gated_si_001',{familyPositioning:true});
  await h.finish();await request;assert.equal(h.contexts.length,0);assert.equal(h.controller.getSnapshot().familyPositioning,false);h.controller.dispose();
});

test('actual Morgan and Maya clips including the second-role bid use distinct pans without changing requests or rate',async()=>{
  const h=harness();await h.start();assert.equal(h.contexts.length,1);assert.equal(h.contexts[0].resumes,1);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'on');
  h.parts(['Morgan answers.',' Could I add something?']);const request=h.controller.send('Morgan, what matters?');
  await until(()=>h.playing());assert.equal(h.contexts[0].sources[0].panner.pan.value,-0.25);
  await h.finish();assert.equal(h.contexts[0].sources[1].panner.pan.value,0.25);assert.equal(h.controller.getSnapshot().activeSpeakerId,'maya');
  await h.finish();await request;assert.ok(h.audios.every(audio=>audio.playbackRate===1));
  assert.equal(h.calls.length,2);assert.equal('familyPositioning' in h.calls[0],false);assert.equal('familyPositioning' in h.calls[1],false);
  h.controller.dispose();assert.equal(h.contexts[0].closes,1);assert.ok(h.contexts[0].sources.every(source=>source.disconnected>0));
});

test('off centers an active routed clip and leaves queued audio centered with no request or resume',async()=>{
  const h=harness();await h.start();h.parts(['First.',' Second.']);const request=h.controller.send('Morgan, please continue.');await until(()=>h.playing());
  h.controller.setFamilyPositioning(false);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'off');assert.equal(h.contexts[0].sources[0].panner.pan.value,0);
  await h.finish();assert.equal(h.playing().routed,undefined);await h.finish();await request;
  assert.equal(h.calls.length,2);assert.equal(h.contexts[0].resumes,1);h.controller.clear();assert.equal(h.contexts[0].closes,1);
});

for(const failure of [{unsupported:true},{missingPanner:true},{rejectResume:true},{failConnection:true}])test(`effect failure uses an unrouted centered element: ${Object.keys(failure)[0]}`,async()=>{
  const h=harness(failure);await h.start();const request=h.controller.send('Maya, what matters?');await until(()=>h.playing());
  assert.equal(h.controller.getSnapshot().familyPositioningStatus,'unavailable');assert.equal(h.playing().routed,undefined);
  if(failure.failConnection){assert.equal(h.audios.length,2);assert.equal(h.audios[0].plays,0);assert.ok(h.audios[0].pauses>0);}
  await h.finish();await request;assert.equal(h.controller.getSnapshot().messages.at(-1).completedSegments,1);h.controller.dispose();
});

for(const state of ['suspended','closed'])test(`${state} graph interrupts the active clip before it can count as heard`,async()=>{
  const h=harness();await h.start();h.parts(['Heard prefix.',' Unfinished remainder.']);const request=h.controller.send('Morgan, please continue.');
  await h.finish();await until(()=>h.playing());const lateEnded=h.playing().onended;
  h.contexts[0].transition(state);lateEnded?.();await request;
  assert.equal(h.controller.getSnapshot().messages.at(-1).completedSegments,1);assert.equal(h.controller.getSnapshot().phase,'paused');assert.equal(h.controller.getSnapshot().familyPositioningStatus,'unavailable');
  const next=h.controller.send('Maya, what is your view?');await until(()=>h.playing());assert.equal(h.calls.at(-1).previousCompletedSegments,1);assert.equal(h.calls.at(-1).previousPlayback,'interrupted');assert.equal(h.playing().routed,undefined);await h.finish();await next;h.controller.dispose();
});

test('ended callback also checks graph health when a state-change event has not arrived',async()=>{
  const h=harness();await h.start();const request=h.controller.send('Morgan, please continue.');await until(()=>h.playing());h.contexts[0].state='suspended';h.playing().onended();await request;
  assert.equal(h.controller.getSnapshot().messages.at(-1).completedSegments,0);assert.equal(h.controller.getSnapshot().phase,'paused');h.controller.dispose();
});

test('enabling during ordinary playback waits for the next clip and accurately reports starting',async()=>{
  const h=harness();await h.start(false);h.parts(['First.',' Second.']);const request=h.controller.send('Maya, what matters?');await until(()=>h.playing());
  h.controller.setFamilyPositioning(true);await flush();assert.equal(h.controller.getSnapshot().familyPositioningStatus,'starting');assert.equal(h.playing().routed,undefined);
  await h.finish();assert.equal(h.controller.getSnapshot().familyPositioningStatus,'on');assert.equal(h.contexts[0].sources[0].panner.pan.value,0.25);await h.finish();await request;h.controller.dispose();
});

test('a user retries a closed unlock during centered playback without falsely claiming the active clip is positioned',async()=>{
  const h=harness();await h.start(false);h.parts(['First.',' Second.']);const request=h.controller.send('Maya, what matters?');await until(()=>h.playing());
  h.controller.setFamilyPositioning(true);await flush();h.contexts[0].transition('closed');h.controller.setFamilyPositioning(true);await flush();
  assert.equal(h.contexts.length,2);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'starting');assert.equal(h.playing().routed,undefined);
  await h.finish();assert.equal(h.contexts[1].sources[0].panner.pan.value,0.25);await h.finish();await request;h.controller.dispose();
});

test('Clear during delayed unlock closes the context and late resolution cannot revive positioning',async()=>{
  const h=harness({deferResume:true});await h.start();assert.equal(h.controller.getSnapshot().familyPositioningStatus,'starting');h.controller.clear();h.contexts[0].release();await flush();
  assert.equal(h.controller.getSnapshot().phase,'gate');assert.equal(h.controller.getSnapshot().familyPositioning,false);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'off');assert.equal(h.contexts[0].closes,1);assert.equal(h.contexts[0].sources.length,0);h.controller.dispose();
});

test('a late ended event after Clear cannot change the new encounter graph or count an abandoned clip',async()=>{
  const h=harness();await h.start();const abandoned=h.controller.send('Morgan, what matters?');await until(()=>h.playing());const lateEnded=h.playing().onended;
  h.controller.clear();await abandoned;assert.equal(h.contexts[0].closes,1);assert.ok(h.contexts[0].sources.every(source=>source.disconnected>0));await h.start();lateEnded();
  assert.equal(h.controller.getSnapshot().familyPositioningStatus,'on');assert.deepEqual(h.controller.getSnapshot().messages,[]);assert.equal(h.contexts[1].sources.length,0);h.controller.dispose();
});

test('a stalled unlock times out without delaying centered audio and its late resolution cannot route sound',async()=>{
  const h=harness({deferResume:true});await h.start();const request=h.controller.send('Morgan, what matters?');await until(()=>h.playing());assert.equal(h.playing().routed,undefined);
  const timeout=[...h.timers.values()].find(item=>item.delay===1500);assert.ok(timeout,'unlock has a bounded fallback deadline');timeout.fn();
  assert.equal(h.controller.getSnapshot().familyPositioningStatus,'unavailable');assert.equal(h.contexts[0].closes,1);h.contexts[0].release();await flush();assert.equal(h.controller.getSnapshot().familyPositioningStatus,'unavailable');
  await h.finish();await request;assert.equal(h.contexts[0].sources.length,0);assert.equal(h.controller.getSnapshot().messages.at(-1).completedSegments,1);h.controller.dispose();
});

test('End releases graphs but Retry can unlock the saved preference without changing its original speaker',async()=>{
  const h=harness();await h.start();const first=h.controller.send('Morgan, what matters?');await h.finish();await first;h.controller.end();
  assert.equal(h.contexts[0].closes,1);assert.equal(h.controller.getSnapshot().familyPositioning,true);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'off');
  h.controller.setFamilyPositioning(false);h.controller.setFamilyPositioning(true);assert.equal(h.contexts.length,1,'an ended preference toggle does not unlock sound');
  const retry=h.controller.retry(1,'Morgan, how would you like to begin?');await until(()=>h.playing());assert.equal(h.contexts.length,2);assert.equal(h.contexts[1].sources[0].panner.pan.value,-0.25);await h.finish();await retry;
  assert.equal(h.contexts[1].closes,1);assert.equal(h.calls.length,3);assert.equal(h.controller.getSnapshot().retryUsed,true);h.controller.dispose();
});

test('enabling during the first alternative clip unlocks positioning for its second clip',async()=>{
  const h=harness();await h.start(false);const original=h.controller.send('Morgan, what matters?');await h.finish();await original;h.controller.end();
  h.parts(['Alternative first sentence.',' Alternative second sentence.']);const retry=h.controller.retry(1,'Morgan, what would you like us to understand?');await until(()=>h.playing());
  assert.equal(h.contexts.length,0);h.controller.setFamilyPositioning(true);await flush();assert.equal(h.contexts.length,1);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'starting');assert.equal(h.playing().routed,undefined);
  await h.finish();assert.equal(h.controller.getSnapshot().familyPositioningStatus,'on');assert.equal(h.contexts[0].sources[0].panner.pan.value,-0.25);
  await h.finish();await retry;assert.equal(h.contexts[0].closes,1);assert.equal(h.calls.length,3);assert.equal(h.controller.getSnapshot().messages.at(-1).completedSegments,2);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'off');h.controller.dispose();
});

test('enabling immediately after ending an active alternative changes only its saved preference',async()=>{
  const h=harness();await h.start(false);const original=h.controller.send('Morgan, what matters?');await h.finish();await original;h.controller.end();
  h.parts(['Alternative first sentence.',' Alternative second sentence.']);const retry=h.controller.retry(1,'Morgan, what matters?');await until(()=>h.playing());
  h.controller.end();h.controller.setFamilyPositioning(true);assert.equal(h.contexts.length,0);await retry;
  assert.equal(h.controller.getSnapshot().familyPositioning,true);assert.equal(h.controller.getSnapshot().familyPositioningStatus,'off');assert.equal(h.controller.getSnapshot().messages.at(-1).completedSegments,0);h.controller.dispose();
});
