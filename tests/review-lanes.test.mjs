import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const review = readFileSync(new URL('../07_Evidence_and_Reading/Landmark_Trials/review.html', import.meta.url), 'utf8');
const quizzes = JSON.parse(readFileSync(new URL('../07_Evidence_and_Reading/Landmark_Trials/quizzes.json', import.meta.url), 'utf8'));

function laneHelpers() {
  const a = review.indexOf('/* ---------- review lanes ---------- */');
  const b = review.indexOf('/* ---------- end review lanes ---------- */', a);
  assert.ok(a >= 0 && b > a, 'lane helpers must be present in review.html');
  return new Function(review.slice(a, b) + ';return {reviewLane,reviewLaneAllows,reviewInitialLane,reviewFocusedCard,reviewFocusAllowed,reviewVerifiedArticles,reviewVerifiedCompanions};')();
}

test('every real article question belongs to Landmark Evidence without changing its ID', () => {
  const {reviewLane} = laneHelpers();
  const ids = quizzes.decks.flatMap(deck => (deck.questions || []).flatMap((q, i) => q?.q && q?.o ? [`${deck.id}#${i}`] : []));
  assert.equal(ids.length, 437);
  assert.ok(ids.every(id => reviewLane({id}) === 'landmark'));
  assert.equal(reviewLane({id:'CONCEPT#t_psychosis-pearl3:1@2'}), 'clerkship');
  assert.equal(reviewLane({id:'TOPIC#t_mood.md'}), 'clerkship');
  assert.equal(reviewLane({id:'FAM#a#b'}), 'clerkship');
});

test('All due excludes new and future cards while each ordinary lane offers its own new cards', () => {
  const {reviewLaneAllows} = laneHelpers();
  const now = 1000, article = {id:'AR-24#5'}, concept = {id:'CONCEPT#t_psychosis-pearl3:1@2'};
  assert.equal(reviewLaneAllows(article, 'landmark', null, now), true);
  assert.equal(reviewLaneAllows(article, 'clerkship', {due:0}, now), false);
  assert.equal(reviewLaneAllows(concept, 'clerkship', null, now), true);
  assert.equal(reviewLaneAllows(article, 'all', null, now), false);
  assert.equal(reviewLaneAllows(article, 'all', {due:2000}, now), false);
  assert.equal(reviewLaneAllows(article, 'all', {due:0}, now), true);
});

test('a direct visit defaults to Clerkship Review; Today and timed blocks select All due', () => {
  const {reviewInitialLane} = laneHelpers();
  assert.equal(reviewInitialLane(''), 'clerkship');
  assert.equal(reviewInitialLane('?lane=landmark'), 'landmark');
  assert.equal(reviewInitialLane('?lane=all'), 'all');
  assert.equal(reviewInitialLane('?block=1&limit=5'), 'all');
  assert.equal(reviewInitialLane('?lane=landmark&block=1'), 'all');
});

test('metrics and queue both apply the lane predicate before counting or selecting', () => {
  assert.match(review, /function metrics\([\s\S]*?reviewLaneAllows\(c,[^)]*\)/);
  assert.match(review, /function start\([\s\S]*?reviewLaneAllows\(c,[^)]*\)/);
  assert.doesNotMatch(review, /localStorage\.setItem\(['"]cw_review_lane/);
});

test('the actual session builder serves each due share and All due introduces no new cards', () => {
  const a=review.indexOf('/* ---------- review lanes ---------- */');
  const b=review.indexOf('/* ---------- end review lanes ---------- */',a);
  const start=review.indexOf('  function metrics(which){');
  const end=review.indexOf('  function choose(i)',start);
  assert.ok(a>=0 && b>a && start>=0 && end>start);
  const cards=[{id:'CONCEPT#due',page:'x'},{id:'AR-24#5'},{id:'CONCEPT#new',page:'x'},{id:'SP-2#0'}];
  const state={cards:{'CONCEPT#due':{due:0,ivl:1,reps:1},'AR-24#5':{due:0,ivl:1,reps:1}},day:{newToday:0}};
  const make = new Function('cards','lane','state', `
    ${review.slice(a,b)}
    var DAY=86400000, blockLimit={current:null}, gradedThisSession={}, store=state, weekRefs=null, conceptFilter='all', session;
    function loadS(){return state;} function rollDay(s){return s;} function queueable(){return true;}
    function newConceptAllowed(){return true;} function effectiveNewPerDay(){return 2;}
    function maturity(){return 'young';} function shuffle(x){return x;}
    function saveS(){} function setStore(){} function setSess(s){session=s;}
    ${review.slice(start,end)}
    return {count:metrics(),start:function(){start(false);return session;}};
  `);
  for(const [lane, ids] of [
    ['clerkship',['CONCEPT#due','CONCEPT#new']],
    ['landmark',['AR-24#5','SP-2#0']],
    ['all',['CONCEPT#due','AR-24#5']],
  ]) {
    const app=make(cards,lane,state);
    assert.deepEqual(app.start().queue.map(c=>c.id),ids,lane);
    assert.equal(app.count.due+app.count.newRemain,ids.length,lane);
  }
  assert.deepEqual(Object.keys(state.cards).sort(),['AR-24#5','CONCEPT#due']);
});

test('a companion deep link focuses only a mapped existing card', () => {
  const {reviewFocusedCard}=laneHelpers();
  const cards=[{id:'AR-24#5'},{id:'CONCEPT#paired'},{id:'AR-24#4'}];
  const pairs={pairs:[{clinicalCardId:'CONCEPT#paired',articleCardId:'AR-24#5'}]};
  assert.equal(reviewFocusedCard(cards,'?lane=landmark&focus=AR-24%235',pairs),cards[0]);
  assert.equal(reviewFocusedCard(cards,'?focus=AR-24%234',pairs),null);
  assert.equal(reviewFocusedCard(cards,'?focus=AR-24%235',null),null);
});

test('companion focus respects the shared new-card limit while scheduled cards remain available', () => {
  const {reviewFocusAllowed}=laneHelpers();
  const article={id:'AR-24#5'};
  assert.equal(reviewFocusAllowed(article,null,0),false);
  assert.equal(reviewFocusAllowed(article,null,1),true);
  assert.equal(reviewFocusAllowed(article,{due:999999},0),true);
  assert.match(review,/focused&&reviewFocusAllowed\(focused,current\.cards\[focused\.id\],remaining\)/);
});

test('malformed successful feed responses cannot become ready with false zero cards', () => {
  const {reviewVerifiedArticles,reviewVerifiedCompanions}=laneHelpers();
  assert.equal(reviewVerifiedArticles(quizzes),quizzes);
  assert.throws(()=>reviewVerifiedArticles({}),/incomplete/);
  assert.throws(()=>reviewVerifiedArticles({...quizzes,questionCount:quizzes.questionCount-1}),/mismatch/);
  const companion={schemaVersion:1,pairs:[{articleCardId:'AR-24#5',clinicalCardId:'CONCEPT#paired',result:'R',limitation:'L',url:'https://example.org'}]};
  assert.equal(reviewVerifiedCompanions(companion),companion);
  assert.equal(reviewVerifiedCompanions({schemaVersion:1,pairs:[]}).pairs.length,0);
  assert.throws(()=>reviewVerifiedCompanions({}),/incomplete/);
  assert.throws(()=>reviewVerifiedCompanions({schemaVersion:1,pairs:[{}]}),/incomplete/);
  assert.match(review,/\.then\(reviewVerifiedArticles\)\.then\(function\(out\)\{setArticleStatus\('ready'\)/);
  assert.match(review,/\.then\(reviewVerifiedCompanions\)\.then\(function\(out\)\{setCompanions\(out\);setCompanionStatus\('ready'\)/);
});
