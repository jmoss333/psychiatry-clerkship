import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playerPath = path.join(root,
  '13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js');
const fixturePath = path.join(root, 'tests/fixtures/app-practice/nonclinical-cases.json');
const playerSource = fs.readFileSync(playerPath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(playerSource, sandbox);
const F = sandbox;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('the development fixture is valid and contains only nonclinical rehearsal data', () => {
  assert.equal(F.fdAppPracticeValidate(fixture), true);
  assert.doesNotMatch(JSON.stringify(fixture),
    /patient|diagnos|medicat|dose|treatment|capacity|suicide|agitation/i);
});

test('validation rejects empty packs and incomplete stage or feedback contracts', () => {
  assert.throws(() => F.fdAppPracticeValidate({ stages: [] }), /stage/i);

  const missingFeedback = clone(fixture);
  delete missingFeedback.feedback['clarify-owner'];
  assert.throws(() => F.fdAppPracticeValidate(missingFeedback), /clarify-owner.*feedback/i);

  const missingEvidence = clone(fixture);
  missingEvidence.feedback['clarify-owner'].evidenceRefs = [];
  assert.throws(() => F.fdAppPracticeValidate(missingEvidence), /evidence/i);

  const missingPolicyDeclaration = clone(fixture);
  delete missingPolicyDeclaration.stages[0].policyDependencies;
  assert.throws(() => F.fdAppPracticeValidate(missingPolicyDeclaration), /policyDependencies/i);
});

test('validation recursively rejects answer keys, evaluation, dose, free-text, and proprietary fields', () => {
  const forbidden = [
    ['score', 1], ['threshold', 2], ['correct', true], ['answerKey', 'x'],
    ['dose', 'x'], ['dosage', 'x'], ['freeText', true], ['textInput', true],
    ['proprietaryItem', 'x'], ['itemText', 'x'], ['patientName', 'x'], ['mrn', 'x'],
  ];
  for (const [key, value] of forbidden) {
    const pack = clone(fixture);
    pack.stages[0].choices[0].metadata = { [key]: value };
    assert.throws(() => F.fdAppPracticeValidate(pack), new RegExp(key, 'i'), key);
  }
});

test('ordered reveal exposes only the current detail and advances one stage without mutation', () => {
  const session = F.fdAppPracticeStart(fixture);
  const before = JSON.stringify(session);
  const first = F.fdAppPracticeRender(session);
  assert.match(first, /welcome table is ready/i);
  assert.doesNotMatch(first, /accessibility signs/i);

  const next = F.fdAppPracticeAdvance(session, 'clarify-owner');
  assert.equal(JSON.stringify(session), before, 'advance must leave caller-owned session state untouched');
  assert.equal(next.stageIndex, 1);
  assert.equal(next.selections.length, 1);
  const second = F.fdAppPracticeRender(next);
  assert.match(second, /accessibility signs have not arrived/i);
  assert.match(second, /Clarifying the remaining work/i);
});

test('the final choice completes without a score and reset clears every response', () => {
  const one = F.fdAppPracticeAdvance(F.fdAppPracticeStart(fixture), 'clarify-owner');
  const done = F.fdAppPracticeAdvance(one, 'reopen-plan');
  assert.equal(done.complete, true);
  assert.equal(done.stageIndex, 1);
  assert.doesNotMatch(F.fdAppPracticeRender(done), /score|pass|fail|competent|entrust|ready/i);

  const reset = F.fdAppPracticeReset(done);
  assert.equal(reset.stageIndex, 0);
  assert.deepEqual(Array.from(reset.selections), []);
  assert.equal(reset.complete, false);
  assert.equal(reset.lastFeedback, null);
});

test('unknown choices cannot advance or silently shorten the sequence', () => {
  const session = F.fdAppPracticeStart(fixture);
  assert.throws(() => F.fdAppPracticeAdvance(session, 'not-a-choice'), /not-a-choice/i);
  assert.equal(session.stageIndex, 0);
});

test('the player is pure ES5 and has no DOM, storage, network, clock, analytics, or model access', () => {
  assert.doesNotMatch(playerSource, /^\s*(?:const|let|class)\s|\basync\s+function\b|\bawait\s|=>|`/m);
  assert.doesNotMatch(playerSource,
    /\bdocument\b|\bwindow\b|localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon|WebSocket|postMessage|cwAnalytics|\bDate\b|performance|AI service/i);
});

test('development fixtures and the player have no learner-build registration surface', () => {
  const common = fs.readFileSync(path.join(root,
    '13_Faculty_Resources/_automation/site_build/common.py'), 'utf8');
  const shell = fs.readFileSync(path.join(root,
    '13_Faculty_Resources/_automation/site_build/spa_index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(root,
    '13_Faculty_Resources/_automation/site_build/site_manifest.json'), 'utf8');
  for (const shipped of [common, shell, manifest]) {
    assert.doesNotMatch(shipped, /fd_app_practice|nonclinical-cases|app-practice/i);
  }
});
