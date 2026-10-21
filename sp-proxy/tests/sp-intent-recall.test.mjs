// Intent-recognition recall and precision over realistic learner phrasings, for every case
// in sp-interview.pack.json, against the SAME engine the proxy and the offline simulator run
// (sp.mjs _internals.deriveState / computeCoverage; the pattern compilation below mirrors
// compileIntents exactly: `new RegExp(p, 'i')`, any pattern matching credits the intent).
//
// Why this exists (2026-10-21 audit): the coverage map, the live coach, rapport, the gated
// disclosures and the LLM evaluator ("COVERAGE_MAP — trust it") all read this one recogniser.
// Measured before the corpus landed, 77 of 183 realistic Dana phrasings were unrecognised, an
// ordinary introduction ("hearing how things have been") was credited as a psychosis screen,
// "Don't worry about taking your time" cost rapport as premature reassurance, and "Do you have a
// plan for when you leave the hospital?" opened the suicide-plan disclosure after a screen —
// the D14 boundary held only for the single sentence the benchmark corpus tested.
//
// Shape (fixtures/intent-recall-corpus.json):
//   required   every phrasing must be recognised for its intent — a recall floor that may only rise
//   proposed   reported, never failed: vocabulary that needs a faculty decision first
//   mustNot    precision: a phrasing that must NOT be credited for the named intents or flags
//   interview  an ordinary full interview that must leave no checklist row `missed`
//   gateScenarios  the D14 boundary pinned across phrasings, plus the gates that MUST still open
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { _internals } from '../netlify/functions/sp.mjs';

const { deriveState, computeCoverage } = _internals;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(__dirname, '..', '..', '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const CORPUS_PATH = path.join(__dirname, 'fixtures', 'intent-recall-corpus.json');
const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

function caseById(id) {
  const caseDef = pack.cases.find((c) => c.id === id);
  assert.ok(caseDef, `corpus names a case the pack does not carry: ${id}`);
  return caseDef;
}

// Exactly sp.mjs compileIntents / matchIntents.
function recognised(caseDef, text) {
  return caseDef.intents
    .filter((it) => it.patterns.some((p) => new RegExp(p, 'i').test(text)))
    .map((it) => it.id);
}

test('every corpus case and intent exists in the pack (a renamed intent must not silently empty a floor)', () => {
  for (const [caseId, entry] of Object.entries(corpus.cases)) {
    const caseDef = caseById(caseId);
    const known = new Set(caseDef.intents.map((it) => it.id));
    for (const bucket of ['required', 'proposed']) {
      for (const intent of Object.keys(entry[bucket] ?? {})) {
        assert.ok(known.has(intent), `${caseId}: ${bucket} names unknown intent ${intent}`);
      }
    }
    for (const row of entry.mustNot ?? []) {
      for (const intent of row.intents) assert.ok(known.has(intent), `${caseId}: mustNot names unknown intent ${intent}`);
    }
  }
  for (const scenario of corpus.gateScenarios) {
    const caseDef = caseById(scenario.case);
    const gates = new Set(caseDef.gated.map((g) => g.id));
    for (const id of [...scenario.mustUnlock, ...scenario.mustNotUnlock]) assert.ok(gates.has(id), `${scenario.id}: unknown gate ${id}`);
  }
});

test('required phrasings are recognised for their intent (recall floor — may only rise)', () => {
  const failures = [];
  let total = 0;
  for (const [caseId, entry] of Object.entries(corpus.cases)) {
    const caseDef = caseById(caseId);
    for (const [intent, phrasings] of Object.entries(entry.required ?? {})) {
      assert.ok(Array.isArray(phrasings) && phrasings.length > 0, `${caseId}/${intent}: empty required list`);
      for (const text of phrasings) {
        total += 1;
        const hits = recognised(caseDef, text);
        if (!hits.includes(intent)) failures.push(`${caseId} ${intent}: ${JSON.stringify(text)} → [${hits.join(', ')}]`);
      }
    }
  }
  assert.ok(total >= 150, `the corpus shrank to ${total} required phrasings — it may only grow`);
  assert.deepEqual(failures, [], `unrecognised required phrasings:\n  ${failures.join('\n  ')}`);
});

test('proposed phrasings are reported, never failed', () => {
  let proposed = 0;
  let recognisedCount = 0;
  for (const [caseId, entry] of Object.entries(corpus.cases)) {
    const caseDef = caseById(caseId);
    for (const [intent, phrasings] of Object.entries(entry.proposed ?? {})) {
      for (const text of phrasings) {
        proposed += 1;
        if (recognised(caseDef, text).includes(intent)) recognisedCount += 1;
      }
    }
  }
  console.log(`intent recall — proposed vocabulary (faculty decision pending): ${recognisedCount}/${proposed} recognised`);
});

test('mustNot phrasings are not credited for the named intents or flags (precision)', () => {
  const failures = [];
  for (const [caseId, entry] of Object.entries(corpus.cases)) {
    const caseDef = caseById(caseId);
    for (const row of entry.mustNot ?? []) {
      const hits = recognised(caseDef, row.text);
      const wrong = row.intents.filter((intent) => hits.includes(intent));
      if (wrong.length) failures.push(`${caseId}: ${JSON.stringify(row.text)} credited ${wrong.join(', ')} (all hits: ${hits.join(', ')})`);
    }
  }
  assert.deepEqual(failures, [], `false credits:\n  ${failures.join('\n  ')}`);
});

test('an ordinary full interview leaves no checklist row missed and ends with positive rapport', () => {
  for (const [caseId, entry] of Object.entries(corpus.cases)) {
    if (!entry.interview) continue;
    const caseDef = caseById(caseId);
    const state = deriveState(caseDef, entry.interview.turns);
    const coverage = computeCoverage(caseDef, state);
    const unrecognisedTurns = entry.interview.turns
      .map((text, index) => ({ index: index + 1, text, hits: recognised(caseDef, text) }))
      .filter((turn) => turn.hits.length === 0);
    assert.deepEqual(unrecognisedTurns, [], `${caseId}: turns with no recognised intent`);
    if (entry.interview.noMissedRows) {
      const missed = coverage.filter((row) => row.status === 'missed').map((row) => row.id);
      assert.deepEqual(missed, [], `${caseId}: checklist rows scored missed after every topic was asked`);
    }
    if (Number.isInteger(entry.interview.minRapport)) {
      assert.ok(state.rapport >= entry.interview.minRapport, `${caseId}: rapport ${state.rapport} < ${entry.interview.minRapport}`);
    }
    for (const gate of entry.interview.mustUnlock ?? []) {
      assert.ok(state.unlocked[gate], `${caseId}: gate ${gate} did not open during the full interview`);
    }
  }
});

test('gate scenarios: the D14 discharge boundary holds across phrasings and the real gates still open', () => {
  for (const scenario of corpus.gateScenarios) {
    const caseDef = caseById(scenario.case);
    const state = deriveState(caseDef, scenario.turns);
    for (const gate of scenario.mustUnlock) assert.ok(state.unlocked[gate], `${scenario.id}: ${gate} did not unlock`);
    for (const gate of scenario.mustNotUnlock) assert.ok(!state.unlocked[gate], `${scenario.id}: ${gate} unlocked — ${scenario.reference}`);
    for (const intent of scenario.mustNotCover ?? []) assert.ok(!state.covered[intent], `${scenario.id}: ${intent} credited — ${scenario.reference}`);
  }
});

test('every pattern in the pack compiles as the engine compiles it', () => {
  for (const caseDef of pack.cases) {
    for (const it of caseDef.intents) {
      for (const p of it.patterns) {
        assert.doesNotThrow(() => new RegExp(p, 'i'), `${caseDef.id}/${it.id}: ${p}`);
      }
    }
  }
});
