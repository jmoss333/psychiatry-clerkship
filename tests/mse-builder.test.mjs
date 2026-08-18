import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html',
  import.meta.url,
), 'utf8');

function make() {
  const start = source.indexOf('var DOMAINS = [');
  const end = source.indexOf('\nfunction App(){', start);
  assert.ok(start >= 0 && end > start, 'MSE helper boundary must remain extractable');
  const logic = source.slice(start, end);
  assert.match(logic, /var MSE_CONFLICTS\s*=/, 'the approved pair registry must exist');
  assert.match(logic, /function applyMseSelection\(/, 'the pure selection boundary must exist');
  // eslint-disable-next-line no-new-func
  return new Function(`${logic}\nreturn {DOMAINS:DOMAINS,MSE_CONFLICTS:MSE_CONFLICTS,applyMseSelection:applyMseSelection};`)();
}

const APPROVED_PAIRS = {
  thoughtContent: [
    ['no SI/HI', 'passive SI'],
    ['no SI/HI', 'active SI'],
    ['no SI/HI', 'homicidal ideation'],
    ['no delusions', 'paranoid delusions'],
    ['no delusions', 'grandiose delusions'],
  ],
  perception: [
    ['no perceptual disturbances', 'auditory hallucinations'],
    ['no perceptual disturbances', 'visual hallucinations'],
    ['no perceptual disturbances', 'responding to internal stimuli'],
  ],
  cognition: [['oriented x3', 'oriented x4']],
};

test('the registry contains exactly the approved pairs and every label exists', () => {
  const F = make();
  assert.deepEqual(F.MSE_CONFLICTS, APPROVED_PAIRS);
  for (const [domainKey, pairs] of Object.entries(F.MSE_CONFLICTS)) {
    const domain = F.DOMAINS.find((item) => item.key === domainKey);
    assert.ok(domain, `unknown conflict domain: ${domainKey}`);
    for (const pair of pairs) {
      assert.equal(pair.length, 2, `${domainKey} conflict entries must be pairs`);
      for (const label of pair) assert.ok(domain.options.includes(label), `${domainKey}: ${label}`);
    }
  }
});

test('each approved pair replaces in both selection orders', () => {
  const F = make();
  for (const [domainKey, pairs] of Object.entries(APPROVED_PAIRS)) {
    for (const [left, right] of pairs) {
      const forward = F.applyMseSelection({ [domainKey]: [left] }, domainKey, right, false);
      assert.deepEqual(forward.selection[domainKey], [right]);
      assert.deepEqual(forward.removed, [left]);
      const reverse = F.applyMseSelection({ [domainKey]: [right] }, domainKey, left, false);
      assert.deepEqual(reverse.selection[domainKey], [left]);
      assert.deepEqual(reverse.removed, [right]);
    }
  }
});

test('all stale conflicts are removed in registry order while unrelated findings survive', () => {
  const F = make();
  const input = {
    thoughtContent: ['active SI', 'homicidal ideation', 'obsessions', 'passive SI'],
    mood: ['"anxious"'],
  };
  const before = structuredClone(input);
  const result = F.applyMseSelection(input, 'thoughtContent', 'no SI/HI', false);
  assert.deepEqual(result.selection.thoughtContent, ['obsessions', 'no SI/HI']);
  assert.deepEqual(result.selection.mood, ['"anxious"']);
  assert.deepEqual(result.removed, ['passive SI', 'active SI', 'homicidal ideation']);
  assert.deepEqual(input, before, 'caller state must not be mutated');
  assert.notEqual(result.selection, input);
  assert.notEqual(result.selection.mood, input.mood);
});

test('report and observation remain allowed together', () => {
  const F = make();
  const result = F.applyMseSelection(
    { perception: ['denies hallucinations'] },
    'perception',
    'responding to internal stimuli',
    false,
  );
  assert.deepEqual(result.selection.perception, [
    'denies hallucinations',
    'responding to internal stimuli',
  ]);
  assert.deepEqual(result.removed, []);
});

test('ordinary multi-select and single-choice behavior are preserved', () => {
  const F = make();
  assert.deepEqual(
    F.applyMseSelection({ affect: ['labile'] }, 'affect', 'labile', false).selection.affect,
    [],
  );
  assert.deepEqual(
    F.applyMseSelection({ mood: ['"anxious"'] }, 'mood', '"angry"', true).selection.mood,
    ['"angry"'],
  );
  assert.deepEqual(
    F.applyMseSelection({ mood: ['"angry"'] }, 'mood', '"angry"', true).selection.mood,
    [],
  );
});

test('unknown selections and malformed conflict entries fail soft', () => {
  const F = make();
  assert.deepEqual(
    F.applyMseSelection({ cognition: ['alert'] }, 'unknown', 'unknown', false),
    { selection: { cognition: ['alert'] }, removed: [] },
  );
  F.MSE_CONFLICTS.cognition.push(['oriented x4'], null, ['oriented x4', 7]);
  assert.doesNotThrow(() => F.applyMseSelection(
    { cognition: ['oriented x3'] }, 'cognition', 'oriented x4', false,
  ));
});
