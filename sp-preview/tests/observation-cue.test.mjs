import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const load=(file,name)=>{const m={exports:{}};vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8')+'\n})',{filename:name})(m,m.exports);return m.exports;};
const content=load('station-content.js','station-content.js');
const client=load('app.js','preview-client.js');
const station=load('station.js','station.js');
const {observationCue,getProfile}=content;
const dana=getProfile('sp_depression_gated_si_001');

test('the mid-encounter note replaces the opening note at turns 5 and 8, and nowhere else',()=>{
  for(const turn of [0,1,4,6,7,9,10])
    assert.equal(observationCue(dana,{phase:'listening',turn}),dana.cues.opening,'turn '+turn+' keeps the opening note');
  assert.equal(observationCue(dana,{phase:'listening',turn:5}),dana.cues.turn5);
  assert.equal(observationCue(dana,{phase:'listening',turn:8}),dana.cues.turn8);
  assert.notEqual(dana.cues.turn5,dana.cues.opening,'the turn-5 note is a different sentence');
});
test('an unwritten slot falls back to the opening note — never to filler',()=>{
  const bare={...dana,cues:{...dana.cues}};
  delete bare.cues.turn5;delete bare.cues.turn8;
  assert.equal(observationCue(bare,{phase:'listening',turn:5}),bare.cues.opening,'turn 5 reads exactly as turn 4');
  assert.equal(observationCue(bare,{phase:'listening',turn:8}),bare.cues.opening);
  const blank={...dana,cues:{...dana.cues,turn5:'   '}};
  assert.equal(observationCue(blank,{phase:'listening',turn:5}),blank.cues.opening,'whitespace is not a sentence');
  assert.equal(observationCue({cues:{}},{phase:'listening',turn:5}),'','no cues at all yields nothing, not a placeholder');
  assert.equal(observationCue(undefined,{turn:5}),'');
});
test('ended and interrupted still take precedence over the turn note',()=>{
  assert.equal(observationCue(dana,{phase:'ended',turn:5}),dana.cues.closing);
  assert.equal(observationCue(dana,{phase:'listening',turn:5,interrupted:true}),dana.cues.interrupted);
});
test('the room borrows the same rule and hides the label when there is nothing to label',()=>{
  const base={caseId:'sp_depression_gated_si_001',phase:'listening',turn:5,messages:[],draft:'',interim:'',targetRoleId:'patient',activeSpeakerId:null,familyBid:null,roomCue:null,busy:false,hold:false,spokenInterrupt:false,restartRequired:false,mode:'full'};
  assert.equal(client.roomView(base,dana,{content}).observation,dana.cues.turn5,'turn 5 in the room');
  assert.equal(client.roomView({...base,turn:4},dana,{content}).observation,dana.cues.opening);
  const nodes={};
  const make=()=>({textContent:'',hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelector(){return null;}});
  const doc={getElementById:id=>nodes[id]||(nodes[id]=make())};
  client.renderRoom(doc,client.roomView(base,dana,{content}));
  assert.equal(nodes['room-note'].hidden,false,'the label shows when there is a note');
  assert.equal(nodes['room-observation'].textContent,dana.cues.turn5);
  client.renderRoom(doc,client.roomView(base,{cues:{}},{content}));
  assert.equal(nodes['room-observation'].textContent,'');
  assert.equal(nodes['room-note'].hidden,true,'"Authored note ·" never renders with nothing after it');
});

// Same DOM stub shape the station tests use.
function documentStub(){
  function node(tag){
    const listeners={};
    return {tagName:tag,children:[],attributes:{},textContent:'',hidden:false,value:'',disabled:false,
      classList:{add(){},remove(){}},
      appendChild(child){this.children.push(child);return child;},
      setAttribute(name,value){this.attributes[name]=value;if(name==='hidden')this.hidden=value!==false&&value!==null&&value!==undefined;},
      getAttribute(name){return this.attributes[name];},
      addEventListener(name,listener){(listeners[name]||(listeners[name]=[])).push(listener);},removeEventListener(){},
      dispatchEvent(event){for(const l of listeners[event.type]||[])l.call(this,event);},
      replaceChildren(){this.children=[];}};
  }
  return {createElement:node,createTextNode:text=>({textContent:text,children:[]}),addEventListener(){},removeEventListener(){},hidden:false};
}
const flat=root=>{const out=[];(function walk(n){out.push(n);(n.children||[]).forEach(walk);})(root);return out;};
const hosted=(turn,phase='listening')=>({phase,turn,messages:[],draft:'',interim:'',error:'',voice:true,thinking:false,hold:false,busy:false,restartRequired:false,mode:'full',maxTurns:10,caseId:'sp_depression_gated_si_001'});

test('the station shows the turn-5 note at turn 5 only, and the same note as turn 4 when it is unwritten',()=>{
  const read=(profileContent,turn)=>{
    const doc=documentStub(),host=doc.createElement('div');
    const s=station.createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:profileContent});
    s.update(hosted(turn));
    const cue=flat(host).find(n=>n.attributes['data-station']==='cue');
    return {text:cue.textContent,hidden:cue.hidden};
  };
  assert.equal(read(content,4).text,dana.cues.opening);
  assert.equal(read(content,5).text,dana.cues.turn5,'the written note appears at turn 5');
  assert.equal(read(content,6).text,dana.cues.opening,'and not at turn 6');
  assert.equal(read(content,8).text,dana.cues.turn8);

  // a build of the content module whose turn notes were never written
  const bare={getProfile:id=>{const p=content.getProfile(id);if(!p)return p;const c={...p.cues};delete c.turn5;delete c.turn8;return {...p,cues:c};},observationCue:content.observationCue};
  assert.equal(read(bare,5).text,read(bare,4).text,'turn 5 reads exactly as turn 4 when unwritten');
  assert.equal(read(bare,5).hidden,false,'and is a real sentence, not an empty line');
});

test('no shipped placeholder survives as a literal fallback anywhere in the room code',()=>{
  const PLACEHOLDERS=['Morgan is in the conversation.','The reply was interrupted.','The conversation can continue.','The conversation has ended.',
    'Morgan and Maya are both in the shared meeting.','The current reply was interrupted; both participants remain in the shared meeting.',
    'The shared conversation can continue.','The shared meeting has ended.'];
  for(const file of ['app.js','station.js','station-content.js','index.html','styles.css']){
    const src=fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
    for(const text of PLACEHOLDERS)assert.ok(!src.includes(text),file+' still contains placeholder text: '+JSON.stringify(text));
  }
  // and an ended encounter with no authored closing shows the state label, not an invented sentence
  const view=client.roomView({caseId:'x',phase:'ended',turn:9,messages:[],draft:'',interim:'',targetRoleId:'patient',activeSpeakerId:null,familyBid:null,roomCue:null,busy:false,hold:false,spokenInterrupt:false,restartRequired:false,mode:'full'},{displayName:'Someone',cues:{}},{content});
  assert.equal(view.caption.label,'Ended');
  assert.equal(view.caption.text,'','no invented closing sentence');
});
