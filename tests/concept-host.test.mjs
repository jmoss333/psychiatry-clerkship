import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js',import.meta.url),'utf8');
const reply=new Function(src+';return typeof fdConceptWeekContext === "function" ? fdConceptWeekContext : null')();
test('host grants only exact origin, live review window, strict nonce and active projected week',()=>{
  assert.equal(typeof reply,'function');
  const source={},frame={contentWindow:source},origin='https://example.test';
  const state={openId:'review.html',week:2,viewWeek:1};
  const index={weeks:[{n:1,items:[{ref:'wrong.md'}]},{n:2,items:[{ref:'curated.md'},{ref:'review.html'}]}]};
  const event={origin,source,data:{type:'cw:concept-week-request',nonce:'a'.repeat(32)}};
  assert.deepEqual(reply(event,origin,frame,state,index,false),{type:'cw:concept-week-context',nonce:'a'.repeat(32),week:2,refs:['curated.md','review.html']});
  for(const bad of [{...event,origin:'https://evil.test'},{...event,source:{}},{...event,data:{...event.data,nonce:'bad'}},{...event,data:{...event.data,extra:true}}]) assert.equal(reply(bad,origin,frame,state,index,false),null);
  assert.equal(reply(event,origin,frame,state,index,true),null);
  assert.equal(reply(event,origin,frame,{...state,openId:'other.html'},index,false),null);
  assert.equal(reply(event,origin,frame,{...state,week:7},index,false),null);
});

const shell=readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html',import.meta.url),'utf8');
const helpers=readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/concept_recall.js',import.meta.url),'utf8');
const loader=shell.slice(shell.indexOf('var conceptDueState='),shell.indexOf('  function srsState('));
test('shell feed state is unknown during loading and unavailable after invalid bytes',async()=>{
 const fixture=new Function('fetch','document',helpers+loader+';return {load:loadConceptDue,state:()=>conceptDueState}')(
   async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('{}').buffer}),
   {querySelectorAll:()=>[{content:'a'.repeat(64)}]});
 assert.equal(fixture.state().status,'checking');
 assert.equal(fixture.state().releasedIds,null);
 await fixture.load();
 assert.equal(fixture.state().status,'unavailable');
 assert.equal(fixture.state().releasedIds,null);
});

test('shell stalled fetch becomes actionable unavailable within the shared bound',async()=>{
 let aborted=false;
 const make=new Function('fetch','document','setTimeout',helpers+loader+';return {load:loadConceptDue,state:()=>conceptDueState}');
 const fixture=make((url,options)=>{options.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});},{querySelectorAll:()=>[{content:'a'.repeat(64)}]},fn=>setTimeout(fn,5));
 await Promise.race([fixture.load(),new Promise((resolve,reject)=>setTimeout(()=>reject(Error('shell request did not settle')),100))]);
 assert.equal(fixture.state().status,'unavailable');assert.equal(aborted,true);
});
