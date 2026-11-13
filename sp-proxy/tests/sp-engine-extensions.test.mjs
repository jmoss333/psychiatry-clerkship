// Engine extensions the proxy must tolerate BEFORE any pack carries them (server-first rollout:
// the pack goes live from main on merge, the function only on deploy).
//
//   excludePatterns   per intent. An intent that carries them is credited only when some SENTENCE
//                     of the learner's turn matches a pattern and matches no exclude. An intent
//                     without them is matched against the whole turn, exactly as before.
//   deflectByIntent   per gate, { intentId: line }. While the gate is locked and that intent is
//                     what the learner just said, `line` is the deflection the actor is given.
//
// Real property (G-1): an intent that carries no excludePatterns is credited for exactly the turns
// it was credited for before; an intent that carries them cannot be credited, and its gate cannot
// be opened, by a sentence an exclude names. Inputs: every case in the canonical pack, every
// string in the recall corpus, and the fixtures below.
// Known misses (G-2): nine of the tests below fail on the engine as it stood at a31e16dc. The
// seven that pass on both sides pin what must NOT change or must NOT happen: the fixture sanity
// test, the three titled "unchanged", "an exclude in one sentence does not veto a question in
// another", "an empty excludePatterns list changes nothing", and "the per-intent line is offered
// only on the turn that intent was said".
//
// Every pattern and patient line in this file is a FIXTURE written for the mechanism. None is the
// vocabulary proposed for the pack; that needs a faculty ruling and arrives in its own PR.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { _internals } from '../netlify/functions/sp.mjs';

// The exported surface is pinned by sp-handler.test.mjs and is deliberately not widened here:
// `deriveState(...).lastIntents` IS the matcher's output for the last turn, so every rule below
// is reached through it.
const { deriveState, actorSystem } = _internals;
const hitsOf = (caseDef, text) => deriveState(caseDef, [text]).lastIntents;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(__dirname, '..', '..', '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const CORPUS_PATH = path.join(__dirname, 'fixtures', 'intent-recall-corpus.json');
const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

const DANA = 'sp_depression_gated_si_001';
const SCREEN = ['si_direct', 'si_passive', 'si_euphemism'];
const FIXTURE_EXCLUDES = [
  '\\bthe chart says\\b',
  "\\byou(?:'re| are) not\\b[^.?!]*\\bare you\\b",
];
const FIXTURE_LEADING = {
  id: 'si_leading',
  label: 'fixture: leading negative',
  category: 'safety',
  patterns: ["\\byou(?:'re| are) not\\b[^.?!]*\\bkill(?:ing)? yourself\\b[^.?!]*\\bare you\\b"],
};
const FIXTURE_LINE = 'FIXTURE-PER-INTENT-DEFLECTION';

const dana = () => structuredClone(pack.cases.find((c) => c.id === DANA));
function withExcludes() {
  const c = dana();
  for (const id of SCREEN) c.intents.find((it) => it.id === id).excludePatterns = [...FIXTURE_EXCLUDES];
  return c;
}
function withLeading() {
  const c = withExcludes();
  c.intents.push(structuredClone(FIXTURE_LEADING));
  c.gated[0].deflectByIntent = { si_leading: FIXTURE_LINE };
  return c;
}
/** The whole-turn rule as it stood before this change, kept here as the independent reference. */
function legacyHits(caseDef, text) {
  return caseDef.intents
    .filter((it) => it.patterns.some((p) => new RegExp(p, 'i').test(text)))
    .map((it) => it.id);
}
function everyString(value, acc = new Set()) {
  if (typeof value === 'string') acc.add(value);
  else if (Array.isArray(value)) value.forEach((v) => everyString(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => everyString(v, acc));
  return acc;
}

test('fixture sanity: the canonical case is the one these tests assume', () => {
  const c = dana();
  assert.equal(c.gated[0].id, 'si_active');
  assert.ok(c.gated[0].requiresIntents.includes('si_direct'));
  assert.ok(c.gated[0].repeatAsk, 'si_active has a repeatAsk line');
  for (const id of SCREEN) assert.ok(c.intents.some((it) => it.id === id), id);
});

test('sentences end at . ? or !, a run of them is one boundary, and odd input is still matched', () => {
  const c = dana();
  const probe = (patterns, excludePatterns) => {
    const k = structuredClone(c);
    k.intents.push({ id: 'fx_seg', label: 'fixture', category: 'history', patterns, excludePatterns });
    return (text) => hitsOf(k, text).includes('fx_seg');
  };
  const vetoed = probe(['\\bbeta\\b'], ['\\balpha\\b']);
  for (const text of ['Alpha. Beta', 'Alpha? Beta.', 'Alpha! Beta?', 'Alpha... beta', 'Alpha?! Beta', 'beta']) {
    assert.equal(vetoed(text), true, `${JSON.stringify(text)}: the exclude sits in another sentence`);
  }
  for (const text of ['Alpha, beta.', 'alpha beta', 'Beta; alpha!']) {
    assert.equal(vetoed(text), false, `${JSON.stringify(text)}: the exclude sits in the same sentence`);
  }
  // No sentence character at all, and nothing but sentence characters: the turn is one segment.
  assert.equal(probe(['^$'], ['never'])(''), true);
  assert.equal(probe(['^\\?!$'], ['never'])('?!'), true);
});

test('unchanged: an intent without excludePatterns is matched on the whole turn, for every case and every corpus phrasing', () => {
  const phrasings = [...everyString(corpus)];
  assert.ok(phrasings.length > 300, `corpus shrank to ${phrasings.length} strings`);
  let compared = 0;
  for (const caseDef of pack.cases) {
    const plain = new Set(caseDef.intents.filter((it) => !it.excludePatterns).map((it) => it.id));
    assert.ok(plain.size > 0, `${caseDef.id} has no intent without excludePatterns`);
    for (const text of phrasings) {
      const now = hitsOf(caseDef, text).filter((id) => plain.has(id));
      const before = legacyHits(caseDef, text).filter((id) => plain.has(id));
      assert.deepEqual(now, before, `${caseDef.id}: ${JSON.stringify(text)}`);
      compared += 1;
    }
  }
  assert.ok(compared > 1500, `only ${compared} comparisons ran`);
});

test('unchanged: a pattern that spans two sentences still credits an intent that has no excludes', () => {
  const c = dana();
  c.intents.push({ id: 'fx_span', label: 'fixture', category: 'history', patterns: ['\\balpha\\b.*\\bbeta\\b'] });
  assert.equal(deriveState(c, ['Alpha first. Then beta.']).covered.fx_span, true);
});

test('an exclude vetoes a match in the same sentence', () => {
  const text = 'The chart says you have had thoughts of killing yourself.';
  assert.equal(deriveState(dana(), [text]).unlocked.si_active, true, 'today this sentence opens the gate');
  const s = deriveState(withExcludes(), [text]);
  assert.equal(s.covered.si_direct, undefined);
  assert.equal(s.unlocked.si_active, undefined);
});

test('an exclude in one sentence does not veto a question in another', () => {
  const s = deriveState(withExcludes(), ['The chart says you were admitted last night. Have you had thoughts of killing yourself?']);
  assert.equal(s.covered.si_direct, true);
  assert.equal(s.unlocked.si_active, true);
});

test('with excludes an intent is matched sentence by sentence, so a pattern cannot reach across one', () => {
  const c = dana();
  c.intents.push({ id: 'fx_span', label: 'fixture', category: 'history',
    patterns: ['\\balpha\\b.*\\bbeta\\b'], excludePatterns: ['\\bnever-present\\b'] });
  assert.equal(deriveState(c, ['Alpha first. Then beta.']).covered.fx_span, undefined);
  assert.equal(deriveState(c, ['Alpha first, then beta.']).covered.fx_span, true);
});

test('an empty excludePatterns list changes nothing for that intent', () => {
  const c = dana();
  for (const id of SCREEN) c.intents.find((it) => it.id === id).excludePatterns = [];
  const turns = corpus.cases[DANA].interview.turns;
  assert.deepEqual(deriveState(c, turns), deriveState(dana(), turns));
});

test('a leading negative is recorded as its own intent and opens nothing', () => {
  const s = deriveState(withLeading(), ["You're not thinking of killing yourself, are you?"]);
  assert.deepEqual(s.lastIntents, ['si_leading']);
  assert.equal(s.covered.si_direct, undefined);
  assert.equal(s.unlocked.si_active, undefined);
});

test('while the gate is locked, the actor is given the per-intent line as its deflection', () => {
  const c = withLeading();
  const s = deriveState(c, ["You're not thinking of killing yourself, are you?"]);
  const prompt = actorSystem(c, s);
  assert.ok(prompt.includes(FIXTURE_LINE), 'the per-intent line reaches the actor');
  assert.ok(!prompt.includes(c.gated[0].reveal.slice(0, 40)), 'the locked reveal still does not');
});

test('the per-intent line is offered only on the turn that intent was said', () => {
  const c = withLeading();
  const before = actorSystem(c, deriveState(c, ['Hello.']));
  assert.ok(!before.includes(FIXTURE_LINE));
  const after = actorSystem(c, deriveState(c, ["You're not thinking of killing yourself, are you?", 'How is your sleep?']));
  assert.ok(!after.includes(FIXTURE_LINE));
});

test('a deflectByIntent key the learner did not say, or an empty line, leaves the deflection as it was', () => {
  const plain = dana();
  const c = withLeading();
  c.gated[0].deflectByIntent = { si_leading: '', never_said: FIXTURE_LINE };
  const turn = ["You're not thinking of killing yourself, are you?"];
  const s = deriveState(c, turn);
  const gateOf = (prompt) => prompt.slice(prompt.indexOf('"gates":'));
  assert.ok(!actorSystem(c, s).includes(FIXTURE_LINE));
  assert.ok(gateOf(actorSystem(c, s)).includes(JSON.stringify(plain.gated[0].deflectEuphemism).slice(1, 30)),
    'falls back to the line the gate offered before');
});

test('after disclosure, a leading negative neither re-locks the gate nor offers a denial', () => {
  const c = withLeading();
  const s = deriveState(c, ['Have you had thoughts of killing yourself?', "You're not going to kill yourself, are you?"]);
  assert.equal(s.unlocked.si_active, true);
  assert.deepEqual(s.lastIntents, ['si_leading']);
  const prompt = actorSystem(c, s);
  assert.ok(!prompt.includes(FIXTURE_LINE), 'an unlocked gate carries its reveal and repeat line, not a deflection');
  assert.ok(prompt.includes(c.gated[0].reveal.slice(0, 40)));
});

test('unchanged: unknown case, intent and gate fields do not throw', () => {
  const c = dana();
  c.cues = [{ id: 'x', patientPatterns: ['y'] }];
  c.intents[0].somethingNew = 1;
  c.gated[0].somethingElse = { a: 1 };
  assert.doesNotThrow(() => actorSystem(c, deriveState(c, ['Hello.'])));
});

test('patterns exposing only .map still compile, with or without excludes', () => {
  const always = { map: () => [{ test: () => true }] };
  const c = dana();
  c.intents.push({ id: 'fx_map', label: 'fixture', category: 'history', patterns: always });
  assert.equal(deriveState(c, ['anything']).covered.fx_map, true);
  c.intents.push({ id: 'fx_map_ex', label: 'fixture', category: 'history', patterns: always, excludePatterns: ['\\bveto\\b'] });
  assert.equal(deriveState(c, ['anything']).covered.fx_map_ex, true);
  assert.equal(deriveState(c, ['a veto here']).covered.fx_map_ex, undefined);
});

test('a malformed excludePatterns fails loudly rather than silently dropping the exclusion', () => {
  const c = dana();
  c.intents.find((it) => it.id === 'si_direct').excludePatterns = 'the chart says';
  assert.throws(() => deriveState(c, ['Hello.']), TypeError);
});
