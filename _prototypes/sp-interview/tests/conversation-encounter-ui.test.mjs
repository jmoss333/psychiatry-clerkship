import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createClock,clockText,exchangesFrom,exchangesForReview,interruptedFamilyEvent}=require('../sp-encounter-ui.js');

test('practice time accrues only while running, accommodates pauses, and never forces a stop',()=>{
  let now=0;const clock=createClock(()=>now);
  clock.setMinutes(8);clock.setRunning(true);now=125000;
  assert.equal(clockText(clock.read()),'5:55 remaining');
  clock.setRunning(false);now+=900000;
  assert.equal(clock.read().elapsed,125000);
  clock.extend(2);assert.equal(clockText(clock.read()),'7:55 remaining');
  clock.setRunning(true);now+=500000;
  assert.equal(clock.read().expired,true);assert.equal(clock.read().running,true);
  assert.match(clockText(clock.read()),/continue at your pace/);
  clock.extend(2);assert.equal(clock.read().expired,false);
});

test('untimed practice stays untimed and timer reset preserves the chosen duration',()=>{
  let now=0;const clock=createClock(()=>now);clock.setRunning(true);now+=600000;
  assert.equal(clock.read().elapsed,0);assert.equal(clockText(clock.read()),'Untimed practice');
  clock.extend(2);assert.equal(clock.read().duration,0);
  clock.setMinutes(1);clock.setRunning(true);now+=10000;clock.reset();
  assert.deepEqual(clock.read(),{duration:60000,elapsed:0,remaining:60000,running:false,expired:false});
});

test('reflection preserves exact learner words and only completed or verified heard patient text',()=>{
  const transcript=[
    {who:'pt',text:'Opening',playbackStatus:'played'},
    {who:'me',text:'You want to keep your choices?'},
    {who:'pt',text:'Yes. And I do not know yet.',playbackStatus:'interrupted',heardText:'Yes.'},
    {who:'me',text:'What matters to you?'},
    {who:'pt',text:'Invented full reply',playbackStatus:'failed',heardText:'Does not match'},
    {who:'me',text:'May I check my understanding?'},
    {who:'pt',text:'Please do.',playbackStatus:'played'}
  ];
  const before=JSON.stringify(transcript), result=exchangesFrom({transcript,roleId:'morgan'});
  assert.equal(JSON.stringify(transcript),before);
  assert.equal(result[0].learnerText,'You want to keep your choices?');
  assert.deepEqual(result[0].replies,[{roleId:'morgan',text:'Yes.',status:'completed'}]);
  assert.deepEqual(result[1].replies,[]);
  assert.deepEqual(result[2].replies,[{roleId:'morgan',text:'Please do.',status:'completed'}]);
});

test('family reflection follows exact turn and role IDs across public and private channels',()=>{
  const result=exchangesFrom({events:[
    {kind:'learner',turnId:1,text:'What matters to each of you?',channel:'public'},
    {kind:'segment',turnId:1,roleId:'morgan',text:'Keeping my choices.',status:'completed'},
    {kind:'segment',turnId:1,roleId:'morgan',text:'And showing up.',status:'completed'},
    {kind:'segment',turnId:1,roleId:'maya',text:'Unheard answer.',status:'interrupted'},
    {kind:'learner',turnId:2,text:'What is hard to say together?',channel:'maya-private'},
    {kind:'segment',turnId:2,roleId:'maya',text:'I worry about setting a limit.',status:'completed'},
    {kind:'transition',text:'Rejoined',channel:'public'},
    {kind:'segment',turnId:3,roleId:'morgan',text:'Orphaned segment',status:'completed'}
  ]});
  assert.equal(result.length,2);assert.equal(result[1].channel,'maya-private');
  assert.deepEqual(result[0].replies,[{roleId:'morgan',text:'Keeping my choices. And showing up.',status:'completed'}]);
  assert.deepEqual(result[1].replies,[{roleId:'maya',text:'I worry about setting a limit.',status:'completed'}]);
});

test('public reflection excludes private exchanges while a private review remains explicitly scoped',()=>{
  const snapshot={events:[
    {kind:'learner',turnId:1,text:'Public question',channel:'public'},
    {kind:'segment',turnId:1,roleId:'morgan',text:'Public reply',status:'completed'},
    {kind:'learner',turnId:2,text:'Private question',channel:'maya-private'},
    {kind:'segment',turnId:2,roleId:'maya',text:'Private reply',status:'completed'}
  ]};
  assert.deepEqual(exchangesForReview(snapshot,'public').map(exchange=>exchange.id),['1']);
  assert.deepEqual(exchangesForReview(snapshot,'maya-private').map(exchange=>exchange.id),['2']);
  assert.deepEqual(exchangesForReview(snapshot,'morgan-private'),[]);
});

test('family interruption cues derive only from an interrupted segment in the active channel',()=>{
  const publicEvent={id:'e1',kind:'segment',roleId:'morgan',status:'interrupted',channel:'public'};
  const privateEvent={id:'e2',kind:'segment',roleId:'maya',status:'interrupted',channel:'maya-private'};
  const pendingEvent={id:'e3',kind:'segment',roleId:'morgan',status:'pending',channel:'public'};
  const snapshot={events:[publicEvent,privateEvent,pendingEvent],channel:'public'};
  assert.deepEqual(interruptedFamilyEvent(snapshot),publicEvent);
  assert.deepEqual(interruptedFamilyEvent({...snapshot,channel:'maya-private'}),privateEvent);
  assert.equal(interruptedFamilyEvent({...snapshot,channel:'morgan-private'}),null);
});
