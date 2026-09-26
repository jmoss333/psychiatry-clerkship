// Morgan (sp_alcohol_ambivalence_001) entered the reviewed learner pack on 2026-09-26 so the
// spoken room could offer him. The attested source of the case is still the local prototype
// (sp-interview.local-cases.js, attested 2026-09-09), which the faculty preview and the Dana
// live-context prototype import. This test pins the exact relationship between the two copies:
// the pack's Morgan is the local Morgan plus the uniform suicide screen the pack's D3/D12 rule
// requires of every case — and nothing else — and that screen is authored content, so the pack
// row is pending until it is re-attested. A drift between the two copies anywhere else is a
// finding, not a merge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pack = JSON.parse(fs.readFileSync(path.join(here, '..', 'sp-interview.pack.json'), 'utf8'));
const localModule = require('../sp-interview.local-cases.js');
const localCases = localModule.cases || localModule.default.cases;

const MORGAN = 'sp_alcohol_ambivalence_001';
const SCREEN_INTENTS = ['si_direct', 'si_passive', 'si_euphemism'];
const packMorgan = pack.cases.find((c) => c.id === MORGAN);
const localMorgan = localCases.find((c) => c.id === MORGAN);
const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutScreen(caseDef) {
  const copy = clone(caseDef);
  copy.intents = copy.intents.filter((it) => !SCREEN_INTENTS.includes(it.id));
  for (const id of SCREEN_INTENTS) delete copy.responses[id];
  copy.checklist = copy.checklist.filter((c) => c.id !== 'c_si');
  delete copy.hints.c_si;
  copy.criticalMiss = null;
  delete copy.facultyReview;
  delete copy.speechProfile;
  // The focused case recorded self-harm history as "not established"; the uniform screen
  // establishes it (negative), so that one limit is part of the screen delta.
  copy.localGrounding.informationLimits.safety = localMorgan.localGrounding.informationLimits.safety;
  // The local registry labels difficulty ("developing"); the pack's engine reads a per-mode object
  // (difficulty.realistic.guardedShift in the offline mock), so the pack copy takes the shared shape.
  copy.difficulty = localMorgan.difficulty;
  return copy;
}

test('Morgan is in the pack, last, and both copies exist', () => {
  assert.ok(packMorgan, 'pack carries Morgan');
  assert.ok(localMorgan, 'the local prototype still carries Morgan');
  assert.equal(pack.cases[pack.cases.length - 1].id, MORGAN, 'appended after the three original cases');
  assert.equal(pack.cases.length, 4);
});

test('the pack Morgan is the attested local Morgan plus the uniform suicide screen, and nothing else', () => {
  const localWithoutReview = clone(localMorgan);
  delete localWithoutReview.facultyReview;
  delete localWithoutReview.speechProfile;
  assert.deepEqual(withoutScreen(packMorgan), localWithoutReview);
});

test('the screen uses the pack-wide patterns: passive and euphemism identical to Dana, direct pronoun-adjusted', () => {
  const intentsById = Object.fromEntries(packMorgan.intents.map((it) => [it.id, it]));
  const danaById = Object.fromEntries(dana.intents.map((it) => [it.id, it]));
  for (const id of SCREEN_INTENTS) {
    assert.equal(intentsById[id].category, 'safety');
    assert.equal(intentsById[id].coverage, 'core');
    assert.equal(intentsById[id].quality, id === 'si_direct' ? 'best' : 'partial');
  }
  assert.deepEqual(intentsById.si_passive.patterns, danaById.si_passive.patterns);
  assert.deepEqual(intentsById.si_euphemism.patterns, danaById.si_euphemism.patterns);
  assert.deepEqual(
    intentsById.si_direct.patterns,
    danaById.si_direct.patterns.map((p) => p.replace('take (your|her) (own )?life', 'take (your|their) (own )?life')),
  );
  assert.ok(intentsById.si_direct.patterns.some((p) => p.includes('their')), 'Morgan uses they/them');
  // The screen sits with the case's other safety intent, ahead of the flag intents.
  const ids = packMorgan.intents.map((it) => it.id);
  assert.ok(ids.indexOf('withdrawal_safety') < ids.indexOf('si_direct'));
  assert.ok(ids.indexOf('si_euphemism') < ids.indexOf('confront_label'));
});

test('the pack copy carries the engine difficulty object every other case has (the offline mock reads it in Realistic mode)', () => {
  assert.deepEqual(packMorgan.difficulty, dana.difficulty);
  assert.equal(typeof localMorgan.difficulty, 'string', 'the local registry keeps its label');
});

test('the euphemism replies fit every stem the intent fires on, not only "hurt yourself"', () => {
  // si_euphemism also matches "dark thoughts", "disappear" and a bare "what's the point"; the offline
  // mock serves variants in order, so the FIRST guarded and open lines must read naturally after any
  // of them, and every line still answers only the narrow question (D12).
  const reply = packMorgan.responses.si_euphemism;
  assert.match(reply.guarded[0], /tired of the mornings/i);
  assert.match(reply.open[0], /ask it plainly/i);
  for (const line of [...reply.guarded, ...reply.open]) assert.doesNotMatch(line, /\bsuicid|kill/i, 'a euphemism reply never upgrades the question');
});

test('every screen intent has an in-character, rapport-banded, negative reply; nothing is a dose or a crisis number', () => {
  for (const id of SCREEN_INTENTS) {
    const reply = packMorgan.responses[id];
    assert.ok(reply && Array.isArray(reply.guarded) && Array.isArray(reply.open), `${id} is banded like every other Morgan reply`);
    for (const line of [...reply.guarded, ...reply.open]) {
      assert.ok(line.trim().length > 20, `${id}: a real line`);
      assert.match(line, /\bno\b|not/i, `${id}: Morgan's screen is negative`);
      assert.doesNotMatch(line, /\d+\s?(mg|mcg|mL)\b/, 'no dose literal');
      assert.doesNotMatch(line, /988|741741|911/, 'no crisis number in dialogue');
    }
  }
  assert.doesNotMatch(JSON.stringify(packMorgan), /\d+\s?(mg|mcg|mL)\b/);
  // Every fact the screen lines lean on is in Morgan's own inventory: the stairs at home after
  // drinking, foggy mornings, Maya (adult daughter), living alone. Nothing new is asserted.
  const inventory = JSON.stringify(localMorgan).toLowerCase();
  for (const fact of ['stairs', 'foggy mornings', 'maya', 'daughter', 'lives alone']) assert.ok(inventory.includes(fact), fact);
  assert.match(packMorgan.localGrounding.informationLimits.safety, /authored negative/);
  assert.match(packMorgan.localGrounding.informationLimits.safety, /violence and broader substance-use histories are not established/);
});

test('c_si is critical with the D12 partial-credit wiring; the coach hint and debrief text exist', () => {
  const cSi = packMorgan.checklist.find((c) => c.id === 'c_si');
  assert.deepEqual(cSi, {
    id: 'c_si',
    label: 'Suicide: asked directly, in plain language',
    intents: ['si_direct'],
    partialIfOnly: ['si_euphemism', 'si_passive'],
    critical: true,
  });
  assert.equal(packMorgan.checklist.filter((c) => c.critical).length, 1, 'one critical item');
  assert.match(packMorgan.hints.c_si, /killing themselves/);
  // The case penalises labels (confront_label lowers rapport); the coaching must not label Morgan either.
  assert.doesNotMatch(JSON.stringify([packMorgan.hints.c_si, packMorgan.criticalMiss]), /minimi[sz]/i);
  for (const key of ['partial', 'missed', 'rehearse', 'ref', 'reframe']) {
    assert.equal(typeof packMorgan.criticalMiss[key], 'string');
    assert.ok(packMorgan.criticalMiss[key].length > 10);
  }
  assert.match(packMorgan.criticalMiss.rehearse, /killing yourself/);
  assert.match(packMorgan.criticalMiss.ref, /pg_interview\.md/);
});

test('the pack row is attested on the screen lines (2026-09-26), later than the local copy it extends', () => {
  // The owner read the authored screen lines and attested them on 2026-09-26; the attestation
  // validator forbids a non-reviewed case in a reviewed pack, so this is the only state in which
  // Morgan can ship. The local prototype keeps its own, earlier attestation of the case without
  // the screen.
  assert.deepEqual(packMorgan.facultyReview, {
    status: 'reviewed',
    reviewer: localMorgan.facultyReview.reviewer,
    lastReviewed: '2026-09-26',
  });
  assert.equal(localMorgan.facultyReview.status, 'reviewed', 'the local prototype keeps its attestation');
  assert.ok(packMorgan.facultyReview.lastReviewed > localMorgan.facultyReview.lastReviewed, 'the pack review post-dates the local one');
});

test('the speech profile takes the pack draft shape (the pack speech engine is draft); the voice comes from the audition table', () => {
  // validate_attestation_consistency.py forbids a reviewed profile while speechEngine is draft and
  // closes the cadence vocabulary, so the local prototype's reviewed "marin" profile cannot be
  // carried over. The spoken room resolves Morgan's voice from REALTIME_VOICES (marin) and his
  // delivery from REALTIME_DELIVERY (the preview's portrayal) — sp-realtime-session.test.mjs.
  const profile = packMorgan.speechProfile;
  assert.deepEqual(Object.keys(profile).sort(), Object.keys(dana.speechProfile).sort());
  assert.equal(profile.status, 'draft-pending-attestation');
  assert.equal(profile.cadence, 'measured-flat');
  assert.equal(profile.speakingRate, localMorgan.speechProfile.speakingRate);
  assert.deepEqual(profile.facultyReview, dana.speechProfile.facultyReview);
  for (const key of ['provider', 'providerModel', 'voiceId', 'voiceProvenance', 'adapterMappingVersion', 'providerSettings']) {
    assert.equal(profile[key], null, `${key} is null while draft`);
  }
});
