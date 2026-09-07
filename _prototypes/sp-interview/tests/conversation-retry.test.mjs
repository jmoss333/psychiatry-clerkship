import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {moments,mount}=require('../sp-interview.retry.js');

test('retry choices require a server-eligible question and following reply, prefer heard replies, and never change the original',()=>{
  const snapshot=Object.freeze({transcript:Object.freeze([
    Object.freeze({who:'pt',text:'Opening',playbackStatus:'played'}),
    Object.freeze({who:'me',text:'First question'}),
    Object.freeze({who:'pt',text:'First reply. More words.',playbackStatus:'interrupted',heardText:'First reply.'}),
    Object.freeze({who:'me',text:'Cancelled question',responseStatus:'cancelled'}),
    Object.freeze({who:'me',text:'Third question'}),
    Object.freeze({who:'pt',text:'Third reply',playbackStatus:'played'}),
    Object.freeze({who:'me',text:'Fourth question'}),
    Object.freeze({who:'pt',text:'Not eligible',playbackStatus:'played'}),
  ])});
  const before=JSON.stringify(snapshot),choices=moments(snapshot,[1,2,'3']);
  assert.deepEqual(choices.map(choice=>choice.turnId),['3',1]);
  assert.equal(choices[1].heardText,'First reply.');
  assert.equal(choices[1].question,'First question');
  choices[0].question='Changed comparison';
  assert.equal(JSON.stringify(snapshot),before);
  assert.deepEqual(moments(snapshot,[]),[]);
});

function mountedRetry(createRetry,overrides={}){
  const nodes=new Map(),listeners=new Map(),captures=[],speeches=[],requests=[],availability=[];
  const doc={hidden:false,activeElement:null,createElement:node,createTextNode:text=>({textContent:text}),
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  function node(tag){return {tagName:tag.toUpperCase(),value:'',disabled:false,hidden:false,textContent:'',children:[],
    appendChild(child){this.children.push(child);if(tag==='select'&&this.children.length===1)this.value=child.value;return child;},
    replaceChildren(...children){this.children=children;},setAttribute(name,value){this[name]=value;},focus(){doc.activeElement=this;}};}
  const host={querySelector:selector=>nodes.get(selector.slice(1)),set innerHTML(html){
    for(const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"/g))nodes.set(match[2],node(match[1]));
  }};
  const original={thinkingTime:false,transcript:[
    {who:'pt',text:'Opening',playbackStatus:'played'},
    {who:'me',text:'First question'},{who:'pt',text:'First reply. More words.',playbackStatus:'interrupted',heardText:'First reply.'},
    {who:'me',text:'Cancelled question',responseStatus:'cancelled'},
    {who:'me',text:'Third question'},{who:'pt',text:'Third reply.',playbackStatus:'played'},
  ]};
  const child={start:async()=>{},end(){},respond(text){requests.push(text);return {reply:'Alternative reply.'};},
    speak(args){speeches.push(args);return {stop(){}};}};
  const selected=[];
  const view=mount({env:{document:doc,SPInterviewTurns:overrides.turns||require('../sp-interview.turns.js')},container:host,originalSnapshot:original,retryTurnIds:[1,2,3],displayName:overrides.displayName,
    createRetry(id){selected.push(id);return createRetry?createRetry(id,child):Promise.resolve({client:child,sourceTurnId:id});},
    createInput(callbacks){captures.push(callbacks);return {start(){callbacks.onReady();},stop(){}};},
    createBridge(options){return overrides.createBridge?overrides.createBridge(options):{input:options.createInput,speak:options.speak,interrupt:options.interrupt};},
    onAvailabilityChange(){availability.push(true);},
  });
  return {view,doc,nodes,original,selected,captures,speeches,requests,availability,
    visibility(value){doc.hidden=value;listeners.get('visibilitychange')?.();}};
}

test('direct retry selects the exact eligible exchange despite heard-first ordering and has no fallback',async(t)=>{
  const h=mountedRetry();t.after(()=>h.view.dispose());
  assert.equal(h.view.canStartAt(2),false);assert.equal(await h.view.startAt(2),false);
  assert.equal(await h.view.startAt(99),false);assert.deepEqual(h.selected,[]);
  const original=JSON.stringify(h.original);
  assert.equal(await h.view.startAt(1),true);
  assert.deepEqual(h.selected,[1]);assert.equal(h.nodes.get('retry-moment').value,'1');
  assert.equal(h.nodes.get('retry-original-question').textContent,'You: First question');
  assert.equal(h.view.getSnapshot().phase,'listening');assert.equal(h.captures.length,1);
  assert.equal(h.doc.activeElement,h.nodes.get('retry-status'));
  assert.equal(JSON.stringify(h.original),original);
});

test('pending setup and an existing alternative block every additional start',async(t)=>{
  let release;const h=mountedRetry((id,child)=>new Promise(resolve=>{release=()=>resolve({client:child,sourceTurnId:id});}));
  t.after(()=>h.view.dispose());
  const pending=h.view.startAt(3);
  assert.equal(h.view.canStartAt(1),false);assert.equal(h.view.canStartAt(3),false);
  assert.equal(await h.view.startAt(1),false);assert.equal(await h.view.startAt(3),false);
  assert.equal(h.nodes.get('retry-moment').disabled,true);
  release();assert.equal(await pending,true);
  assert.equal(await h.view.startAt(1),false);assert.equal(await h.view.startAt(3),false);
  h.captures[0].onResult({text:'One alternative question.',final:true,resultId:'one'});
  h.nodes.get('retry-done').onclick();await Promise.resolve();h.speeches[0].onEnded();
  assert.equal(h.view.getSnapshot().phase,'ended');assert.equal(await h.view.startAt(3),false);
  assert.deepEqual(h.selected,[3]);assert.deepEqual(h.requests,['One alternative question.']);
});

test('failed setup permits only the same exchange through bookmark or ordinary start controls',async(t)=>{
  let attempts=0;const h=mountedRetry((id,child)=>++attempts===1?Promise.reject(new Error('Try setup again')):Promise.resolve({client:child,sourceTurnId:id}));
  t.after(()=>h.view.dispose());
  assert.equal(await h.view.startAt(1),false);
  assert.equal(h.view.canStartAt(1),true);assert.equal(h.view.canStartAt(3),false);
  assert.equal(h.view.availabilityAt(1).reason,'setup_failed');
  assert.equal(await h.view.startAt(3),false);
  h.nodes.get('retry-moment').value='0'; // A stale or synthetic selection must not replace the locked question.
  await h.nodes.get('retry-start').onclick();
  assert.deepEqual(h.selected,[1,1]);assert.equal(h.nodes.get('retry-original-question').textContent,'You: First question');
  assert.equal(h.nodes.get('retry-moment').value,'1');assert.ok(h.availability.length>=3);
});

test('hidden and disposed retry views cannot start from bookmarks or ordinary controls',async()=>{
  const h=mountedRetry();h.visibility(true);
  assert.equal(h.view.canStartAt(1),false);assert.equal(await h.view.startAt(1),false);
  await h.nodes.get('retry-start').onclick();assert.deepEqual(h.selected,[]);
  h.visibility(false);assert.equal(h.view.canStartAt(1),true);
  h.view.dispose();assert.equal(h.view.canStartAt(1),false);assert.equal(await h.view.startAt(1),false);
  assert.deepEqual(h.selected,[]);assert.equal(h.captures.length,0);
});

for(const failureAt of ['child start','bridge creation','controller creation'])test('setup recovery reuses its one child after '+failureAt+' fails before a controller exists',async(t)=>{
  let ends=0,starts=0,bridges=0,controllers=0;
  const realTurns=require('../sp-interview.turns.js');
  const h=mountedRetry((id,child)=>{
    child.end=()=>{ends++;};
    child.start=async()=>{starts++;if(failureAt==='child start'&&starts===1)throw new Error('Temporary setup failure');};
    return Promise.resolve({client:child,sourceTurnId:id});
  },{
    createBridge(options){if(++bridges===1&&failureAt==='bridge creation')throw new Error('Temporary setup failure');return {input:options.createInput,speak:options.speak,interrupt:options.interrupt};},
    turns:{createController(options){if(++controllers===1&&failureAt==='controller creation')throw new Error('Temporary setup failure');return realTurns.createController(options);}},
  });
  t.after(()=>h.view.dispose());
  assert.equal(await h.view.startAt(1),false);
  assert.equal(h.view.availabilityAt(1).reason,'setup_failed');assert.equal(h.view.canStartAt(1),true);
  assert.equal(ends,0,'recoverable setup must not delete the server’s one cached child');assert.equal(h.captures.length,0);
  assert.equal(await h.view.startAt(3),false);
  h.visibility(true);assert.equal(await h.view.startAt(1),false);h.visibility(false);
  assert.equal(await h.view.startAt(1),true);
  assert.deepEqual(h.selected,[1],'recovery must not call createRetry again');assert.equal(starts,2);
  assert.equal(h.view.getSnapshot().phase,'listening');assert.equal(h.captures.length,1);
  h.captures[0].onResult({text:'One recovered alternative.',final:true,resultId:'one'});
  h.nodes.get('retry-done').onclick();await Promise.resolve();h.speeches[0].onEnded();
  assert.deepEqual(h.requests,['One recovered alternative.']);assert.equal(await h.view.startAt(1),false);
});

test('an exception after controller creation stops setup and is terminal without claiming the alternative started',async(t)=>{
  let ended=0,childEnded=0,started=0;
  const h=mountedRetry((id,child)=>{child.end=()=>{childEnded++;};return Promise.resolve({client:child,sourceTurnId:id});},{turns:{
    createController(options){
      const controller=require('../sp-interview.turns.js').createController(options),end=controller.end,start=controller.start;
      return {...controller,setThinkingTime(){throw new Error('Controller setup failed');},start(){started++;return start();},end(){ended++;return end();}};
    },
  }});
  t.after(()=>h.view.dispose());
  assert.equal(await h.view.startAt(1),false);
  assert.equal(h.view.availabilityAt(1).reason,'setup_failed_terminal');assert.equal(h.view.canStartAt(1),false);
  assert.equal(ended,1);assert.equal(childEnded,1);assert.equal(started,0);assert.equal(h.captures.length,0);
  assert.equal(h.view.getSnapshot().phase,'ended');assert.equal(h.view.getSnapshot().turnCount,0);
  assert.match(h.nodes.get('retry-status').textContent,/setup failed.*microphone off/i);
  assert.equal(h.nodes.get('retry-controls').hidden,true);assert.equal(h.doc.activeElement,h.nodes.get('retry-status'));
  assert.equal(await h.view.startAt(1),false);assert.equal(await h.view.startAt(3),false);assert.deepEqual(h.selected,[1]);
});

for(const displayName of ['Marcus','Ray','Morgan'])test(displayName+' retry labels and spoken-turn statuses keep the selected patient identity',async(t)=>{
  const h=mountedRetry(null,{displayName});t.after(()=>h.view.dispose());
  assert.equal(h.nodes.get('retry-original-reply').textContent,displayName+': Third reply.');
  assert.equal(await h.view.startAt(1),true);
  h.captures[0].onResult({text:'Could you tell me more?',final:true,resultId:'one'});
  h.nodes.get('retry-done').onclick();await Promise.resolve();
  assert.equal(h.nodes.get('retry-status').textContent,displayName+' is speaking');
  assert.equal(h.nodes.get('retry-alternative').children.at(-1).textContent,displayName+': Alternative reply.');
  h.speeches[0].onError(new Error('Audio unavailable'));
  assert.match(h.nodes.get('retry-error').textContent,new RegExp(displayName+'’s alternative reply: Alternative reply.'));
  assert.doesNotMatch(h.nodes.get('retry-error').textContent,/Dana/);
});
