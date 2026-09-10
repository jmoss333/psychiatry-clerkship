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
const familyYou=(text,targetRoleId)=>({...you(text),targetRoleId});
const familyReply=(text,speakerId,status='played',segments=[text],completedSegments=segments.length)=>({...dana(text,status,segments,completedSegments),speakerId});
const familyBidReply=(speakerId,completedSegments,status='pending')=>({
  ...familyReply('A weekly call would help.',speakerId,status,['A weekly call would help.',' Could I add something?'],completedSegments),
  familyBid:{speakerId:speakerId==='morgan'?'maya':'morgan',text:'Could I add something?'}
});

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

test('family speaker attribution is separate from unchanged speech and heard-prefix text',()=>{
  const snapshot=stationSnapshot(hosted([
    familyYou('What support works for you?','maya'),
    {...familyReply('A weekly call. Not every night.','maya','interrupted',['A weekly call.',' Not every night.'],1),speakerName:'Morgan'}
  ]));
  assert.equal(snapshot.transcript[0].targetRoleId,'maya');
  assert.equal(snapshot.transcript[0].targetName,'Maya');
  assert.equal(snapshot.transcript[0].text,'What support works for you?');
  assert.equal(snapshot.transcript[1].speakerId,'maya');
  assert.equal(snapshot.transcript[1].speakerName,'Maya','names derive from the fixed role identity, not supplied labels');
  assert.equal(snapshot.transcript[1].text,'A weekly call. Not every night.');
  assert.equal(snapshot.transcript[1].heardText,'A weekly call.');
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

test('a family bookmark keeps its speaker and refuses the same words addressed to someone else',()=>{
  const store=createBookmarkStore();
  store.add(stationSnapshot(hosted([familyYou('What would help?','maya'),familyReply('A weekly call.','maya')])));
  const original=store.entries()[0];
  assert.equal(original.targetName,'Maya');
  assert.equal(original.speakerName,'Maya');
  assert.equal(original.danaText,'A weekly call.');
  store.sync(stationSnapshot(hosted([familyYou('What would help?','morgan'),familyReply('Having a say.','morgan')])));
  assert.deepEqual(store.entries()[0],original,'a matching turn number and question cannot reattribute another person’s reply');
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

const REGISTERED=['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001','sp_alcohol_ambivalence_001','family_morgan_maya_001'];

test('every registered case has learner-facing station content and no actor direction',()=>{
  for(const caseId of REGISTERED){
    const profile=contentModule.exports.getProfile(caseId);
    assert.ok(profile,caseId+' has a profile');
    assert.equal(profile.caseId,caseId);
    for(const key of ['title','task','doorNote','objectives','chartCards','priorities','cues','reflectionQuestion'])
      assert.ok(profile[key],caseId+' is missing '+key);
    assert.equal(JSON.stringify(profile).includes('portrayal'),false,caseId+' must not carry actor direction');
  }
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
  const expected={sp_depression_gated_si_001:['Dana','Marin'],sp_mania_redirect_001:['Marcus','Cedar'],sp_psychosis_paranoid_001:['Ray','Cedar'],sp_alcohol_ambivalence_001:['Morgan','Marin'],family_morgan_maya_001:['Morgan and Maya','Marin and Cedar']};
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

test('family bookmarks and retries quote the actual respondent and keep unplayed words out',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'family_morgan_maya_001',content:contentModule.exports});
  station.update(hosted([
    familyYou('What support could work?','maya'),
    familyReply('A weekly call. Not nightly monitoring.','maya','interrupted',['A weekly call.',' Not nightly monitoring.'],1)
  ],'ended'));
  byStation(host,'mark').dispatchEvent({type:'click'});
  const marks=byStation(host,'bookmarks'),retry=byStation(host,'retry');
  assert.ok(allText(marks).includes('You, to Maya: What support could work?'));
  assert.ok(allText(marks).includes('Maya: A weekly call.'));
  assert.ok(allText(retry).includes('Maya: A weekly call.'));
  assert.equal(allText(marks).includes('Not nightly monitoring.'),false);
  assert.equal(allText(retry).includes('Not nightly monitoring.'),false);
  assert.equal(allText(marks).includes('Morgan and Maya:'),false,'a reply never becomes a joint quotation');
  const moment=station.getRetryMoments()[0];
  assert.equal(moment.speakerId,'maya');
  assert.equal(moment.targetRoleId,'maya');
  assert.equal(moment.speakerName,'Maya');
  assert.equal(moment.heardText,'A weekly call.');
  station.dispose();
});

test('new draft profiles expose shared entry information without private inventories or portrayal',()=>{
  for(const caseId of ['sp_alcohol_ambivalence_001','family_morgan_maya_001']){
    const profile=contentModule.exports.getProfile(caseId);
    assert.equal(profile.reviewStatus,'draft-pending-faculty-review');
    assert.equal(profile.reviewLabel,'Faculty-review draft');
    const text=JSON.stringify(profile);
    for(const privatePhrase of ['four to six beers','three weeks','saying no to a monitoring role will be heard as not caring','privateFacts','portrayal'])
      assert.equal(text.includes(privatePhrase),false,caseId+' exposes '+privatePhrase);
  }
  const participants=contentModule.exports.getProfile('family_morgan_maya_001').participants;
  assert.deepEqual(participants.map(({id,displayName,voice,pronouns})=>({id,displayName,voice,pronouns})),[
    {id:'morgan',displayName:'Morgan',voice:'Marin',pronouns:'they/them'},
    {id:'maya',displayName:'Maya',voice:'Cedar',pronouns:'she/her'}
  ]);
});

test('family bid projection separates completed speakers without adding a learner turn',()=>{
  for(const primaryRole of ['morgan','maya']){
    const bidRole=primaryRole==='morgan'?'maya':'morgan';
    for(const status of ['pending','speaking','interrupted','played']){
      for(const completed of [0,1,2]){
        const messages=[familyYou('What would help?',primaryRole),familyBidReply(primaryRole,completed,status)];
        const before=JSON.stringify(messages);
        const snapshot=stationSnapshot(hosted(messages));
        assert.equal(snapshot.turn,1,'a bid does not consume another turn');
        assert.equal(snapshot.transcript.length,completed===2?3:2);
        const primary=snapshot.transcript[1];
        assert.equal(primary.speakerId,primaryRole);
        assert.equal(primary.text,'A weekly call would help.');
        assert.equal(primary.heardText,undefined,'the other speaker is never a primary heard prefix');
        assert.equal(primary.playbackStatus==='played',completed>=1);
        if(completed===2){
          const bid=snapshot.transcript[2];
          assert.deepEqual(bid,{who:'pt',text:'Could I add something?',playbackStatus:'played',familyBid:true,
            speakerId:bidRole,speakerName:bidRole==='maya'?'Maya':'Morgan'});
        }
        assert.equal(JSON.stringify(messages),before,'projection never rewrites controller history');
      }
    }
  }
});

test('family bid projection rejects inconsistent completion or identity metadata',()=>{
  for(const override of [
    {completedSegments:3},{completedSegments:'2'},
    {familyBid:{speakerId:'morgan',text:'Could I add something?'}},
    {familyBid:{speakerId:'unknown',text:'Could I add something?'}},
    {familyBid:{speakerId:'maya',text:'Words that were never played.'}},
    {segments:['An unrelated primary.',' Could I add something?']}
  ]){
    const snapshot=stationSnapshot(hosted([familyYou('What would help?','morgan'),{...familyBidReply('morgan',2,'played'),...override}]));
    assert.equal(snapshot.transcript.length,2,'no bid is invented from inconsistent metadata');
    assert.equal(snapshot.transcript[1].heardText,undefined,'a bid never becomes Morgan’s speech');
  }
});

test('a bookmark learns the completed family bid separately and returns defensive copies',()=>{
  const store=createBookmarkStore();
  const snapshot=completed=>stationSnapshot(hosted([familyYou('What would help?','morgan'),familyBidReply('morgan',completed)]));
  store.add(snapshot(0));
  assert.equal(store.entries()[0].danaText,'');
  assert.equal(store.entries()[0].familyBid,undefined);
  store.sync(snapshot(1));
  assert.equal(store.entries()[0].danaText,'A weekly call would help.');
  assert.equal(store.entries()[0].familyBid,undefined,'a generated but unheard bid is excluded');
  store.sync(snapshot(2));
  const entry=store.entries()[0];
  assert.equal(store.entries().length,1,'the bid is part of the same marked moment');
  assert.equal(entry.speakerId,'morgan');
  assert.equal(entry.danaText,'A weekly call would help.');
  assert.deepEqual(entry.familyBid,{text:'Could I add something?',speakerId:'maya',speakerName:'Maya'});
  entry.familyBid.text='Changed by a caller';
  assert.equal(store.entries()[0].familyBid.text,'Could I add something?');
});

test('family bid bookmarks and retry choices quote heard speakers independently',()=>{
  for(const primaryRole of ['morgan','maya']){
    for(const completed of [0,1,2]){
      const doc=documentStub(),host=doc.createElement('div'),asked=[];
      const station=createStation({document:doc},host,{caseId:'family_morgan_maya_001',content:contentModule.exports,
        onRetry:(id,text)=>{asked.push([id,text]);return true;}});
      const messages=[familyYou('What would help?',primaryRole),familyBidReply(primaryRole,completed)];
      station.update(hosted(messages,'ended'));
      byStation(host,'mark').dispatchEvent({type:'click'});
      const moments=station.getRetryMoments();
      assert.equal(moments.length,completed?1:0,'an unanswered pending reply cannot create a retry');
      if(completed){
        assert.equal(moments[0].turnId,1);
        assert.equal(moments[0].speakerId,primaryRole,'the original respondent remains the retry target');
        assert.equal(moments[0].targetRoleId,primaryRole);
        assert.equal(moments[0].reply,'A weekly call would help.');
      }
      const bidRole=primaryRole==='morgan'?'Maya':'Morgan';
      for(const surface of [byStation(host,'bookmarks'),byStation(host,'retry')]){
        const quotes=flat(surface).filter(n=>n.tagName==='blockquote'&&!n.hidden).map(n=>n.textContent);
        assert.equal(quotes.some(text=>text===bidRole+': Could I add something?'),completed===2);
        assert.equal(quotes.some(text=>text.includes('A weekly call would help.')&&text.includes('Could I add something?')),false,
          'primary and bid may not become a joint quotation');
        if(completed<2)assert.equal(allText(surface).includes('Could I add something?'),false,'unheard bids stay out of the DOM');
      }
      station.dispose();
    }
  }
});

test('a family bid does not shift later retry turn numbers or replace the reflection editor',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'family_morgan_maya_001',content:contentModule.exports});
  station.update(hosted([familyYou('What would help?','morgan'),familyBidReply('morgan',1)],'speaking'));
  byStation(host,'mark').dispatchEvent({type:'click'});
  const marks=byStation(host,'bookmarks');
  const editor=flat(marks).find(n=>n.attributes['aria-label']==='Reflection on moment 1');
  editor.value='Remember to offer Maya the floor.';editor.dispatchEvent({type:'input'});
  station.update(hosted([
    familyYou('What would help?','morgan'),familyBidReply('morgan',2),
    familyYou('Maya, what would you like to add?','maya'),familyReply('I care about them.','maya')
  ],'ended'));
  assert.deepEqual(station.getRetryMoments().map(m=>[m.turnId,m.speakerId]),[[1,'morgan'],[2,'maya']]);
  assert.equal(flat(marks).find(n=>n.attributes['aria-label']==='Reflection on moment 1'),editor);
  assert.equal(editor.value,'Remember to offer Maya the floor.');
  assert.equal(flat(marks).filter(n=>n.tagName==='textarea').length,1);
  assert.ok(allText(marks).includes('Maya: Could I add something?'));
  station.dispose();
});
