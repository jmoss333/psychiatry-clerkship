import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { _internals } from '../netlify/functions/sp.mjs';

// #565 — a correct direct suicide question was refused at low rapport, and the refusal blamed the
// learner for asking. Approved 2026-09-17: the direct question discloses at any rapport, an earlier
// flag never blocks it, depth gates are unchanged, and no locked-gate context can hand the actor a
// line that attributes friction to the directness or timing of the question.

const pack = JSON.parse(fs.readFileSync(new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url), 'utf8'));
const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
const Q = 'Have you had thoughts of killing yourself?';
const state = (msgs) => _internals.deriveState(dana, msgs);

test('A: the first utterance of the encounter can be the safety question and it discloses', () => {
  const s = state([Q]);
  assert.equal(s.rapport, 0);
  assert.equal(s.unlocked.si_active, true);
});

test('C2: a collaborative opening, an accurate reflection, then one premature reassurance -- the question still discloses', () => {
  const s = state(['Hi, my name is Alex. Is this okay?', 'Tell me more about what brought you here.',
    'It sounds like this has been very difficult.', "Don't worry, everything will be okay.", Q]);
  assert.ok(s.rapport >= 1, `rapport ${s.rapport}`);
  assert.equal(s.unlocked.si_active, true);
  assert.deepEqual(s.flagHistory[3], ['premature_reassurance'], 'the reassurance is still flagged on its own turn');
});

test('D: a judgmental turn lowers rapport below zero and still cannot block the direct question', () => {
  const s = state(['You just need to snap out of it.', Q]);
  assert.ok(s.rapport < 0, `rapport ${s.rapport}`);
  assert.equal(s.unlocked.si_active, true);
});

test('E: asking twice is persistence, not a second refusal', () => {
  const s = state([Q, Q]);
  assert.equal(s.unlocked.si_active, true);
  const coverage = _internals.computeCoverage(dana, s);
  assert.equal(coverage.find((c) => c.id === 'c_si').status, 'observed');
});

test('depth gates still require the disclosure to have happened', () => {
  assert.equal(state(['Do you have a plan?']).unlocked.si_plan_detail, undefined);
  assert.equal(state(['Do you have a plan?']).unlocked.si_active, undefined);
  const after = state([Q, 'Do you have a plan?', 'Do you have access to those pills?']);
  assert.equal(after.unlocked.si_plan_detail, true);
  assert.equal(after.unlocked.si_means_detail, true);
});

test('the locked actor context never offers the "four minutes ago" line for a gate no rapport can lock', () => {
  const locked = _internals.actorSystem(dana, state([]));
  assert.doesNotMatch(locked, /four minutes/);
  assert.match(locked, /what do you mean, hurt/, 'a probe before the question is met with the euphemism line');
  const open = _internals.actorSystem(dana, state([Q]));
  assert.match(open, /"id":"si_active","status":"UNLOCKED"/);
});

test('rapport-gated gates in the other cases keep their low-rapport deflection in the locked context', () => {
  const marcus = pack.cases.find((c) => c.id === 'sp_mania_redirect_001');
  const locked = _internals.actorSystem(marcus, _internals.deriveState(marcus, []));
  const gate = marcus.gated.find((g) => g.requiresRapport > 0 && g.deflectLowRapport);
  assert.ok(gate, 'Marcus still has a rapport-gated disclosure');
  assert.ok(locked.includes(JSON.stringify(gate.deflectLowRapport).slice(1, -1)), 'its deflection is unchanged');
});
