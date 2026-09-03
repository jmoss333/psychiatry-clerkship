// Daily Review's fourth and fifth card sources: What Do You Say Next (COMM#) and the Diagnostic
// Reasoning Workbench (REASON#). Before this, both tools recorded a learner's choices and neither
// scheduled anything, so the two surfaces where a student most needs spacing were the two that
// never came back. These pin the card ids the tools and the review agree on, the derived grade,
// the exactly-one-best guard, and the fact that neither namespace can reach the new-card stream.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repo = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const review = repo('07_Evidence_and_Reading/Landmark_Trials/review.html');
const comm = repo('02_Clinical_Skills/Communication_Practice/communication-practice.html');
const reason = repo('02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html');
const family = repo('06_Family_and_Relational/family-systems-practice.html');
const store = repo('13_Faculty_Resources/_automation/site_build/srs_store.js');
const commCases = JSON.parse(repo('communication_cases.json'));
const reasonCases = JSON.parse(repo('reasoning_cases.json'));
const reasonResident = JSON.parse(repo('reasoning_cases_resident.json'));

function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a > -1 && b > a, `could not slice ${from} .. ${to}`);
  return src.slice(a, b);
}
const builders = slice(review, 'function prettyRef(', '/* A reveal is either');
// eslint-disable-next-line no-new-func
const F = new Function(
  `${repo('13_Faculty_Resources/_automation/site_build/fam_retrieval.js')}\n${builders}\n` +
  `return { choiceOptions, commChoiceCards, reasonChoiceCards, queueable };`)();

// The store snippet is evaluated against a stub localStorage so the derived-grade mapping and
// the write path are exercised, not just read.
function evalStore() {
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const applyGrade = repo('13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js');
  // eslint-disable-next-line no-new-func
  const api = new Function('localStorage', `${applyGrade}\n${store}\n` +
    `return { srsGradeCard, srsGradeForQuality, srsLoadStore, srsSaveStore };`)(localStorage);
  return { api, mem };
}

// ---- card sources ---------------------------------------------------------------------------

test('every authored communication case becomes one card under the tool\'s own id', () => {
  const cards = F.commChoiceCards(commCases);
  assert.equal(cards.length, commCases.cases.length, 'no case is silently dropped');
  const ids = new Set();
  for (const c of cards) {
    assert.match(c.id, /^COMM#[^#]+$/, c.id);
    assert.equal(ids.has(c.id), false, `duplicate card id ${c.id}`);
    ids.add(c.id);
    assert.equal(c.kind, 'choice');
    assert.equal(c.seededOnly, true, 'communication cards never enter the new-card stream');
    assert.ok(c.q.length > 0);
    assert.equal(c.o.filter((o) => o.c).length, 1, 'exactly one option is correct');
  }
});

test('every reasoning STEP becomes its own card, carrying the case brief as its stem', () => {
  for (const [data, label] of [[reasonCases, 'ms3'], [reasonResident, 'resident']]) {
    const cards = F.reasonChoiceCards(data);
    const steps = data.cases.reduce((n, c) => n + (c.steps || []).length, 0);
    assert.equal(cards.length, steps, `${label}: one card per step`);
    for (const c of cards) {
      assert.match(c.id, /^REASON#[^#]+#[^#]+$/, c.id);
      assert.equal(c.seededOnly, true, `${label}: reasoning cards never enter the new-card stream`);
      assert.ok(c.stem && c.stem.length > 0,
        `${label}: a step is unanswerable without the patient brief`);
      assert.equal(c.o.filter((o) => o.c).length, 1);
    }
  }
});

test('a case with no patient brief is dropped rather than served bare', () => {
  const cards = F.reasonChoiceCards({ cases: [{
    id: 'x', steps: [{ id: 's', prompt: 'p', choices: [
      { text: 'a', quality: 'best' }, { text: 'b', quality: 'missed' }] }] }] });
  assert.deepEqual(cards, []);
});

test('choiceOptions rejects anything but exactly one best', () => {
  const two = [{ text: 'a', quality: 'best' }, { text: 'b', quality: 'best' }];
  const none = [{ text: 'a', quality: 'partial' }, { text: 'b', quality: 'missed' }];
  const one = [{ text: 'a', quality: 'best' }, { text: 'b', quality: 'missed' }];
  assert.equal(F.choiceOptions(two), null, 'two bests would score a right answer wrong');
  assert.equal(F.choiceOptions(none), null, 'no best would score every answer wrong');
  assert.equal(F.choiceOptions([one[0]]), null, 'a single option is not a question');
  assert.deepEqual(F.choiceOptions(one), [
    { t: 'a', c: true, fb: '' }, { t: 'b', c: false, fb: '' }]);
});

test('malformed or absent data yields no cards rather than throwing', () => {
  for (const bad of [null, {}, { cases: null }, { cases: 'x' }, { cases: [null, {}, { id: 'a' }] }]) {
    assert.deepEqual(F.commChoiceCards(bad), [], JSON.stringify(bad));
    assert.deepEqual(F.reasonChoiceCards(bad), [], JSON.stringify(bad));
  }
});

// ---- derived grade --------------------------------------------------------------------------

test('the grade follows the option quality, and an unknown quality is a lapse', () => {
  const { api } = evalStore();
  assert.equal(api.srsGradeForQuality('best'), 3, 'a best answer is Good, never Easy');
  assert.equal(api.srsGradeForQuality('partial'), 2);
  assert.equal(api.srsGradeForQuality('missed'), 1);
  assert.equal(api.srsGradeForQuality('harmful'), 1);
  assert.equal(api.srsGradeForQuality('some_new_quality'), 1,
    'a quality added to the data later must not quietly lengthen an interval');
  assert.equal(api.srsGradeForQuality(undefined), 1);
});

test('srsGradeCard writes cards and never touches the retention stats', () => {
  const { api, mem } = evalStore();
  const card = api.srsGradeCard('COMM#x', 3);
  assert.ok(card && card.due > 0 && card.reps === 1);
  const saved = JSON.parse(mem.get('cw_srs_v1'));
  assert.ok(saved.cards['COMM#x'], 'the card is persisted under its id');
  assert.deepEqual(saved.stats, { streak: 0, lastStudy: '', totalReviews: 0, correct: 0, seen: 0 },
    'Retention counts only what Daily Review itself served');
  assert.equal(api.srsGradeCard('', 3), null, 'an empty id writes nothing');
});

// ---- wiring ---------------------------------------------------------------------------------

test('the store adapter is injected, never re-declared, in all three scheduling tools', () => {
  for (const [src, name] of [[comm, 'communication-practice'], [reason, 'diagnostic-reasoning'],
    [family, 'family-systems-practice'], [review, 'review.html']]) {
    if (name === 'review.html') {
      // review.html reads the store through its own loader and must not gain a second copy
      assert.doesNotMatch(src, /function srsGradeCard\s*\(/, 'review.html must not schedule directly');
      continue;
    }
    assert.equal(src.split('/*__SRS_STORE__*/').length - 1, 1, `${name} carries the marker once`);
    assert.doesNotMatch(src, /function srsFresh\s*\(/, `${name} must not re-declare srsFresh`);
    assert.doesNotMatch(src, /var SRS_KEY\s*=/, `${name} must not re-declare the store key`);
    assert.equal(src.split('/*__SM2_APPLY_GRADE__*/').length - 1, 1, `${name} carries the SM-2 step`);
  }
});

test('each tool schedules under the id the review builds, and only on a recorded choice', () => {
  assert.match(comm, /function commCardId\(caseId\)\{return 'COMM#'\+caseId;\}/);
  assert.match(comm, /srsGradeCard\(commCardId\(caseId\),srsGradeForQuality\(choice&&choice\.quality\)\)/);
  assert.match(reason, /function reasonCardId\(caseId,stepId\)\{return 'REASON#'\+caseId\+'#'\+stepId;\}/);
  assert.match(reason, /srsGradeCard\(reasonCardId\(caseId,stepId\),srsGradeForQuality\(choice&&choice\.quality\)\)/);
});

test('resetting communication history also drops the cards it scheduled', () => {
  // Otherwise a learner who cleared the tool would keep being served its cards from Daily
  // Review with no record in the tool explaining where they came from.
  assert.match(comm, /id\.indexOf\('COMM#'\)===0/);
  assert.match(comm, /This also removes these cases from daily review/);
});

test('Daily Review loads both sources and appends them', () => {
  assert.match(review, /fetch\("\.\.\/communication_cases\.json"\)/);
  assert.match(review, /fetch\("\.\.\/reasoning_cases\.json"\)/);
  assert.match(review, /out=out\.concat\(commChoiceCards\(comm\)\)/);
  assert.match(review, /out=out\.concat\(reasonChoiceCards\(reason\)\)/);
});

test('the review renders a stem when a card carries one', () => {
  assert.match(review, /c\.stem\? e\("p",\{className:"stemtext"\}, c\.stem\) : null/);
  assert.match(review, /\.stemtext\{/, 'the stem needs its own style, not the question\'s');
});
