import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
// The shipped browser file is a classic script; loaded the same way client.test.mjs does.
const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {elapsedLabel,elapsedIso,closingNote}=clientModule.exports;
const T0=1_700_000_000_000;

test('the room clock reports whole minutes and never a running countdown',()=>{
  assert.equal(elapsedLabel(T0,T0),'under a minute');
  assert.equal(elapsedLabel(T0,T0+59_000),'under a minute');
  assert.equal(elapsedLabel(T0,T0+60_000),'1 min');
  assert.equal(elapsedLabel(T0,T0+11*60_000+30_000),'11 min');
  assert.equal(elapsedLabel(null,T0+60_000),'','no clock before the encounter starts');
  assert.equal(elapsedLabel(T0,T0-1),'','a clock that runs backwards shows nothing');
});
test('the datetime attribute is a valid ISO duration',()=>{
  assert.equal(elapsedIso(T0,T0+90_000),'PT90S');
  assert.equal(elapsedIso(T0,T0),'PT0S');
  assert.equal(elapsedIso(null,T0),'');
  assert.match(elapsedIso(T0,T0+61_500),/^PT\d+S$/);
});
test('the closing note appears at two questions left, then one, and nowhere else',()=>{
  assert.equal(closingNote(7,10,'listening'),'');
  assert.equal(closingNote(8,10,'listening'),'Two questions left — start closing.');
  assert.equal(closingNote(9,10,'listening'),'Last question — a summary they can correct.');
  assert.equal(closingNote(10,10,'listening'),'','no note once the budget is spent');
  assert.equal(closingNote(8,10,'ended'),'','nothing after the encounter ends');
  assert.equal(closingNote(8,10,'gate'),'','nothing before it starts');
  assert.equal(closingNote(3,5,'listening'),'Two questions left — start closing.','the note tracks maxTurns, not a hard-coded 10');
});
test('the clock ships in the markup and is styled as a companion, not a countdown',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/<time id="elapsed" hidden><\/time>/,'the clock is a <time> element');
  assert.match(html,/id="turn-count-text"/,'the turn count keeps its own span so the clock can sit beside it');
  assert.match(html,/id="closing-note"/);
  const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.ok(css.includes('#elapsed{color:var(--muted)'),'the clock is muted');
  assert.ok(css.includes('.closing-note{'),'the closing note has the review-note treatment');
});

test('the quiet window is exposed from the capture, not duplicated in the view',()=>{
  const src=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(src,/quietWindow:quiet,/,'the capture publishes its own window');
  assert.match(src,/quietMs:capture\.quietWindow\(\)/,'the snapshot reads it from the capture');
  assert.equal((src.match(/thinking\?8000:4500/g)||[]).length,1,'the 4.5 s / 8 s rule lives in exactly one place');
});
test('the drain has a fixed duration per window, because CSP forbids an inline one',()=>{
  const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.ok(css.includes('.room-quiet[data-window="4500"] .room-quiet-bar{animation:room-drain 4.5s linear forwards}'));
  assert.ok(css.includes('.room-quiet[data-window="8000"] .room-quiet-bar{animation:room-drain 8s linear forwards}'));
  assert.match(css,/prefers-reduced-motion:reduce\)\{\.room-quiet-bar\{animation:none!important;transform:scaleX\(1\)\}/,'reduced motion leaves a full, static bar');
  assert.ok(css.includes('.room-view[data-quiet="on"] .room-caption[data-kind="you"] span{opacity:.45'),'the caption settles back while the window drains');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/id="room-quiet"[^>]*hidden/,'the bar starts hidden');
  assert.ok(html.indexOf('id="room-quiet"')>html.indexOf('id="room-caption"'),'it sits under the caption');
  assert.doesNotMatch(html.slice(html.indexOf('id="room-quiet"'),html.indexOf('id="room-quiet"')+400),/ style=/);
});

// Same shape of DOM stub the station tests use.
function documentStub(){
  function node(tag){
    const listeners={};
    return {tagName:tag,children:[],attributes:{},textContent:'',hidden:false,value:'',disabled:false,
      classList:{add(){},remove(){}},
      appendChild(child){this.children.push(child);return child;},
      // the real DOM reflects the hidden attribute onto the property; the station relies on that
      setAttribute(name,value){this.attributes[name]=value;if(name==='hidden')this.hidden=value!==false&&value!==null&&value!==undefined;},
      getAttribute(name){return this.attributes[name];},
      addEventListener(name,listener){(listeners[name]||(listeners[name]=[])).push(listener);},removeEventListener(){},
      dispatchEvent(event){for(const listener of listeners[event.type]||[])listener.call(this,event);},
      replaceChildren(){this.children=[];}};
  }
  return {createElement:node,createTextNode(text){return {textContent:text,children:[]};},addEventListener(){},removeEventListener(){},hidden:false};
}
const flat=root=>{const out=[];(function walk(n){out.push(n);(n.children||[]).forEach(walk);})(root);return out;};

test('a chart request takes 30-40 s, once per card, and cancels on Clear',()=>{
  const stationModule={exports:{}};
  vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station.js',import.meta.url),'utf8')+'\n})',{filename:'station.js'})(stationModule,stationModule.exports);
  const contentModule={exports:{}};
  vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8')+'\n})',{filename:'station-content.js'})(contentModule,contentModule.exports);

  const pending=new Map();let seq=0;
  const clock={setTimeout:(fn,ms)=>{pending.set(++seq,{fn,ms,kind:'t'});return seq;},
               setInterval:(fn,ms)=>{pending.set(++seq,{fn,ms,kind:'i'});return seq;},
               clearTimeout:id=>pending.delete(id),clearInterval:id=>pending.delete(id)};
  const doc=documentStub(),host=doc.createElement('div');
  const station=stationModule.exports.createStation({document:doc,...clock},host,
    {caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update({phase:'ready',turn:0,messages:[],draft:'',interim:'',error:'',voice:true,thinking:false,hold:false,busy:false,restartRequired:false,mode:'full',maxTurns:10,caseId:'sp_depression_gated_si_001'});

  const nodes=flat(host);
  const open=nodes.find(n=>n.tagName==='button'&&n.attributes['aria-controls']==='chart-sp_depression_gated_si_001-admission-context');
  const body=nodes.find(n=>n.attributes.id==='chart-sp_depression_gated_si_001-admission-context');
  assert.ok(open&&body,'the first chart card renders a request button and a body');
  assert.ok(body.hidden,'the card is closed before it is requested');

  open.dispatchEvent({type:'click'});
  assert.equal(open.disabled,true,'the button is held while the nurse is looking');
  const timeout=[...pending.values()].find(p=>p.kind==='t');
  assert.ok(timeout,'a delay is scheduled');
  assert.ok(timeout.ms>=30000&&timeout.ms<=40000,'delay '+timeout.ms+'ms is within 30-40 s');
  assert.ok(body.hidden,'nothing arrives early');

  open.dispatchEvent({type:'click'});
  assert.equal([...pending.values()].filter(p=>p.kind==='t').length,1,'clicking again while waiting schedules nothing new');

  timeout.fn();
  assert.equal(body.hidden,false,'the card text arrives after the wait');
  assert.match(body.textContent,/Dana was admitted voluntarily/);
  assert.equal(open.disabled,false);

  station.dispose();
  assert.equal(pending.size,0,'Clear cancels every pending request');
});

test('the aside says the wait is realism, not an information barrier',()=>{
  const src=fs.readFileSync(new URL('../public/station.js',import.meta.url),'utf8');
  assert.match(src,/the wait is realism, not an information barrier, and nothing is withheld/);
});
