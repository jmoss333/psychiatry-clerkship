import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/priority-review.js',import.meta.url),'utf8');
const loaded={exports:{}},browser={};
vm.runInNewContext(source,{module:loaded,window:browser},{filename:'priority-review.js'});
const {createReview}=loaded.exports;
const DANA='sp_depression_gated_si_001',MORGAN='sp_alcohol_ambivalence_001';
const pt=(text,status='played',segments=[text],completedSegments=segments.length)=>({role:'dana',text,status,segments,completedSegments});
const you=(text,status='submitted')=>({role:'you',text,status});
const snapshot=(messages,extra={})=>({caseId:DANA,mode:'full',phase:'ended',messages,draft:'Unsent draft',interim:'Unfinished recognition',...extra});

class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.events=new Map();this.value='';this.hidden=false;this.open=false;this.parentNode=null;this.words='';}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;return child;}
  get firstChild(){return this.children[0]||null;}
  set textContent(value){this.children.forEach(child=>child.parentNode=null);this.children=[];this.words=String(value);}
  get textContent(){return this.words+this.children.map(child=>child.textContent).join('');}
  set innerHTML(_value){throw new Error('Review must never interpret HTML');}
  addEventListener(type,callback){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(callback);}
  removeEventListener(type,callback){this.events.get(type)?.delete(callback);}
  fire(type){for(const callback of this.events.get(type)||[])callback({target:this});}
}
function all(element){return [element,...element.children.flatMap(all)];}
function mount(caseId=DANA,options={}){
  const host=new Element('div'),document={createElement:tag=>new Element(tag)};
  const review=createReview({document},host,{caseId,patientName:caseId===MORGAN?'Morgan':'Dana',...options});
  const control=suffix=>all(host).find(item=>item.getAttribute('id')?.endsWith('-'+suffix));
  const select=(suffix,value)=>{const element=control(suffix);element.value=value;element.fire('change');};
  const note=text=>{control('note').value=text;control('note').fire('input');};
  return {host,review,control,select,note};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('exports a browser global and mounts only the two supported solo cases',()=>{
  assert.equal(browser.PriorityReview,loaded.exports);
  for(const caseId of [DANA,MORGAN]){
    const view=mount(caseId);view.review.update(snapshot([pt('Opening.')],{caseId}));
    assert.equal(view.review.getReview().caseId,caseId);
  }
  for(const caseId of ['sp_alcohol_family_001','sp_psychosis_paranoid_001','',null]){
    const view=mount(caseId);assert.equal(view.review,null);assert.equal(view.host.children.length,0);
  }
  assert.equal(createReview({document:{createElement:tag=>new Element(tag)}},new Element('div'),{}),null);
});

test('waits for an ended full visit with the matching case and reports no heard evidence honestly',()=>{
  const {review,host}=mount();
  for(const extra of [{phase:'listening'},{phase:'paused'},{caseId:MORGAN},{mode:'moment'},{busy:true}]){
    review.update(snapshot([pt('Not yet eligible.')],extra));
    assert.equal(review.getReview(),null);assert.equal(host.firstChild.hidden,true);
  }
  review.update(snapshot([pt('Unplayed opening.','preparing',['Unplayed opening.'],0)]));
  assert.equal(host.firstChild.hidden,false);
  assert.equal(review.getReview().patientQuotes.length,0);
  assert.equal(review.getReview().patientQuote,null);
  const empty=all(host).find(item=>item.getAttribute('class')==='priority-empty');
  assert.equal(empty.hidden,false);assert.match(empty.textContent,/No patient words were confirmed heard/);
  assert.equal(all(host).find(item=>item.getAttribute('class')==='priority-review-fields').hidden,true);
  assert.equal(host.textContent.includes('Unplayed opening.'),false);
});

test('defaults to exact opening words and the first later submitted response without interpreting HTML',()=>{
  const view=mount(),opening='  <img src=x onerror=bad()> I want '+('my own words '.repeat(14))+'kept.  ';
  const response='  What would you want to discuss?  ';
  view.review.update(snapshot([pt(opening),you(response),pt('Thank you.')]));
  const result=view.review.getReview();
  assert.equal(result.patientQuote.text,opening);assert.equal(result.patientQuote.opening,true);
  assert.equal(result.learnerResponse.text,response);assert.equal(result.nextPatientReply.text,'Thank you.');
  assert.equal(result.judgment,'');assert.equal(result.note,'');
  const quotes=all(view.host).filter(item=>item.tagName==='BLOCKQUOTE');
  assert.equal(quotes[0].textContent,opening);assert.equal(quotes[0].children.length,0);
  assert.equal(quotes[1].textContent,response);
  assert.ok(view.control('patient').firstChild.textContent.length<opening.length);
  assert.match(view.host.textContent,/Their order does not show whether the concern was addressed/);
  assert.match(view.host.textContent,/Reviewer judgment, not an automated score/);
  for(const control of all(view.host).filter(item=>['SELECT','TEXTAREA'].includes(item.tagName))){
    assert.ok(all(view.host).some(item=>item.tagName==='LABEL'&&item.getAttribute('for')===control.getAttribute('id')),'every control has a linked label');
  }
});

test('quotes only strict completed prefixes when full playback was not confirmed',()=>{
  const view=mount();
  view.review.update(snapshot([
    pt('Heard. Unheard.','interrupted',['Heard.',' Unheard.'],1),
    you('Please tell me more.'),
    pt('A little. Still unheard.','failed',['A little.',' Still unheard.'],1)
  ]));
  const result=view.review.getReview();
  assert.deepEqual(plain(result.patientQuotes.map(item=>({text:item.text,partial:item.partial}))),[{text:'Heard.',partial:true},{text:'A little.',partial:true}]);
  assert.equal(result.nextPatientReply.text,'A little.');
  assert.match(view.control('patient-status').textContent,/partial: completed audio only/);
  assert.equal(view.host.textContent.includes('Unheard.'),false);
  assert.equal(view.host.textContent.includes('Still unheard.'),false);
});

test('rejects malformed segment evidence, impossible counts and unconfirmed full quotes',()=>{
  const invalid=[
    pt('First. Last.','interrupted',['First.',' Last.'],0),
    pt('First. Last.','interrupted',['First.',' Last.'],-1),
    pt('First. Last.','interrupted',['First.',' Last.'],0.5),
    pt('First. Last.','interrupted',['First.',' Last.'],3),
    pt('First. Last.','interrupted',['First.',' Last.'],'1'),
    pt('First. Last.','interrupted',['Different.',' Last.'],1),
    pt('First. 2','interrupted',['First. ',2],1),
    pt('First. Last.','interrupted',null,1),
    pt('All text.','pending',['All text.',''],1),
    ...['pending','preparing','failed','interrupted','unplayed'].map(status=>pt('All text.',status,['All text.'],1))
  ];
  for(const message of invalid){
    const view=mount();view.review.update(snapshot([message]));
    assert.equal(view.review.getReview().patientQuotes.length,0,JSON.stringify(message));
  }
});

test('excludes failed, pending and unconfirmed learner rows while retaining original response ordinals',()=>{
  const view=mount();view.review.update(snapshot([
    pt('What matters to me.'),you('Pending words','pending'),you('Failed words','failed'),you('Unknown outcome','unconfirmed'),
    you('Fourth response.'),pt('Next heard turn.'),{role:'you',text:'No status supplied'}
  ]));
  const result=view.review.getReview();
  assert.equal(result.learnerResponses.length,1);
  assert.equal(result.learnerResponse.ordinal,4);assert.equal(result.learnerResponse.text,'Fourth response.');
  assert.equal(view.host.textContent.includes('Pending words'),false);assert.equal(view.host.textContent.includes('Failed words'),false);
  assert.equal(view.host.textContent.includes('Unsent draft'),false);assert.equal(view.host.textContent.includes('Unfinished recognition'),false);
});

test('has an explicit no-response state when patient words have no later submission',()=>{
  const view=mount();view.review.update(snapshot([you('Earlier response.'),pt('My last words.'),you('Not submitted','pending')]));
  assert.equal(view.review.getReview().learnerResponse,null);
  assert.equal(view.control('learner').children.length,1);
  assert.equal(view.control('learner').firstChild.textContent,'No response selected');
  assert.match(view.control('learner-status').textContent,/No submitted learner response follows/);
  assert.equal(view.review.getReview().nextReplyStatus,'none');
  view.select('judgment','Still open');assert.equal(view.review.getReview().judgment,'Still open');
});

test('selection changes clear the reviewer judgment and note, and never allow an earlier learner response',()=>{
  const view=mount();view.review.update(snapshot([pt('Opening.'),you('First.'),pt('Later words.'),you('Second.'),pt('Last words.')]));
  view.select('judgment','Partly addressed');view.note('Need to clarify.');
  view.select('learner','learner-3');
  assert.equal(view.review.getReview().learnerResponse.text,'Second.');
  assert.equal(view.review.getReview().judgment,'');assert.equal(view.review.getReview().note,'');
  view.select('judgment','Addressed');view.note('x'.repeat(1500));
  assert.equal(view.review.getReview().note.length,1200);assert.equal(view.control('note').getAttribute('maxlength'),'1200');
  view.select('patient','patient-2');
  assert.equal(view.review.getReview().patientQuote.text,'Later words.');
  assert.equal(view.review.getReview().learnerResponse.text,'Second.');
  assert.equal(view.review.getReview().judgment,'');assert.equal(view.review.getReview().note,'');
  assert.deepEqual(view.control('learner').children.map(item=>item.getAttribute('value')),['','learner-3']);
  view.select('judgment','Still open');view.note('One more question.');view.select('learner','');
  assert.equal(view.review.getReview().learnerResponse,null);assert.equal(view.review.getReview().judgment,'');assert.equal(view.review.getReview().note,'');
  assert.equal(view.control('learner-status').textContent,'No response selected.');
  view.select('patient','patient-4');assert.equal(view.review.getReview().learnerResponse,null);
});

test('never skips an unheard or intervening turn to imply a patient reply',()=>{
  for(const middle of [pt('Unheard immediate turn.','pending',['Unheard immediate turn.'],0),you('Intervening learner response.')]){
    const view=mount();view.review.update(snapshot([pt('Opening.'),you('Chosen response.'),middle,pt('Later heard words.')]));
    assert.equal(view.review.getReview().nextPatientReply,null);
    assert.equal(view.review.getReview().nextReplyStatus,middle.role==='dana'?'unheard':'none');
    const next=all(view.host).find(item=>item.tagName==='DETAILS');
    assert.equal(next.textContent.includes('Later heard words.'),false);
    assert.equal(next.textContent.includes('Unheard immediate turn.'),false);
  }
});

test('excludes alternative conversations and their corresponding learner row before freezing',()=>{
  for(const flagLearner of [true,false]){
    const view=mount(),retryLearner=you('Retry learner words.');
    if(flagLearner)retryLearner.alternative=true;
    view.review.update(snapshot([pt('Original opening.'),you('Original response.'),pt('Original reply.'),retryLearner,{...pt('Alternative reply.'),alternative:true},you('Later retry words.')]));
    const result=view.review.getReview();
    assert.deepEqual(plain(result.learnerResponses.map(item=>item.text)),['Original response.']);
    assert.deepEqual(plain(result.patientQuotes.map(item=>item.text)),['Original opening.','Original reply.']);
    assert.equal(view.host.textContent.includes('Retry learner words.'),false);
    assert.equal(view.host.textContent.includes('Alternative reply.'),false);
  }
});

test('freezes the first ended evidence and preserves review through retry updates',()=>{
  const view=mount(),messages=[pt('Original.'),you('Original learner.'),pt('Original reply.')];
  view.review.update(snapshot(messages));view.select('judgment','Still open');view.note('Keep this reflection.');
  messages[0].text='Mutated input';
  view.review.update(snapshot([pt('Replacement')],{phase:'speaking'}));
  view.review.update(snapshot([...messages,{...you('Retry'),alternative:true},{...pt('Alternative'),alternative:true}]));
  const result=view.review.getReview();
  assert.equal(result.patientQuote.text,'Original.');assert.equal(result.learnerResponses.length,1);
  assert.equal(result.judgment,'Still open');assert.equal(result.note,'Keep this reflection.');
  result.patientQuote.text='External mutation';result.patientQuotes[0].text='Changed list';
  assert.equal(view.review.getReview().patientQuote.text,'Original.');
  assert.equal(view.review.getReview().patientQuotes[0].text,'Original.');
});

test('waits for ending audio to settle before freezing its final completed segments',()=>{
  for(const final of [pt('First. Last.','interrupted',['First.',' Last.'],1),pt('First. Last.','played',['First.',' Last.'],2)]){
    const view=mount();
    view.review.update(snapshot([pt('First. Last.','speaking',['First.',' Last.'],0)],{busy:true}));
    assert.equal(view.review.getReview(),null);assert.equal(view.host.firstChild.hidden,true);
    view.review.update(snapshot([final],{busy:false}));
    assert.equal(view.review.getReview().patientQuote.text,final.status==='played'?'First. Last.':'First.');
    assert.equal(view.review.getReview().patientQuote.partial,final.status!=='played');
    assert.equal(view.host.firstChild.hidden,false);
  }
});

test('dispose removes quotes, notes and listeners; a new station starts empty',()=>{
  const view=mount();view.review.update(snapshot([pt('Old words.'),you('Old response.')]));
  view.select('judgment','Addressed');view.note('Old private note.');
  const priorControls=all(view.host).filter(item=>item.events.size);
  const oldQuotes=all(view.host).filter(item=>item.tagName==='BLOCKQUOTE');
  view.review.dispose();view.review.dispose();view.review.update(snapshot([pt('Too late.')]));
  assert.equal(view.review.getReview(),null);assert.equal(view.host.children.length,0);
  assert.ok(priorControls.every(item=>[...item.events.values()].every(callbacks=>callbacks.size===0)));
  assert.ok(priorControls.every(item=>item.value===''));
  assert.ok(oldQuotes.every(item=>item.textContent===''));
  const next=mount();assert.equal(next.review.getReview(),null);
  next.review.update(snapshot([pt('New words.')]));
  assert.equal(next.review.getReview().judgment,'');assert.equal(next.review.getReview().note,'');
  assert.equal(next.host.textContent.includes('Old private note.'),false);
});

const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const button=view=>all(view.host).find(item=>item.tagName==='BUTTON');
const status=view=>all(view.host).find(item=>item.getAttribute('role')==='status');
const ratingView=onSubmit=>{const view=mount(DANA,{onSubmit});view.review.update(snapshot([pt('My concern.'),you('What would help?'),pt('Listen first.')]));return view;};
test('explicit rating required; duplicate taps share one submission and success requires confirmation',async()=>{
 let complete;const calls=[],view=ratingView(value=>{calls.push(value);return new Promise(resolve=>complete=resolve);});
 button(view).fire('click');await settle();assert.equal(calls.length,0);assert.match(status(view).textContent,/Choose a judgment/);
 view.select('judgment','Partly addressed');view.note('Please leave room for questions.');
 button(view).fire('click');button(view).fire('click');assert.equal(calls.length,1);
 assert.deepEqual(plain(calls[0]),{patientIndex:0,learnerIndex:1,judgment:'Partly addressed',note:'Please leave room for questions.'});
 assert.equal(button(view).disabled,true);assert.equal(view.control('note').disabled,true);assert.doesNotMatch(status(view).textContent,/Feedback saved/);
 complete({saved:true,reference:'a'.repeat(32)});await settle();assert.match(status(view).textContent,/Feedback saved/);assert.equal(button(view).disabled,true);
 button(view).fire('click');assert.equal(calls.length,1);
});
test('uncertain save holds exact choices for a deliberate retry and never fabricates success',async()=>{
 const calls=[],view=ratingView(async value=>{calls.push(value);if(calls.length===1)throw Error('offline');return {saved:true,reference:'b'.repeat(32)};});
 view.select('judgment','Still open');view.note('Original note');button(view).fire('click');await settle();
 assert.match(status(view).textContent,/Could not confirm/);assert.equal(button(view).textContent,'Try submitting again');
 view.note('Changed note');view.select('judgment','Addressed');assert.equal(view.review.getReview().note,'Original note');
 button(view).fire('click');await settle();assert.deepEqual(plain(calls[1]),plain(calls[0]));assert.match(status(view).textContent,/Feedback saved/);
});
test('definite input rejection unlocks editing while conflict and expiry preserve choices',async()=>{
 for(const error of [{status:400},{status:413},{code:'feedback_conflict'},{code:'feedback_expired'}]){
  const view=ratingView(async()=>{throw error;});view.select('judgment','Addressed');view.note('Retained');button(view).fire('click');await settle();
  assert.equal(view.review.getReview().note,'Retained');assert.equal(view.control('note').disabled,!error.status);
  assert.equal(button(view).disabled,!error.status);assert.doesNotMatch(status(view).textContent,/Feedback saved/);
 }
});
test('malformed confirmation and a disposed view cannot display saved feedback',async()=>{
 for(const result of [{saved:false},{saved:true,reference:'invalid'}]){
  const view=ratingView(async()=>result);view.select('judgment','Addressed');button(view).fire('click');await settle();assert.match(status(view).textContent,/Could not confirm/);
 }
 let complete;const view=ratingView(()=>new Promise(resolve=>complete=resolve));view.select('judgment','Addressed');button(view).fire('click');view.review.dispose();complete({saved:true,reference:'c'.repeat(32)});await settle();assert.equal(view.host.children.length,0);assert.equal(view.review.getReview(),null);
});
