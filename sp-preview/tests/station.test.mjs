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
