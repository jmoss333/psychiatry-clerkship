// Daily Review's third card source. The queue used to hold only what this tool could build —
// landmark-deck questions and per-topic quizzes — while the home badge counted due FAM# cards
// too, so the two disagreed. These pin the family card source, the seeded-only gate that keeps
// the badge and the queue in step, and the second card shape (answer aloud, then self-rate).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const review = repo('07_Evidence_and_Reading/Landmark_Trials/review.html');
const family = repo('06_Family_and_Relational/family-systems-practice.html');
const snippet = repo('13_Faculty_Resources/_automation/site_build/fam_retrieval.js');
const scenarios = JSON.parse(repo('family_systems_scenarios.json'));

function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a > -1 && b > a, `could not slice ${from} .. ${to}`);
  return src.slice(a, b);
}
// The builders sit at module scope in review.html precisely so they can be evaluated here.
const builders = slice(review, 'function prettyRef(', '/* A reveal is either');
// eslint-disable-next-line no-new-func
const F = new Function(`${snippet}\n${builders}\nreturn { prettyRef, famRecallCards, queueable, choiceOptions, commChoiceCards, reasonChoiceCards };`)();

test('every authored scenario contributes one card per prompt it can answer', () => {
  const cards = F.famRecallCards(scenarios);
  assert.ok(cards.length >= scenarios.scenarios.length, 'each scenario yields at least one card');
  for (const c of cards) {
    assert.match(c.id, /^FAM#[^#]+#[^#]+$/, c.id);
    assert.equal(c.kind, 'recall');
    assert.equal(c.deck, 'FAM');
    assert.match(c.deckTitle, /^Family · \S/);
    assert.match(c.q, /\S/);
    assert.ok(c.reveal && (typeof c.reveal === 'string' ? c.reveal.trim() : c.reveal.length),
      `card ${c.id} must reveal authored content`);
  }
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, 'card ids are unique');
});

test('a card carries its scenario first linked page so a miss can point somewhere', () => {
  const first = F.famRecallCards(scenarios)[0];
  assert.equal(first.page, scenarios.scenarios[0].linkedPages[0]);
});

test('malformed or absent scenario data yields no cards rather than throwing', () => {
  for (const bad of [null, {}, { scenarios: null }, { scenarios: 'x' }, { scenarios: [null, {}, { id: 'a' }] }]) {
    assert.deepEqual(F.famRecallCards(bad), [], JSON.stringify(bad));
  }
});

test('unflagged cards always queue; a seededOnly card queues only once it has a schedule', () => {
  const recall = { id: 'FAM#a#opening', kind: 'recall', seededOnly: true };
  const choice = { id: 'TOPIC#t_mood.md', kind: 'choice' };
  assert.equal(F.queueable(choice, undefined), true, 'an unseen deck/topic card is a normal new card');
  assert.equal(F.queueable(recall, undefined), false, 'an unpractised family prompt is not sprung cold');
  assert.equal(F.queueable(recall, { due: 0, reps: 1 }), true, 'once practised, it comes due here too');
});

// The gate keys on the flag, not on the card shape: the communication and reasoning cards are
// `choice` cards that are nonetheless seeded by their own tool. A gate written as
// kind!=='recall' would have let both into the new-card stream.
test('the gate keys on seededOnly, not on the card kind', () => {
  const seededChoice = { id: 'COMM#x', kind: 'choice', seededOnly: true };
  assert.equal(F.queueable(seededChoice, undefined), false, 'a seeded choice card is still gated');
  assert.equal(F.queueable(seededChoice, { due: 0, reps: 1 }), true);
  assert.doesNotMatch(review, /card\.kind!=='recall'/,
    'the old kind-based gate must be gone, not merely unused');
});

test('prettyRef gives one readable spelling for a page ref', () => {
  assert.equal(F.prettyRef('t_mood.md'), 'Mood');
  assert.equal(F.prettyRef('pg_suicide.md'), 'Suicide');
  assert.equal(F.prettyRef('exp_family.md'), 'Exp Family');
  assert.equal(F.prettyRef(null), '');
});

// ---- wiring ------------------------------------------------------------------------------

test('the prompt list is injected, never re-declared, in either consumer', () => {
  for (const [src, name] of [[review, 'review.html'], [family, 'family-systems-practice.html']]) {
    assert.equal(src.split('/*__FAM_RETRIEVAL__*/').length - 1, 1, `${name} carries the marker once`);
    assert.doesNotMatch(src, /function famCardId\s*\(/, `${name} must not re-declare famCardId`);
    assert.doesNotMatch(src, /var FAM_DEFAULT_RETRIEVAL\s*=/, `${name} must not re-declare the prompts`);
    assert.doesNotMatch(src, /var DEFAULT_RETRIEVAL\s*=/, `${name} must not keep the old local copy`);
  }
});

test('Daily Review loads the scenarios and appends them as a third source', () => {
  assert.match(review, /fetch\("\.\.\/family_systems_scenarios\.json"\)/);
  assert.match(review, /out=out\.concat\(famRecallCards\(fam\)\)/);
  assert.equal((review.match(/kind:"choice"/g) || []).length, 4,
    'the deck, topic, communication and reasoning sources are all marked as choice cards');
});

test('the seeded gate is applied everywhere the queue is counted or built', () => {
  assert.equal((review.match(/queueable\(c,st\)/g) || []).length, 2,
    'the dashboard metrics and the session queue must agree on what is servable');
});

test('a recall card is graded on the learner self-rating, with all four grades open', () => {
  assert.match(review, /if\(!isRecall && g>1 && s\.chosen!==correctIdx\(s\.card\)\) return;/);
  assert.match(review, /var gotIt=isRecall\?\(g>=2\):\(s\.chosen===ci\);/);
  assert.match(review, /disabled:!isRecall&&!gotIt/);
});

test('the option-only paths are guarded so a card with no options cannot crash the session', () => {
  assert.match(review, /function correctIdx\(card\)\{ if\(!card\|\|!card\.o\)return -1;/);
  assert.match(review, /if\(!s\|\|!s\.card\)return;/, 'the key handler must survive the finished screen too');
  assert.match(review, /if\(s\.card\.o&&n>=1&&n<=s\.card\.o\.length\)/);
  assert.match(review, /if\(s\.card\.kind==='recall'\)\{ if\(k==="Enter"\)revealCard\(\); \}/);
});

test('the recall card reveals rather than offers options, and says so before it is revealed', () => {
  assert.match(review, /className:"revealbtn",onClick:revealCard\},"Reveal one way to do it"/);
  assert.match(review, /e\("span",\{className:"rvl__k"\},"One way to do it"\)/);
  assert.match(review, /Answer out loud or on scratch first, then reveal\. Nothing is recorded\./);
  assert.match(review, /One way to do it is shown\. Rate how close your answer was\./,
    'the reveal must be announced to assistive tech, not only drawn');
});

test('reveal content is rendered as text, never as markup', () => {
  const nodes = slice(review, 'function revealNodes(', '\n}\n');
  assert.doesNotMatch(nodes, /innerHTML|dangerouslySetInnerHTML/);
  assert.match(nodes, /e\("li",\{key:i\}, x\)/);
});

// Execute the actual App with a tiny hook renderer: answers must be absent from
// the element tree before Reveal, not simply hidden with CSS.
function renderReview(stateValues) {
  let i=0;const effects=[];
  const React={createElement:(tag,props,...children)=>({tag,props,children}),useState:(initial)=>[i<stateValues.length?stateValues[i++]:initial,()=>{}],useRef:(v)=>({current:v}),useEffect:(fn)=>effects.push(fn)};
  let js=review.slice(review.indexOf('var e=React.createElement'),review.indexOf('ReactDOM.createRoot'));
  js=js.replace('/*__CONCEPT_RECALL__*/',repo('13_Faculty_Resources/_automation/site_build/concept_recall.js'));
  const storage={getItem:()=>null,setItem:()=>{}};
  const result=new Function('React','window','document','localStorage','phasePolicy','calibLog','cwReceipt',js+';return App();')(React,{}, {documentElement:{getAttribute:()=>null}},storage,()=>({phase:'unset'}),()=>{},()=>({html:''}));
  return result;
}
const conceptFixture={id:'CONCEPT#test@1',deck:'CONCEPT',deckTitle:'SECRET topic',kind:'recall',q:'Test […]',reveal:'SECRET <img onerror=bad>',page:'ethics_legal.md'};
const storeFixture={cards:{},stats:{seen:100,correct:99},day:{},settings:{newPerDay:12}};
function reviewStates(session,last=null){return [[conceptFixture],'ready','all',null,last,false,storeFixture,session];}
test('answer absent before reveal; reveal is text and links to the shipped page',()=>{
 const session={queue:[conceptFixture],pos:0,total:1,card:conceptFixture,revealed:false,reviewed:0,correct:0};
 assert.doesNotMatch(JSON.stringify(renderReview(reviewStates(session))),/SECRET/);
 const shown=JSON.stringify(renderReview(reviewStates({...session,revealed:true})));
 assert.match(shown,/SECRET <img onerror=bad>/);assert.match(shown,/index.html\?page=ethics_legal.md/);assert.doesNotMatch(shown,/dangerouslySetInnerHTML/);
});
test('next-due strip remains on the last-card receipt and revealed Again requeue',()=>{
 const last={q:'Test […]',page:'ethics_legal.md',due:Date.now()+600000};
 for(const session of [{finished:true,reviewed:1,correct:1,misses:[]},{queue:[conceptFixture],card:conceptFixture,pos:1,total:1,revealed:true,reviewed:1,correct:0}]){
  const shown=JSON.stringify(renderReview(reviewStates(session,last)));assert.match(shown,/Next due:/);assert.match(shown,/ethics_legal.md/);
 }
});
test('old mixed history is never represented as Retention',()=>{assert.doesNotMatch(review,/"Retention"|% correct/);assert.match(review,/Choices correct · since this update/);assert.match(review,/Self-rated recall Good\/Easy/);});

test('real queue and dashboard agree: week excludes new only, All includes no-week sources',()=>{
 const source=repo('13_Faculty_Resources/_automation/site_build/concept_recall.js');
 const real=slice(review,'  function metrics(which){','  function choose(i)');
 const lanes=slice(review,'/* ---------- review lanes ---------- */','/* ---------- end review lanes ---------- */');
 const cards=[conceptFixture,{...conceptFixture,id:'CONCEPT#due@1'},{...conceptFixture,id:'CONCEPT#week@1',page:'mse.md'}];
 for(const filter of ['all','week']){
  let session;
  const state={cards:{'CONCEPT#due@1':{due:0,ivl:1,reps:1}},stats:{},day:{newToday:0}};
  const run=new Function('cards','store','loadS','rollDay','effectiveNewPerDay','queueable','maturity','shuffle','setSess','saveS','setStore','weekRefs','conceptFilter',source+lanes+';var DAY=86400000,blockLimit={current:null},gradedThisSession={},lane="clerkship";'+real+';return {metrics:metrics(),start:start};');
  const app=run(cards,state,()=>state,x=>x,()=>12,()=>true,()=> 'young',x=>x,x=>session=x,()=>{},()=>{},['mse.md'],filter);
  app.start(false);assert.equal(app.metrics.due,1);assert.equal(app.metrics.newRemain,filter==='all'?2:1);
  assert.equal(session.queue.length,app.metrics.due+app.metrics.newRemain);assert.ok(session.queue.some(c=>c.id==='CONCEPT#due@1'));
 }
});
test('missing feed is a visible incomplete state and Retry checks worker update',()=>{
 const values=reviewStates(null);values[1]='unavailable';const shown=JSON.stringify(renderReview(values));assert.match(shown,/Concepts unavailable — review is incomplete/);assert.match(shown,/Retry Concepts/);assert.match(review,/conceptRetry\(conceptDigestFromDocument\(document\),navigator.serviceWorker\)/);assert.doesNotMatch(review,/concepts\.json\?/);
});
test('week filter is transient and direct visit only offers All',()=>{
 const shown=JSON.stringify(renderReview(reviewStates(null)));assert.match(shown,/All topics are available here/);assert.doesNotMatch(review,/localStorage\.setItem\([^\n]*conceptFilter/);
 assert.match(review,/ev.origin!==location.origin\|\|ev.source!==window.parent/);
});
test('interactive controls suppress global shortcuts',()=>{
 const body=slice(review,'function onKey(ev){',' window.addEventListener("keydown"');
 let grades=0;const onKey=new Function('sessRef','grade','revealCard','choose','optOrder',body+';return onKey;')({current:{card:conceptFixture,revealed:true}},()=>grades++,()=>{},()=>{},()=>[]);
 onKey({key:'3',target:{closest:()=>({})}});assert.equal(grades,0);
 onKey({key:'3',target:{closest:()=>null}});assert.equal(grades,1);
});
test('recovery failure is visible and retry remains a deliberate action',()=>{
 const values=reviewStates(null);values[1]='Concepts recovery timed out. Check your connection and try again.';
 const shown=JSON.stringify(renderReview(values));assert.match(shown,/recovery timed out/);assert.match(shown,/Review remains incomplete/);assert.match(shown,/Retry Concepts/);
 assert.match(review,/if\(out===null\)\{location.reload\(\);return;\}/);
});

test('prior sibling prompt cannot leak the next cloze answer before reveal',()=>{
 const card={...conceptFixture,q:'A […]',reveal:'A SECRET'};
 const session={queue:[card],card,pos:1,total:2,revealed:false,reviewed:1,correct:0};
 const last={q:'[…] SECRET',page:card.page,due:Date.now()};
 assert.doesNotMatch(JSON.stringify(renderReview(reviewStates(session,last))),/SECRET|Next due:/);
});
test('completed review has a nonempty live announcement',()=>{
 const tree=renderReview(reviewStates({finished:true,reviewed:2,correct:0,misses:[]}));
 function findLive(node){if(!node||typeof node!=='object')return [];return [...(node.props?.['aria-live']==='polite'?[node]:[]),...(node.children||[]).flat(Infinity).flatMap(findLive)];}
 const live=findLive(tree);assert.equal(live.length,1);assert.match(JSON.stringify(live[0]),/Review complete.*2 cards graded/);
});

test('Concepts dashboard names available due new and aggregate recall separately',()=>{
 const shown=JSON.stringify(renderReview(reviewStates(null)));
 assert.match(shown,/1 available · 0 due · 1 new/);
 assert.match(shown,/All recall sources/);
 assert.match(shown,/Practice Questions/);assert.match(shown,/question-bank-practice.html/);
 assert.match(shown,/Progress saved in this browser; Anki reviews are separate/);
 const values=reviewStates(null);values[1]='unavailable';
 const unavailable=JSON.stringify(renderReview(values));
 assert.match(unavailable,/Concept counts unavailable/);assert.doesNotMatch(unavailable,/available · 0 due/);
});
test('evidence is absent from the actual render tree before reveal and linked after',()=>{
 const card={...conceptFixture,evidence:[{id:'secret-citation',url:'https://doi.org/secret-citation'}]};
 const session={queue:[card],pos:0,total:1,card,revealed:false,reviewed:0,correct:0};
 assert.doesNotMatch(JSON.stringify(renderReview(reviewStates(session))),/secret-citation/);
 assert.match(JSON.stringify(renderReview(reviewStates({...session,revealed:true}))),/https:\/\/doi.org\/secret-citation/);
});

test('source-backed clinical-to-article bridge appears only after reveal and opens the exact companion',()=>{
 const card={...conceptFixture,id:'CONCEPT#t_psychosis-pearl3:1@2',reveal:'Use the side-effect fit'};
 const pair={clinicalCardId:card.id,articleCardId:'AR-24#5',sourceId:'lieberman-2005-catie',title:'Secret CATIE title',result:'Secret outcome',limitation:'Secret limitation',url:'https://doi.org/10.1056/nejmoa051688'};
 const session={queue:[card],pos:0,total:1,card,revealed:false,reviewed:0,correct:0};
 const state=(s)=>[[card],'ready','all',null,null,false,storeFixture,s,'light',0,'clerkship','ready',{schemaVersion:1,pairs:[pair]}];
 const hidden=JSON.stringify(renderReview(state(session)));
 assert.doesNotMatch(hidden,/Secret CATIE title|Secret outcome|Secret limitation|lieberman-2005-catie/);
 const shown=JSON.stringify(renderReview(state({...session,revealed:true})));
 assert.match(shown,/Clinical decision/);assert.match(shown,/Study result/);assert.match(shown,/Important limitation/);
 assert.match(shown,/Secret outcome/);assert.match(shown,/Secret limitation/);
 assert.match(shown,/lane=landmark/);assert.match(shown,/focus=AR-24%235/);
});

test('missing article feed shows unknown Landmark counts rather than false zero',()=>{
 const values=reviewStates(null);values[10]='landmark';values[11]='unavailable';
 const shown=JSON.stringify(renderReview(values));
 assert.match(shown,/Landmark Evidence unavailable/);
 assert.match(shown,/Counts unavailable/);
 assert.doesNotMatch(shown,/All caught up ✓/);
});

test('all real generated candidate faces keep citation IDs and evidence out of unrevealed DOM',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const cards=JSON.parse(execFileSync('python3',['-c',"import sys,json;from pathlib import Path;sys.path.insert(0,'13_Faculty_Resources/_automation/site_build');import concept_cards as c;print(json.dumps(c.validate_candidates(Path('.'),c.load_candidates(Path('.')))))"],{cwd:root,encoding:'utf8'}));
 const adapt=new Function(repo('13_Faculty_Resources/_automation/site_build/concept_recall.js')+';return conceptCardsFromFeed;')();
 assert.equal(cards.length,154);
 for(const card of adapt({schemaVersion:1,cards})){
  const session={queue:[card],pos:0,total:1,card,revealed:false,reviewed:0,correct:0};
  const hidden=JSON.stringify(renderReview(reviewStates(session)));
  assert.doesNotMatch(hidden,/\[\^/);
  for(const evidence of card.evidence){assert.ok(!hidden.includes(evidence.id));assert.ok(!hidden.includes(evidence.url));}
  const shown=JSON.stringify(renderReview(reviewStates({...session,revealed:true})));
  for(const evidence of card.evidence)assert.ok(shown.includes(evidence.url));
 }
});

test('Retry keeps missing build digest failure inside the visible recovery state',async()=>{
 let status;
 const retry=new Function('setConceptStatus','conceptDigestFromDocument','document','navigator','conceptRetry',slice(review,'  function retryConcepts(){','  var conceptNotice=')+';return retryConcepts;')(x=>status=x,()=>{throw Error('Concepts build digest unavailable');},{},{},()=>{throw Error('must not fetch');});
 assert.doesNotThrow(()=>retry());
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(status,'Concepts build digest unavailable');
});
