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

const {createStation}=stationModule.exports;
const contentModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8')+'\n})',{filename:'station-content.js'})(contentModule,contentModule.exports);

// No DOM dependency is added; the station is asserted against a minimal document
// stub, the same way client.test.mjs stubs env.
function documentStub(){
  function node(tag){
    const listeners=Object.create(null);
    return {tagName:tag,children:[],attributes:{},textContent:'',hidden:false,value:'',
      classList:{add(){},remove(){}},
      appendChild(child){this.children.push(child);return child;},
      setAttribute(name,value){this.attributes[name]=value;},
      getAttribute(name){return this.attributes[name];},
      addEventListener(name,listener){(listeners[name]||(listeners[name]=[])).push(listener);},removeEventListener(){},
      dispatchEvent(event){for(const listener of listeners[event.type]||[])listener.call(this,event);},
      replaceChildren(){this.children=[];}};
  }
  return {createElement:node,createTextNode(text){return {textContent:text,children:[]};},addEventListener(){},removeEventListener(){},hidden:false};
}
const flat=root=>{const out=[];(function walk(n){out.push(n);(n.children||[]).forEach(walk);})(root);return out;};
const byStation=(root,name)=>flat(root).find(n=>n.attributes&&n.attributes['data-station']===name);
const allText=root=>flat(root).map(n=>typeof n.textContent==='string'?n.textContent:'').join(' ');

test('the station renders the door note and task before the first question',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([],'ready'));
  const door=byStation(host,'door-note');
  assert.ok(door,'a door note surface is rendered');
  assert.ok(allText(door).includes('adult inpatient psychiatry'),'the door note text is present');
  assert.ok(allText(host).includes('establish a shared agenda'),'the task is present');
  station.dispose();
});

test('the station exposes bookmarks and reflections without any network or storage call',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  let fetches=0;
  const station=createStation({document:doc,fetch(){fetches++;}},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  for(let turn=1;turn<=10;turn++)station.update(hosted([you('Question '+turn),dana('Reply '+turn,'played',['Reply '+turn],1)],'listening'));
  assert.equal(fetches,0,'the station never calls fetch');
  assert.deepEqual(station.getBookmarks(),[]);
  assert.deepEqual(station.getReflections(),{});
  assert.equal(station.getPresentation(),'');
  station.dispose();
});

test('marked-moment editors stay mounted while speech and heard quotes update',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  const first=[you('What has been hardest?'),dana('The nights. I cannot sleep.','preparing',['The nights.',' I cannot sleep.'],0)];
  station.update(hosted(first,'speaking'));
  byStation(host,'mark').dispatchEvent({type:'click'});
  const marks=byStation(host,'bookmarks');
  const editor=flat(marks).find(n=>n.attributes['aria-label']==='Reflection on moment 1');
  assert.ok(editor,'marking an exchange creates an editable reflection');
  editor.value='Ask what makes the nights difficult.';
  editor.dispatchEvent({type:'input'});

  station.update(hosted(first,'listening',{interim:'Help me understand'}));
  assert.equal(flat(marks).find(n=>n.attributes['aria-label']==='Reflection on moment 1'),editor,
    'an interim result must not replace the focused editor');
  assert.equal(editor.value,'Ask what makes the nights difficult.');

  const interrupted=[you('What has been hardest?'),dana('The nights. I cannot sleep.','interrupted',['The nights.',' I cannot sleep.'],1)];
  station.update(hosted(interrupted,'listening'));
  const quote=flat(marks).find(n=>n.tagName==='blockquote'&&!n.hidden);
  assert.equal(quote.textContent,'Dana: The nights.','the heard prefix updates without rebuilding the note');
  assert.equal(allText(marks).includes('I cannot sleep.'),false,'the unplayed tail is never quoted');
  assert.equal(flat(marks).find(n=>n.attributes['aria-label']==='Reflection on moment 1'),editor);
  assert.deepEqual(station.getReflections(),{'1':'Ask what makes the nights difficult.'});

  station.update(hosted([...interrupted,you('How can we help?'),dana('I want some rest.','played',['I want some rest.'],1)],'listening'));
  byStation(host,'mark').dispatchEvent({type:'click'});
  assert.equal(flat(marks).filter(n=>n.tagName==='textarea').length,2,'a later mark adds one editor');
  assert.equal(flat(marks).find(n=>n.attributes['aria-label']==='Reflection on moment 1'),editor,
    'adding another mark must leave the first editor mounted');
  station.dispose();
});

test('an unknown case id yields no station rather than a partly rendered one',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  assert.equal(createStation({document:doc},host,{caseId:'not_a_case',content:contentModule.exports}),null);
  assert.equal(host.children.length,0,'nothing was rendered');
});

test('the station never reproduces actor guidance',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([],'listening'));
  const text=allText(host);
  assert.equal(text.includes('Keep the short, polite style'),false,'portrayal guidance must not reach the learner');
  assert.equal(text.includes('gated facts'),false);
  station.dispose();
});

test('retry moments list completed exchanges, played first, quoting only what was heard',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([
    you('Q1'),dana('R1 full.','interrupted',['R1 full.'],0),
    you('Q2'),dana('R2 heard. R2 tail.','interrupted',['R2 heard.',' R2 tail.'],1),
    you('Q3'),dana('R3 played.','played',['R3 played.'],1)
  ],'ended'));
  const moments=station.getRetryMoments();
  // Played moments first; original turn order preserved within each group.
  assert.deepEqual(moments.map(m=>m.turnId),[3,1,2]);
  assert.equal(moments[0].playbackStatus,'played','a fully played moment is offered first');
  const second=moments.find(m=>m.turnId===2);
  assert.equal(second.heardText,'R2 heard.');
  assert.equal(second.heardText.includes('R2 tail.'),false);
  const first=moments.find(m=>m.turnId===1);
  assert.equal(first.heardText,undefined,'a moment with nothing heard offers no quote');
  station.dispose();
});

test('an unanswered final question is not offered as a retry moment',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([you('Q1'),dana('R1.','played',['R1.'],1),you('Q2','pending')],'ended'));
  assert.deepEqual(station.getRetryMoments().map(m=>m.turnId),[1],'a question with no reply is not a completed moment');
  station.dispose();
});

test('the station asks for a retry through a callback, never through a controller',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const asked=[];
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports,onRetry:(turnId,text)=>{asked.push([turnId,text]);return Promise.resolve(true);}});
  station.update(hosted([you('Q1'),dana('R1.','played',['R1.'],1)],'ended'));
  station.requestRetry(1,'A different way of asking');
  assert.deepEqual(asked,[[1,'A different way of asking']]);
  station.dispose();
});

const REGISTERED=['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001'];

test('every registered case has learner-facing station content and no actor direction',()=>{
  for(const caseId of REGISTERED){
    const profile=contentModule.exports.getProfile(caseId);
    assert.ok(profile,caseId+' has a profile');
    assert.equal(profile.caseId,caseId);
    for(const key of ['title','task','doorNote','objectives','chartCards','priorities','cues','reflectionQuestion'])
      assert.ok(profile[key],caseId+' is missing '+key);
    assert.equal(JSON.stringify(profile).includes('portrayal'),false,caseId+' must not carry actor direction');
  }
  assert.equal(contentModule.exports.getProfile('sp_alcohol_ambivalence_001'),null,'Morgan is out of scope');
  assert.equal(contentModule.exports.getProfile('not_a_case'),null);
});

test('the station renders each registered case without leaking another case content',()=>{
  for(const caseId of REGISTERED){
    const doc=documentStub(),host=doc.createElement('div');
    const station=createStation({document:doc},host,{caseId,content:contentModule.exports});
    station.update(hosted([],'ready'));
    const text=allText(host);
    const profile=contentModule.exports.getProfile(caseId);
    assert.ok(text.includes(profile.doorNote.slice(0,40)),caseId+' shows its own door note');
    for(const other of REGISTERED.filter(id=>id!==caseId))
      assert.equal(text.includes(contentModule.exports.getProfile(other).doorNote.slice(0,40)),false,caseId+' leaked '+other);
    station.dispose();
  }
});

test('a normally speaking patient does not show an interruption cue — R9',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_mania_redirect_001',content:contentModule.exports});
  const profile=contentModule.exports.getProfile('sp_mania_redirect_001');
  station.update(hosted([you('Q1'),dana('Speaking now.','preparing',['Speaking now.'],0)],'speaking'));
  const cue=byStation(host,'cue');
  assert.notEqual(cue.textContent,profile.cues.interrupted,'normal playback is not an interruption');
  assert.equal(cue.textContent,profile.cues.opening,'a neutral cue is shown instead');
  station.dispose();
});

test('an interruption cue appears only after an actual interruption — R9',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_mania_redirect_001',content:contentModule.exports});
  const profile=contentModule.exports.getProfile('sp_mania_redirect_001');
  station.update(hosted([you('Q1'),dana('Cut short.','interrupted',['Cut short.'],0)],'paused'));
  assert.equal(byStation(host,'cue').textContent,profile.cues.interrupted);
  station.dispose();
});

test('disposing the station removes its content from the page, not just a flag — R4',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([you('A question I asked'),dana('A reply I heard.','played',['A reply I heard.'],1)],'ended'));
  assert.ok(allText(host).includes('A question I asked'),'the exchange is on the page first');

  station.dispose();
  assert.equal(host.children.length,0,'dispose removes the station DOM');
  assert.deepEqual(station.getBookmarks(),[],'and its bookmarks');
  assert.deepEqual(station.getReflections(),{},'and its reflections');
  assert.equal(station.getPresentation(),'','and the attending presentation');
  assert.equal(allText(host).includes('A question I asked'),false,'no dialogue remains rendered');
});

test('a disposed station ignores further updates rather than re-rendering — R4',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.dispose();
  station.update(hosted([you('After disposal'),dana('Reply.','played',['Reply.'],1)],'ended'));
  assert.equal(host.children.length,0,'a disposed station stays empty');
  assert.equal(allText(host).includes('After disposal'),false);
});

test('every registered case declares its own display name and voice — R5',()=>{
  const expected={sp_depression_gated_si_001:['Dana','Marin'],sp_mania_redirect_001:['Marcus','Cedar'],sp_psychosis_paranoid_001:['Ray','Cedar']};
  for(const [caseId,[name,voice]] of Object.entries(expected)){
    const profile=contentModule.exports.getProfile(caseId);
    assert.equal(profile.displayName,name,caseId+' names itself');
    assert.equal(profile.voice,voice,caseId+' names its voice');
  }
});

test('quoted moments are labelled with the patient, not always Dana — R5 follow-up',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_mania_redirect_001',content:contentModule.exports});
  station.update(hosted([you('A question'),dana('A reply heard in full.','played',['A reply heard in full.'],1)],'ended'));
  station.update(hosted([you('A question'),dana('A reply heard in full.','played',['A reply heard in full.'],1)],'ended'));
  const marks=byStation(host,'bookmarks');
  // Mark the moment, then read the rendered quote.
  const before=allText(host);
  assert.equal(before.includes('Dana:'),false,'no Dana label on a Marcus encounter');
  const retry=byStation(host,'retry');
  assert.ok(retry,'the retry panel is present at the end of an encounter');
  assert.equal(allText(retry).includes('Dana'),false,'nor in the retry quote');
  station.dispose();
});
