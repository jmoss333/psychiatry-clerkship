import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const html = readFileSync(new URL('../14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html', import.meta.url),'utf8');
const engine = html.match(/<script id="pft-engine">([\s\S]*?)<\/script>/);
assert.ok(engine, 'pure engine exists');
const P = new Function(engine[1]+';return {valid:pftValidSelection,parse:pftParseSelection,reduce:pftReduce,render:pftRender};')();
const data = JSON.parse(html.match(/<script id="pft-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const blank = () => ({task:null,minutes:null,step:'choose',exampleOpen:false,error:''});
test('all explicit pairs work and coercion is rejected',()=>{
  for(const task of ['interview','rounds','note']) for(const minutes of [5,15]) assert.equal(P.valid(task,minutes),true);
  for(const pair of [['other',5],['note','15'],['note',10],[null,5],['note',NaN]]) assert.equal(P.valid(...pair),false);
});
test('URLs accept one literal pair, empty is clean, malformed is a useful chooser',()=>{
  assert.deepEqual(P.parse(''),{task:null,minutes:null,error:''});
  assert.deepEqual(P.parse('?prepareTask=note&prepareMinutes=15'),{task:'note',minutes:15,error:''});
  for(const query of ['?prepareTask=note','?prepareMinutes=15','?prepareTask=note&prepareTask=rounds&prepareMinutes=15','?prepareTask=note&prepareMinutes=15&prepareMinutes=5','?prepareTask=note&prepareMinutes=015','?prepareTask=other&prepareMinutes=5']) assert.deepEqual(P.parse(query),{task:null,minutes:null,error:'Choose a task and time to begin.'});
});
test('no implicit choice and rejected starts preserve chooser',()=>{
  const state=P.reduce(data,blank(),{type:'start'});
  assert.equal(state.step,'choose'); assert.ok(state.error); assert.equal(state.task,null);
  assert.equal(P.reduce(data,{...state,task:'note'},{type:'start'}).step,'choose');
});
test('six independently complete journeys, private rehearsal, deliberate reveal and neutral finish',()=>{
  for(const task of ['interview','rounds','note']) for(const minutes of [5,15]) {
    let state=P.reduce(data,blank(),{type:'task',value:task});
    state=P.reduce(data,state,{type:'minutes',value:minutes});
    state=P.reduce(data,state,{type:'start'}); assert.equal(state.step,'read');
    assert.ok(P.render(data,state).includes(data.tasks[task].routes[minutes].reading.heading));
    state=P.reduce(data,state,{type:'next'}); assert.equal(state.step,'rehearse');
    assert.equal(state.exampleOpen,false); assert.doesNotMatch(P.render(data,state),/<details[^>]* open/);
    state=P.reduce(data,state,{type:'example'}); assert.equal(state.exampleOpen,true);
    assert.match(P.render(data,state),/<details[^>]* open/);
    state=P.reduce(data,state,{type:'next'}); assert.equal(state.step,'card');
    for(const key of ['try','notice','ask']) assert.ok(P.render(data,state).replace(/&#39;/g,"'").includes(data.tasks[task].routes[minutes].card[key]));
    state=P.reduce(data,state,{type:'next'}); assert.equal(state.step,'done');
    assert.match(P.render(data,state),/Preparation finished/);
    assert.deepEqual(Object.keys(state).sort(),['error','exampleOpen','minutes','step','task']);
    assert.deepEqual(P.reduce(data,state,{type:'reset'}),blank());
  }
});
test('changing task or duration closes example and returns to choice',()=>{
  for(const action of [{type:'task',value:'rounds'},{type:'minutes',value:5}]) {
    const state=P.reduce(data,{...blank(),task:'note',minutes:15,step:'rehearse',exampleOpen:true},action);
    assert.equal(state.step,'choose'); assert.equal(state.exampleOpen,false);
  }
});
test('missing teaching fields reject starting rather than silently shrinking the exercise',()=>{
  for(const path of [['reading','heading'],['reading','paragraphs'],['reading','sourceRef'],['reading','sourceSection'],['rehearsal','snapshot'],['rehearsal','prompt'],['rehearsal','example'],['rehearsal','reflection'],['card','try'],['card','notice'],['card','ask']]) {
    const broken=structuredClone(data); delete broken.tasks.note.routes['15'][path[0]][path[1]];
    const state=P.reduce(broken,{...blank(),task:'note',minutes:15},{type:'start'});
    assert.equal(state.step,'choose'); assert.match(state.error,/unavailable/i);
  }
});
test('teaching strings are rendered as text',()=>{
  const modified=structuredClone(data); modified.tasks.note.routes['5'].rehearsal.example='<img src=x onerror="alert(1)"> & \'quoted\'';
  const rendered=P.render(modified,{...blank(),task:'note',minutes:5,step:'rehearse',exampleOpen:true});
  assert.doesNotMatch(rendered,/<img/); assert.match(rendered,/&lt;img/); assert.match(rendered,/&amp;/);
});
