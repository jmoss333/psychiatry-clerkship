import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playerPath = path.join(root,
  '13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js');
const curriculumPath = path.join(root, 'curriculum.json');
const playerSource = fs.readFileSync(playerPath, 'utf8');
const CUR = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
const pack = CUR.appPathway.practicePacks[0];
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(playerSource, sandbox);
const F = sandbox;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('canonical APP practice packs validate and resolve by id', () => {
  assert.equal(F.fdAppPracticeValidate(pack), true);
  assert.equal(F.fdAppPracticeFind(CUR.appPathway.practicePacks, pack.id), pack);
  assert.equal(F.fdAppPracticeFind(CUR.appPathway.practicePacks, 'missing-pack'), null);
});

test('validation rejects incomplete exact pack shapes and invalid ids', () => {
  const missingChange = clone(pack);
  delete missingChange.change;
  assert.throws(() => F.fdAppPracticeValidate(missingChange), /exactly/i);

  const extraProperty = clone(pack);
  extraProperty.extra = true;
  assert.throws(() => F.fdAppPracticeValidate(extraProperty), /exactly/i);

  const invalidPackId = clone(pack);
  invalidPackId.id = 'Not kebab case';
  assert.throws(() => F.fdAppPracticeValidate(invalidPackId), /kebab/i);

  const duplicateStatement = clone(pack);
  duplicateStatement.statements[1].id = duplicateStatement.statements[0].id;
  assert.throws(() => F.fdAppPracticeValidate(duplicateStatement), /duplicate/i);

  const incompleteQuestions = clone(pack);
  incompleteQuestions.supervisorQuestions.pop();
  assert.throws(() => F.fdAppPracticeValidate(incompleteQuestions), /three/i);
});

test('validation recursively rejects evaluative, answer-key, dose, free-text, and proprietary fields', () => {
  const forbidden = [
    ['score', 1], ['threshold', 2], ['correct', true], ['answerKey', 'x'],
    ['expectedCategory', 'changed'], ['result', 'x'], ['evaluation', true],
    ['dose', 'x'], ['dosage', 'x'], ['freeText', true], ['textInput', true],
    ['proprietaryItem', 'x'], ['itemText', 'x'], ['patientName', 'x'], ['mrn', 'x'],
  ];
  for (const [key, value] of forbidden) {
    const invalid = clone(pack);
    invalid.statements[0].metadata = { [key]: value };
    assert.throws(() => F.fdAppPracticeValidate(invalid), new RegExp(key, 'i'), key);
  }
});

test('one change is hidden until an immutable reveal', () => {
  const session = F.fdAppPracticeStart(pack);
  const before = JSON.stringify(session);
  assert.match(F.fdAppPracticeRender(session), /two-minute update/i);
  assert.doesNotMatch(F.fdAppPracticeRender(session), /marked unconfirmed/i);
  const revealed = F.fdAppPracticeReveal(session);
  assert.equal(JSON.stringify(session), before);
  assert.equal(revealed.revealed, true);
  assert.match(F.fdAppPracticeRender(revealed), /marked unconfirmed/i);
});

test('all three statements must be classified before a fixed question is chosen', () => {
  let session = F.fdAppPracticeReveal(F.fdAppPracticeStart(pack));
  assert.throws(() => F.fdAppPracticeChooseQuestion(session, 'confirm-owner'), /classify/i);
  session = F.fdAppPracticeClassify(session, 'review-time', 'still-known');
  session = F.fdAppPracticeClassify(session, 'source-status', 'changed');
  session = F.fdAppPracticeClassify(session, 'verification-owner', 'clarify');
  const complete = F.fdAppPracticeChooseQuestion(session, 'confirm-owner');
  assert.equal(complete.questionId, 'confirm-owner');
  assert.match(F.fdAppPracticeRender(complete), /Who should confirm the source note/);
  assert.doesNotMatch(F.fdAppPracticeRender(complete), /score|pass|fail|correct|answer key/i);
});

test('reclassification replaces one category and reset clears the session', () => {
  let session = F.fdAppPracticeReveal(F.fdAppPracticeStart(pack));
  session = F.fdAppPracticeClassify(session, 'review-time', 'changed');
  session = F.fdAppPracticeClassify(session, 'review-time', 'still-known');
  assert.deepEqual({ ...session.classifications }, { 'review-time': 'still-known' });
  const reset = F.fdAppPracticeReset(session);
  assert.equal(reset.revealed, false);
  assert.deepEqual({ ...reset.classifications }, {});
  assert.equal(reset.questionId, null);
});

test('unknown statements, categories, and questions cannot alter the session', () => {
  const session = F.fdAppPracticeReveal(F.fdAppPracticeStart(pack));
  assert.throws(() => F.fdAppPracticeClassify(session, 'missing-statement', 'changed'), /statement/i);
  assert.throws(() => F.fdAppPracticeClassify(session, 'review-time', 'missing-category'), /category/i);
  assert.throws(() => F.fdAppPracticeChooseQuestion(session, 'missing-question'), /classify/i);
  assert.deepEqual({ ...session.classifications }, {});
});

test('renderer escapes canonical-value-shaped pack content', () => {
  const escaped = clone(pack);
  escaped.title = '<script>title</script>';
  escaped.snapshot[0] = 'one & <two>';
  escaped.change = '"quoted"';
  escaped.statements[0].text = "apostrophe '";
  const session = F.fdAppPracticeReveal(F.fdAppPracticeStart(escaped));
  const html = F.fdAppPracticeRender(session);
  assert.match(html, /&lt;script&gt;title&lt;\/script&gt;/);
  assert.match(html, /one &amp; &lt;two&gt;/);
  assert.match(html, /&quot;quoted&quot;/);
  assert.match(html, /apostrophe &#39;/);
});

test('the player is pure ES5 and has no DOM, storage, network, clock, analytics, or model access', () => {
  assert.doesNotMatch(playerSource, /^\s*(?:const|let|class)\s|\basync\s+function\b|\bawait\s|=>|`/m);
  assert.doesNotMatch(playerSource,
    /\bdocument\b|\bwindow\b|localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon|WebSocket|postMessage|cwAnalytics|\bDate\b|performance|AI service/i);
});
