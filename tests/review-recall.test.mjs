// Daily Review's third card source. The queue used to hold only what this tool could build —
// landmark-deck questions and per-topic quizzes — while the home badge counted due FAM# cards
// too, so the two disagreed. These pin the family card source, the seeded-only gate that keeps
// the badge and the queue in step, and the second card shape (answer aloud, then self-rate).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
