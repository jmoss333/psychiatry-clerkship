import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const {createStore}=require('../sp-interview.bookmarks.js');
const opening={who:'pt',text:'Can we talk?',playbackStatus:'played'};
const learner=(text,responseStatus)=>({who:'me',text,...(responseStatus?{responseStatus}:{})});
const patient=(text,playbackStatus,heardText)=>({who:'pt',text,playbackStatus,...(heardText?{heardText}:{})});
const snapshot=(transcript,phase='listening',other={})=>({phase,state:phase,transcript,...other});
const firstPending=snapshot([opening,learner('What has been difficult?','pending')],'awaiting_patient');

test('candidate uses the latest submitted learner row, never the opening or an unsubmitted draft',()=>{
  const store=createStore();
  assert.equal(store.candidate(snapshot([opening],'listening',{draft:'Unsaved question',interim:'still speaking'})),null);
  assert.deepEqual(store.candidate(firstPending),{id:1,learnerText:'What has been difficult?'});
  assert.deepEqual(store.candidate(snapshot([opening,learner('First'),patient('Reply','played'),learner('Second','pending')],'awaiting_patient',{draft:'Third draft'})),{id:2,learnerText:'Second'});
  assert.deepEqual(store.entries(),[]);
});

test('invalid candidates and turns beyond ten cannot create bookmarks',()=>{
  const store=createStore();
  for(const value of [undefined,null,{},snapshot([]),snapshot([learner('')]),snapshot([learner(42)]),snapshot([learner('Valid'),learner(null)])]){
    assert.equal(store.candidate(value),null);
    assert.deepEqual(store.add(value),{added:false,entry:null});
  }
  const ten=Array.from({length:10},(_,i)=>learner('Question '+(i+1)));
  assert.deepEqual(store.candidate(snapshot(ten)),{id:10,learnerText:'Question 10'});
  assert.equal(store.candidate(snapshot(ten.concat(learner('Question 11')))),null);
  assert.deepEqual(store.entries(),[]);
});

test('adding during response preparation is immediate and repeated clicks update one bookmark',()=>{
  const store=createStore();
  const added=store.add(firstPending);
  assert.deepEqual(added,{added:true,entry:{id:1,learnerText:'What has been difficult?',danaText:'',playbackStatus:'pending',reflection:''}});
  store.setReflection(1,'Follow this up.');
  const completed=snapshot([opening,learner('What has been difficult?'),patient('Getting up.','played')]);
  assert.deepEqual(store.add(completed),{added:false,entry:{id:1,learnerText:'What has been difficult?',danaText:'Getting up.',playbackStatus:'played',reflection:'Follow this up.'}});
  assert.equal(store.entries().length,1);
});

test('bookmarks sort by learner turn and removing or readding a moment does not change another reflection',()=>{
  const store=createStore();
  const one=[opening,learner('First'),patient('First reply','played')];
  const two=one.concat(learner('Second'),patient('Second reply','played'));
  store.add(snapshot(two));store.setReflection(2,'My second reflection');store.add(snapshot(one));
  assert.deepEqual(store.entries().map(entry=>entry.id),[1,2]);
  assert.equal(store.remove(1),true);assert.equal(store.remove(1),false);
  assert.deepEqual(store.entries().map(entry=>entry.id),[2]);
  assert.equal(store.add(snapshot(one)).added,true);
  assert.equal(store.entries()[1].reflection,'My second reflection');
});

test('Dana text expands only from a verified heard prefix to fully played exact text',()=>{
  const store=createStore();store.add(firstPending);
  const reply='I have been tired.\n\nNothing  feels easy.';
  const rows=status=>snapshot([opening,learner('What has been difficult?'),patient(reply,status,'I have been tired.')]);
  store.sync(rows('speaking'));
  assert.equal(store.entries()[0].danaText,'I have been tired.');assert.equal(store.entries()[0].playbackStatus,'speaking');
  store.sync(rows('interrupted'));assert.equal(store.entries()[0].danaText,'I have been tired.');
  store.sync(snapshot([opening,learner('What has been difficult?'),patient(reply,'played')]));
  assert.equal(store.entries()[0].danaText,reply);assert.equal(store.entries()[0].playbackStatus,'played');
});

test('unheard, mismatched, and non-prefix words never appear as completed Dana speech',()=>{
  const reply='First sentence. Second sentence.';
  for(const heardText of [undefined,'Second sentence.','first sentence.','First sentence. Second sentence. Extra',42]){
    const store=createStore();store.add(firstPending);
    store.sync(snapshot([opening,learner('What has been difficult?'),patient(reply,'interrupted',heardText)]));
    assert.equal(store.entries()[0].danaText,'');
    assert.equal(store.entries()[0].playbackStatus,'interrupted');
  }
});

test('failed and cancelled responses remain distinct and ended pending requests stop looking active',()=>{
  for(const [responseStatus,phase,expected] of [['pending','awaiting_patient','pending'],['cancelled','listening','cancelled'],['failed','ended','failed'],['pending','ended','cancelled'],[undefined,'ended','cancelled']]){
    const store=createStore();store.add(snapshot([opening,learner('A question',responseStatus)],phase));
    assert.equal(store.entries()[0].playbackStatus,expected);
    assert.equal(store.entries()[0].danaText,'');
  }
});

test('consecutive learner rows cannot steal the following question’s Dana reply',()=>{
  const store=createStore();
  const first=[opening,learner('Cancelled question','cancelled')];
  const second=first.concat(learner('Failed question','failed'));
  const third=second.concat(learner('Answered question'),patient('Only the third answer.','played'));
  store.add(snapshot(first));store.add(snapshot(second));store.add(snapshot(third));
  assert.deepEqual(store.entries().map(({id,danaText,playbackStatus})=>({id,danaText,playbackStatus})),[
    {id:1,danaText:'',playbackStatus:'cancelled'},
    {id:2,danaText:'',playbackStatus:'failed'},
    {id:3,danaText:'Only the third answer.',playbackStatus:'played'},
  ]);
});

test('ending during unfinished playback preserves only its confirmed prefix and marks it interrupted',()=>{
  const store=createStore();store.add(firstPending);
  store.sync(snapshot([opening,learner('What has been difficult?'),patient('First. Second.','speaking','First.')],'ended'));
  assert.equal(store.entries()[0].playbackStatus,'interrupted');assert.equal(store.entries()[0].danaText,'First.');
});

test('reflection edits are bounded, accept blank text, and reject unknown or noninteger ids',()=>{
  const store=createStore();store.add(firstPending);
  assert.equal(store.setReflection(1,'x'.repeat(1201)),true);assert.equal(store.entries()[0].reflection,'x'.repeat(1200));
  assert.equal(store.setReflection(1,''),true);assert.equal(store.entries()[0].reflection,'');
  for(const id of [0,11,1.5,'1',NaN,null,2]){
    assert.equal(store.setReflection(id,'Wrong bookmark'),false);assert.equal(store.remove(id),false);
  }
  assert.equal(store.setReflection(1,{text:'Not a reflection'}),false);
  assert.equal(store.entries()[0].reflection,'');
});

test('snapshots and returned bookmark copies cannot mutate each other',()=>{
  const store=createStore();
  const source=snapshot([Object.freeze({...opening}),Object.freeze(learner('Exact question')),Object.freeze(patient('Exact\n\nanswer','played'))]);
  Object.freeze(source.transcript);Object.freeze(source);
  const before=JSON.stringify(source),result=store.add(source);
  result.entry.danaText='Mutated result';store.entries()[0].learnerText='Mutated list';
  const synced=store.sync(source);synced[0].reflection='Mutated sync result';
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(store.entries(),[{id:1,learnerText:'Exact question',danaText:'Exact\n\nanswer',playbackStatus:'played',reflection:''}]);
  store.sync(snapshot([opening,learner('Different encounter question'),patient('Wrong answer','played')]));
  assert.equal(store.entries()[0].danaText,'Exact\n\nanswer');
});

test('clear is final for existing marks even if a late snapshot arrives, and stores are independent',()=>{
  const store=createStore(),other=createStore();store.add(firstPending);other.add(firstPending);
  store.clear();store.sync(snapshot([opening,learner('What has been difficult?'),patient('Late reply','played')]));
  assert.deepEqual(store.entries(),[]);assert.equal(other.entries().length,1);
  assert.equal(store.setReflection(1,'Late reflection'),false);
});

test('browser export operates without networking, storage, capture, or DOM access',()=>{
  const window={};
  for(const key of ['fetch','localStorage','sessionStorage','document','SpeechRecognition'])Object.defineProperty(window,key,{get(){assert.fail('Bookmark model touched '+key);}});
  const context=vm.createContext({window});
  vm.runInContext(readFileSync(new URL('../sp-interview.bookmarks.js',import.meta.url),'utf8'),context);
  const store=window.SPInterviewBookmarks.createStore();store.add(firstPending);store.setReflection(1,'A local thought');store.sync(firstPending);
  assert.equal(store.entries()[0].reflection,'A local thought');store.clear();assert.equal(store.entries().length,0);
});
