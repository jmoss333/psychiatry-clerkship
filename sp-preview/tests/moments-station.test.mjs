import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/moment-station.js', import.meta.url), 'utf8');
const module = {exports:{}};
vm.runInNewContext(source, {module});
const {mount, chooseTransfer} = module.exports;
function documentStub(){
  const doc = {activeElement:null};
  doc.createElement = tag => {
    const events = {};
    return {ownerDocument:doc,tagName:tag,children:[],attributes:{},hidden:false,disabled:false,value:'',textContent:'',checked:false,
      appendChild(n){this.children.push(n);return n;},replaceChildren(){this.children=[];this.textContent='';},
      setAttribute(k,v){this.attributes[k]=String(v);if(k==='hidden')this.hidden=true;},getAttribute(k){return this.attributes[k];},
      addEventListener(k,f){(events[k] ||= []).push(f);},removeEventListener(){},
      dispatchEvent(e){e.target ||= this;for(const f of events[e.type]||[])f(e);},focus(){doc.activeElement=this;},
      classList:{add(){}}};
  };
  return doc;
}
const flat = n => [n,...n.children.flatMap(flat)];
const get = (host,id) => flat(host).find(n=>n.attributes['data-moment']===id);
const text = host=>flat(host).map(n=>n.textContent).join(' ');
const fire=(n,type='click')=>n.dispatchEvent({type});
const profile={id:'priya',title:'Check my understanding',displayName:'Priya',task:'Invite correction.',setup:'Available context.',setupAttribution:'',reviewLabel:'Faculty-review draft',maxTurns:4,durationLabel:'About 3–5 minutes',summaryPrompt:'Optional team formulation.',reflectionPrompts:['What am I pulled to do?','What did the patient say, and what am I adding?','What can I responsibly say next?'],transferTargets:['luis','elena']};
const messages=[{role:'dana',text:'An opening.',status:'played'},{role:'you',text:'So it is the job?',status:'submitted'},{role:'dana',text:'Yes. UNHEARD.',status:'interrupted',segments:['Yes.',' UNHEARD.'],completedSegments:1}];
const snapshot=(extra={})=>({mode:'moment',phase:'ended',turn:1,messages,draft:'',interim:'',busy:false,momentStage:'ending',captureTarget:'patient',reflectionOpen:false,review:null,teamFormulation:'',uncertainTurnIds:[],reviewAttempted:false,closedReceiptAvailable:false,...extra});
function setup(options={}){const doc=documentStub(),host=doc.createElement('div');return {doc,host,station:mount(host,{profile,...options})};}
test('draft brief is attributed and responses are bounded without a global grade',()=>{
 const {host,station}=setup();station.update(snapshot());assert.match(text(host),/Faculty-review draft/);assert.match(text(host),/1 of 4 responses/);assert.doesNotMatch(text(host),/competence score|success meter/);
});
test('reflection remains private, preserves the textarea and restores focus on Escape',()=>{
 const calls=[];const {host,doc,station}=setup({onReflectOpen:()=>calls.push('open'),onReflectClose:()=>calls.push('close')});
 station.update(snapshot({phase:'paused',momentStage:'dialogue'}));const opener=get(host,'reflect-open');fire(opener);assert.deepEqual(calls,['open']);
 station.update(snapshot({momentStage:'dialogue',reflectionOpen:true}));const area=get(host,'private-reflection');area.value='PRIVATE_CANARY';fire(area,'input');assert.equal(doc.activeElement,area);
 station.update(snapshot({momentStage:'dialogue',reflectionOpen:true,interim:'speech'}));assert.equal(get(host,'private-reflection'),area);assert.equal(area.value,'PRIVATE_CANARY');
 const event={type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){this.stopped=true;}};get(host,'reflection').dispatchEvent(event);assert.equal(event.stopped,true);assert.deepEqual(calls,['open','close']);
 station.update(snapshot({momentStage:'dialogue',reflectionOpen:false}));assert.equal(doc.activeElement,opener);station.dispose();assert.equal(area.value,'');assert.equal(host.children.length,0);
});
test('only original submitted learner turns can be flagged; drafts and alternatives cannot',()=>{
 const calls=[];const {host,station}=setup({onUncertainTurn:(...a)=>calls.push(a)});station.update(snapshot({messages:[...messages,{role:'you',text:'pending words',status:'pending'},{role:'you',text:'alternative words',status:'submitted',alternative:true}]}));
 const flags=flat(host).filter(n=>n.attributes['data-moment']==='uncertain-turn');assert.equal(flags.length,1);flags[0].checked=true;fire(flags[0],'change');assert.deepEqual(calls,[[1,true]]);assert.doesNotMatch(text(host),/UNHEARD/);
});
test('team formulation is optional, editable, explicitly reviewed and not recorded to patient',()=>{
 const calls=[];const {host,station}=setup({onSummaryChange:s=>calls.push(['summary',s]),onRecordSummary:()=>calls.push(['record']),onReview:()=>calls.push(['review'])});station.update(snapshot());
 const field=get(host,'team-formulation');field.value='TEAM_CANARY';fire(field,'input');fire(get(host,'record-summary'));assert.deepEqual(calls,[['summary','TEAM_CANARY'],['record']]);assert.match(text(host),/included in AI feedback/);
 station.update(snapshot({teamFormulation:'TEAM_CANARY',interim:'new speech'}));assert.equal(get(host,'team-formulation'),field);assert.equal(field.value,'TEAM_CANARY');fire(get(host,'review'));assert.deepEqual(calls.at(-1),['review']);
 station.update(snapshot({reviewAttempted:true,momentStage:'reviewing'}));assert.equal(field.disabled,true);assert.equal(get(host,'review').disabled,true);
});
test('zero submitted turns and unavailable review have static reflection with no invented assessment',()=>{
 const {host,station}=setup();station.update(snapshot({turn:0,messages:[]}));assert.equal(get(host,'review').hidden,true);assert.equal(get(host,'alternative').hidden,true);assert.match(text(host),/No response was submitted/);
 station.update(snapshot({momentStage:'review_unavailable',reviewAttempted:true}));assert.match(text(host),/Review unavailable/);assert.match(text(host),/What am I pulled to do/);assert.equal(get(host,'review').disabled,true);
});
test('review renders plain text and quotation context only from heard original sources',()=>{
 const {host,station}=setup();station.update(snapshot({momentStage:'reviewed',reviewAttempted:true,closedReceiptAvailable:true,review:{schemaVersion:1,scenarioId:'priya',findings:[{criterionId:'p',status:'unclear',observationText:'<img onerror=bad>Observation',uncertaintyText:'Limited evidence.',nextAttemptText:'Invite a correction.',evidence:[{sourceId:'p1',start:0,end:4,quote:'Yes.'}]}]}}));
 assert.match(text(host),/<img onerror=bad>Observation/);assert.equal(flat(host).some(n=>n.tagName==='img'),false);assert.match(text(get(host,'quote-context')),/Yes\./);assert.doesNotMatch(text(host),/UNHEARD/);
});
test('one alternative requires a closed receipt, preserves context and submits only explicitly',()=>{
 const calls=[];const {host,station}=setup({onRetry:(...a)=>calls.push(a),onRecordAlternative:id=>calls.push(['record',id])});station.update(snapshot({momentStage:'review_unavailable',reviewAttempted:true}));assert.equal(get(host,'alternative').hidden,true);
 station.update(snapshot({momentStage:'review_unavailable',reviewAttempted:true,closedReceiptAvailable:true}));assert.equal(get(host,'alternative').hidden,false);assert.match(text(get(host,'alternative-context')),/So it is the job\?/);assert.doesNotMatch(text(get(host,'alternative-context')),/UNHEARD/);
 const field=get(host,'alternative-text');field.value='What worries you most?';fire(field,'input');fire(get(host,'submit-alternative'));assert.deepEqual(calls,[[1,'What worries you most?']]);fire(get(host,'record-alternative'));assert.deepEqual(calls.at(-1),['record',1]);
 station.update(snapshot({momentStage:'alternative_done',retryUsed:true,closedReceiptAvailable:true}));assert.equal(get(host,'alternative').hidden,true);
});
test('transfer selects the first enabled unvisited ID and never automatically changes situation',()=>{
 const visited=new Set(['luis']),enabled=new Set(['luis','elena']);assert.equal(chooseTransfer(profile,visited,enabled),'elena');assert.equal(chooseTransfer(profile,new Set(['luis','elena']),enabled),null);assert.equal(chooseTransfer(profile,new Set(),new Set(['elena'])),'elena');
 const calls=[];const {host,station}=setup({onTransfer:()=>calls.push('transfer'),onDone:()=>calls.push('done')});station.update(snapshot());assert.deepEqual(calls,[]);fire(get(host,'transfer'));fire(get(host,'done'));assert.deepEqual(calls,['transfer','done']);
});
test('the pure station has no request, storage, HTML injection or private reflection callback',()=>{assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|innerHTML|onReflectionChange/);});
test('transcription flag keeps focus and identity while its checked state changes',()=>{
 const {host,doc,station}=setup();station.update(snapshot());const flag=get(host,'uncertain-turn');flag.focus();station.update(snapshot({uncertainTurnIds:[1]}));assert.equal(get(host,'uncertain-turn'),flag);assert.equal(doc.activeElement,flag);assert.equal(flag.checked,true);
});
test('team and alternative fields respect the controller 1200-character input bound',()=>{
 const calls=[];const {host,station}=setup({onSummaryChange:value=>calls.push(value)});station.update(snapshot());const team=get(host,'team-formulation');assert.equal(team.getAttribute('maxlength'),'1200');assert.equal(get(host,'alternative-text').getAttribute('maxlength'),'1200');team.value='a'.repeat(1400);fire(team,'input');assert.equal(calls[0].length,1200);
});
test('quotation context never renders a provider citation from an absent or unheard source',()=>{
 const {host,station}=setup();station.update(snapshot({reviewAttempted:true,momentStage:'reviewed',review:{findings:[{observationText:'Observation',uncertaintyText:'Uncertain',nextAttemptText:'Next',evidence:[{sourceId:'p1',start:5,end:13,quote:'UNHEARD.'},{sourceId:'private-fact',start:0,end:6,quote:'SECRET'}]}]}}));assert.doesNotMatch(text(host),/UNHEARD|SECRET/);
});
test('transfer passes the selected scenario ID and offers a picker when all enabled targets were visited',()=>{
 const calls=[],visited=new Set(['luis']);const {host,station}=setup({visitedMomentIds:visited,enabledMomentIds:new Set(['luis','elena']),onTransfer:id=>calls.push(id)});station.update(snapshot());fire(get(host,'transfer'));assert.deepEqual(calls,['elena']);visited.add('elena');station.update(snapshot());assert.equal(get(host,'transfer').textContent,'Choose another moment');fire(get(host,'transfer'));assert.deepEqual(calls,['elena',null]);
});
test('reflection blocks review and recording controls until explicitly closed',()=>{
 const {host,station}=setup();station.update(snapshot({reflectionOpen:true}));assert.equal(get(host,'review').disabled,true);assert.equal(get(host,'record-summary').disabled,true);
});
