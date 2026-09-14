import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
// The shipped browser file is a classic script; loaded the same way client.test.mjs does.
const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {roomView,renderRoom}=clientModule.exports;
const stationModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8')+'\n})',{filename:'station-content.js'})(stationModule,stationModule.exports);
const family=stationModule.exports.getProfile('family_morgan_maya_001'),dana=stationModule.exports.getProfile('sp_depression_gated_si_001');
const base={caseId:'family_morgan_maya_001',phase:'listening',turn:1,messages:[{role:'dana',speakerId:'morgan',text:'I want a say in what happens next.',status:'played'}],draft:'',interim:'',targetRoleId:'morgan',activeSpeakerId:null,familyBid:null,roomCue:null,busy:false,hold:false,spokenInterrupt:false,restartRequired:false,mode:'full'};
const seat=(view,id)=>view.seats.find(s=>s.id===id);

test('seating is canonical: Morgan left, Maya right, pronouns from the profile, no dialogue-derived identity',()=>{
  const view=roomView(base,family);
  assert.deepEqual(view.seats.map(s=>[s.id,s.name,s.pronouns]),[['morgan','Morgan','they/them'],['maya','Maya','she/her']]);
  assert.equal(roomView({...base,caseId:'sp_depression_gated_si_001'},dana).seats.length,1);
  assert.equal(roomView({...base,caseId:'sp_depression_gated_si_001'},dana).seats[0].name,'Dana');
});
test('speaking, next, preparing and interrupted are distinct per seat',()=>{
  const speaking=roomView({...base,phase:'speaking',activeSpeakerId:'maya',messages:[...base.messages,{role:'dana',speakerId:'maya',text:'Could we talk about Sundays?',status:'pending'}]},family);
  assert.equal(seat(speaking,'maya').turn,'speaking');assert.equal(seat(speaking,'morgan').turn,'idle');
  assert.equal(speaking.caption.label,'Maya');assert.equal(speaking.caption.text,'Could we talk about Sundays?');
  const listening=roomView(base,family);
  assert.equal(seat(listening,'morgan').turn,'next');assert.equal(seat(listening,'morgan').tag,'Answers next');assert.ok(listening.micOn);
  const preparing=roomView({...base,phase:'responding',busy:true,targetRoleId:'maya'},family);
  assert.equal(seat(preparing,'maya').turn,'preparing');assert.equal(preparing.caption.kind,'preparing');
  const interrupted=roomView({...base,messages:[{role:'dana',speakerId:'morgan',text:'I want a say',status:'interrupted',completedSegments:1}]},family);
  assert.equal(seat(interrupted,'morgan').turn,'interrupted');assert.equal(interrupted.caption.kind,'interrupted');
  assert.equal(interrupted.observation,family.cues.interrupted);
});
test('a family bid, a faculty cue, pause and end are shown from authored text only',()=>{
  const bid=roomView({...base,familyBid:{speakerId:'maya',text:'Could I add something?'}},family);
  assert.equal(seat(bid,'maya').turn,'bidding');assert.equal(bid.caption.text,'Could I add something?');
  const knock=roomView({...base,phase:'paused',roomCue:{id:'door_knock',text:'A brief knock at the closed door. No one enters.',turn:2}},family);
  assert.equal(knock.cue,'door_knock');assert.equal(knock.caption.kind,'cue');
  assert.equal(roomView({...base,phase:'paused',roomCue:{id:'door_knock',text:'x',turn:1}},family).cue,'','a cue is not replayed once its turn has been sent');
  const paused=roomView({...base,phase:'paused'},family);assert.equal(paused.caption.kind,'quiet');assert.ok(!paused.micOn);
  const ended=roomView({...base,phase:'ended'},family);assert.equal(ended.caption.text,family.cues.closing);assert.equal(seat(ended,'maya').turn,'ended');
});
test('the DOM writer tolerates a page without the room and never injects styles',()=>{
  renderRoom({getElementById:()=>null},roomView(base,family));
  const nodes={};const doc={getElementById:id=>nodes[id]||(nodes[id]={textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelector(){return null;}})};
  renderRoom(doc,roomView(base,family));
  assert.equal(nodes['room-a-name'].textContent,'Morgan');assert.equal(nodes['room-view'].attributes['data-seats'],'2');assert.equal(nodes['room-mic'].attributes['data-mic'],'on');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const room=html.slice(html.indexOf('<section class="room-view"'),html.indexOf('</section>',html.indexOf('<section class="room-view"')));
  assert.ok(room.length>500,'room markup ships in index.html');
  assert.doesNotMatch(room,/ style=/,'style-src is self: no inline style attributes');
  const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  for(const rule of ['.room-view','.room-seat[data-turn="speaking"] .room-halo','.room-view[data-seats="1"]','@keyframes room-halo'])assert.ok(css.includes(rule),rule);
  assert.match(css,/prefers-reduced-motion:reduce\)\{\.room-halo/,'reduced motion stills the halo');
});
