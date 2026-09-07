import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
// The station ships as a classic browser script, loaded the way app.js is.
const stationModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station.js',import.meta.url),'utf8')+'\n})',{filename:'station.js'})(stationModule,stationModule.exports);
const {stationSnapshot}=stationModule.exports;

const hosted=(messages,phase='listening',extra={})=>({phase,turn:messages.filter(m=>m.role==='you').length,messages,draft:'',interim:'',error:'',voice:true,thinking:false,hold:false,busy:false,restartRequired:false,...extra});
const dana=(text,status,segments,completedSegments)=>({role:'dana',text,status,segments,completedSegments,totalSegments:segments.length});
const you=(text,status='submitted')=>({role:'you',text,status});

test('phases map onto the station vocabulary exhaustively',()=>{
  const pairs=[['gate','idle'],['ready','paused'],['connecting','starting'],['listening','listening'],['responding','awaiting_patient'],['speaking','speaking'],['paused','paused'],['restart','error'],['ended','ended']];
  for(const [from,to] of pairs)assert.equal(stationSnapshot(hosted([],from)).phase,to,from);
});

test('a played reply carries its full text and no heard prefix',()=>{
  const snapshot=stationSnapshot(hosted([dana('Hello. And more.','played',['Hello.',' And more.'],2)]));
  assert.deepEqual(snapshot.transcript,[{who:'pt',text:'Hello. And more.',playbackStatus:'played'}]);
});

test('an interrupted reply exposes the heard prefix and never the unheard tail',()=>{
  const snapshot=stationSnapshot(hosted([dana('Hello. And more.','interrupted',['Hello.',' And more.'],1)]));
  assert.deepEqual(snapshot.transcript,[{who:'pt',text:'Hello. And more.',playbackStatus:'interrupted',heardText:'Hello.'}]);
});

test('an interrupted reply with nothing completed carries no heard text at all',()=>{
  const snapshot=stationSnapshot(hosted([dana('Hello. And more.','interrupted',['Hello.',' And more.'],0)]));
  assert.equal(snapshot.transcript[0].heardText,undefined);
});

test('a preparing reply reads as pending, and learner rows carry their request status',()=>{
  const snapshot=stationSnapshot(hosted([you('A question','pending'),dana('...','preparing',['...'],0)],'responding'));
  assert.equal(snapshot.transcript[0].who,'me');
  assert.equal(snapshot.transcript[0].responseStatus,'pending');
  assert.equal(snapshot.transcript[1].playbackStatus,'pending');
  assert.equal(snapshot.phase,'awaiting_patient');
});

test('an unconfirmed learner request is reported as failed, not silently submitted',()=>{
  const snapshot=stationSnapshot(hosted([you('A question','unconfirmed')],'restart',{restartRequired:true}));
  assert.equal(snapshot.transcript[0].responseStatus,'failed');
  assert.equal(snapshot.phase,'error');
});

const {createBookmarkStore}=stationModule.exports;

test('a bookmark takes the latest submitted question, never a draft, and is idempotent',()=>{
  const store=createBookmarkStore();
  assert.equal(store.candidate(stationSnapshot(hosted([],'listening',{draft:'Unsent'}))),null);
  const one=stationSnapshot(hosted([you('What has been hardest?','pending')],'responding'));
  assert.deepEqual(store.candidate(one),{id:1,learnerText:'What has been hardest?'});
  assert.equal(store.add(one).added,true);
  assert.equal(store.add(one).added,false,'the same moment is not bookmarked twice');
  assert.equal(store.entries().length,1);
});

test('a bookmark on an interrupted reply quotes only the heard prefix',()=>{
  const store=createBookmarkStore();
  const pending=stationSnapshot(hosted([you('A question','pending'),dana('Heard part. Unheard tail.','preparing',['Heard part.',' Unheard tail.'],0)],'speaking'));
  store.add(pending);
  assert.equal(store.entries()[0].danaText,'');
  const settled=stationSnapshot(hosted([you('A question'),dana('Heard part. Unheard tail.','interrupted',['Heard part.',' Unheard tail.'],1)],'listening'));
  store.sync(settled);
  assert.equal(store.entries()[0].danaText,'Heard part.');
  assert.equal(store.entries()[0].playbackStatus,'interrupted');
  assert.equal(store.entries()[0].danaText.includes('Unheard tail'),false);
});

test('a played reply is quoted in full and a reflection is capped at 1200 characters',()=>{
  const store=createBookmarkStore();
  const snapshot=stationSnapshot(hosted([you('A question'),dana('All of it.','played',['All of it.'],1)],'listening'));
  store.add(snapshot);
  assert.equal(store.entries()[0].danaText,'All of it.');
  assert.equal(store.setReflection(1,'x'.repeat(2000)),true);
  assert.equal(store.entries()[0].reflection.length,1200);
  assert.equal(store.setReflection(99,'nope'),false);
});

test('a bookmark is dropped rather than re-pointed when the encounter is cleared',()=>{
  const store=createBookmarkStore();
  store.add(stationSnapshot(hosted([you('First question')],'responding')));
  // A new encounter reuses turn number 1 with different words.
  store.sync(stationSnapshot(hosted([you('A different first question')],'responding')));
  assert.equal(store.entries()[0].danaText,'','a turn number from another encounter must not supply the quote');
  store.clear();
  assert.deepEqual(store.entries(),[]);
});

test('an unanswered question left pending at the end reads as cancelled',()=>{
  const store=createBookmarkStore();
  const live=stationSnapshot(hosted([you('A question','pending')],'responding'));
  store.add(live);
  store.sync(stationSnapshot(hosted([you('A question','pending')],'ended')));
  assert.equal(store.entries()[0].playbackStatus,'cancelled');
});
