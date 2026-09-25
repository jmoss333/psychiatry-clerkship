import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {coachView,renderCoach,roomView}=clientModule.exports;
const stationModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8')+'\n})',{filename:'station-content.js'})(stationModule,stationModule.exports);
const dana=stationModule.exports.getProfile('sp_depression_gated_si_001');
const family=stationModule.exports.getProfile('family_morgan_maya_001');
const base={caseId:'sp_depression_gated_si_001',phase:'paused',turn:2,messages:[],draft:'',interim:'',targetRoleId:'patient',activeSpeakerId:null,familyBid:null,roomCue:null,busy:false,hold:false,spokenInterrupt:false,restartRequired:false,mode:'full'};
const heard=[{role:'you',text:'How has the night been?'},{role:'dana',speakerId:'patient',text:'I did not sleep much at all.',status:'played'}];
const opt=(view,id)=>view.options.find(o=>o.id===id);

test('the three options are built from the case brief, verbatim',()=>{
  const view=coachView({...base,messages:heard},dana);
  assert.equal(opt(view,'task').lead,dana.task,'the task is quoted, not paraphrased');
  assert.deepEqual(opt(view,'task').items,dana.objectives);
  assert.deepEqual(opt(view,'priorities').items,dana.priorities);
  assert.equal(opt(view,'priorities').title,'Ask what matters to Dana');
  assert.equal(opt(view,'reflect').quote,'I did not sleep much at all.');
});
test('reflect is unavailable until a patient line has actually been heard',()=>{
  const none=coachView(base,dana);
  assert.equal(opt(none,'reflect').available,false);
  assert.equal(opt(none,'reflect').quote,'');
  assert.ok(opt(none,'task').available&&opt(none,'priorities').available,'the brief-based options need no transcript');
  const pending=coachView({...base,messages:[{role:'dana',speakerId:'patient',text:'Half a sentence',status:'pending'}]},dana);
  assert.equal(opt(pending,'reflect').available,false,'only completed audio counts as heard');
  const cut=coachView({...base,messages:[{role:'dana',speakerId:'patient',text:'Half a sentence',status:'interrupted'}]},dana);
  assert.equal(opt(cut,'reflect').available,false,'an interrupted line is not a completed one');
});
test('in the family case the quote is attributed to the person who said it',()=>{
  const view=coachView({...base,caseId:'family_morgan_maya_001',messages:[{role:'dana',speakerId:'maya',text:'Could we talk about Sundays?',status:'played'}]},family);
  assert.equal(opt(view,'reflect').cite,'Maya');
  assert.equal(opt(view,'priorities').title,'Ask what matters to Morgan and Maya');
});
test('opening the coach holds the room and says the people in it cannot hear',()=>{
  const open=roomView({...base,caseId:'family_morgan_maya_001',messages:heard},family,{coachOpen:true});
  assert.ok(open.seats.every(s=>s.turn==='idle'),'rings off while the coach is open');
  assert.equal(open.mic,'Microphone paused · coach open');
  assert.equal(open.micOn,false);
  assert.equal(open.caption.label,'Coach open');
  assert.match(open.caption.text,/Morgan and Maya cannot hear the coach/);
  const ended=roomView({...base,phase:'ended'},dana,{coachOpen:true});
  assert.equal(ended.caption.label,'Ended','a finished encounter still reads as ended, not coached');
  const plain=roomView({...base,messages:heard},dana);
  assert.notEqual(plain.mic,'Microphone paused · coach open','the third argument is optional');
});
test('the DOM writer fills only coach ids and writes nothing back to the encounter',()=>{
  renderCoach({getElementById:()=>null},coachView(base,dana),'task');
  const nodes={},created=[];
  const make=()=>({textContent:'',hidden:false,disabled:false,attributes:{},children:[],
    setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];},appendChild(c){this.children.push(c);}});
  const doc={getElementById:id=>nodes[id]||(nodes[id]=make()),createElement:()=>{const n=make();created.push(n);return n;}};
  renderCoach(doc,coachView({...base,messages:heard},dana),'task');
  assert.equal(nodes['coach-lead'].textContent,dana.task);
  assert.equal(nodes['coach-items'].children.length,dana.objectives.length);
  assert.equal(nodes['coach-note'].hidden,false);
  assert.equal(nodes['coach-option-task'].attributes['aria-pressed'],'true');
  assert.equal(nodes['coach-option-reflect'].attributes['aria-pressed'],'false');
  // the ids the encounter itself owns must never be touched by the coach
  for(const id of ['composer','draft-text','interim-text','transcript','send'])assert.ok(!(id in nodes),id+' must not be written by the coach');
  const closed=Object.keys(nodes).length;
  renderCoach(doc,coachView({...base,messages:heard},dana),'');
  assert.equal(nodes['coach-note'].hidden,true,'picking again closes the note');
  assert.equal(Object.keys(nodes).length,closed,'closing touches no new nodes');
});
test('the panel ships, carries the draft pill, and adds no inline styles',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const start=html.indexOf('<section class="coach"');
  assert.ok(start>0,'the coach ships in index.html');
  const block=html.slice(start,html.indexOf('</section>',html.indexOf('coach-fine')));
  assert.doesNotMatch(block,/ style=/,'style-src is self');
  assert.match(block,/id="coach-draft-note"[^>]*>Draft coach copy/,'the draft pill is present until the copy is attested');
  assert.match(block,/aria-live="polite"/,'the note region announces politely');
  assert.ok(html.indexOf('<section class="coach"')>html.indexOf('id="room-view"'),'the coach sits after the room');
  assert.ok(html.indexOf('<section class="coach"')<html.indexOf('class="conversation"'),'and before the transcript');
  assert.match(html,/id="coach-open"[^>]*aria-pressed="false"/,'only the toggle carries aria-pressed in the action row');
});
test('the coach mark is echoed on your side of the table while the coach is open',()=>{
  const open=roomView({...base,messages:heard},dana,{coachOpen:true});
  assert.equal(open.coach,'open');
  assert.equal(roomView({...base,messages:heard},dana).coach,'','no mark when the coach is closed');
  assert.equal(roomView({...base,phase:'ended'},dana,{coachOpen:true}).coach,'','no mark once the encounter has ended');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const scene=html.slice(html.indexOf('<svg class="room-scene"'),html.indexOf('</svg>'));
  assert.match(scene,/room-coach-mark/,'the mark ships inside the scene');
  assert.ok(scene.indexOf('room-coach-mark')>scene.indexOf('room-your-seat'),'it sits in the near field, on your side of the table');
  const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.ok(css.includes('.room-view[data-coach="open"] .room-coach-mark{display:block}'));
});
