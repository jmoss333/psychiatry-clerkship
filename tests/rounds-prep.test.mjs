import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../02_Clinical_Skills/Oral_Presentations/oral-presentation-module.html', import.meta.url), 'utf8');
function helpers() {
  const start = source.indexOf('function oralSession(');
  const end = source.indexOf('\nfunction ShortUpdates(', start);
  assert.ok(start >= 0 && end > start, 'short-update session behavior is available');
  return new Function('URLSearchParams', source.slice(start, end) + '\nreturn {oralSession,oralEntry,oralTransition,oralRestore:typeof oralRestore === "function" ? oralRestore : null};')(URLSearchParams);
}

test('fresh and obsolete checkpoints open rounds with no running time or progress', () => {
  const { oralSession } = helpers();
  for (const raw of [null, 'broken', { v: 0, format: 'collateral' }, { v: 2 }]) {
    const s = oralSession(raw);
    assert.equal(s.format, 'rounds');
    assert.equal(s.paused, false);
    assert.deepEqual(s.items.rounds, { seconds: 0, step: 0, view: 'quick', example: false, done: [], repAt: null });
    assert.equal(s.items.collateral.seconds, 0);
  }
});

test('deep links allow only the two known formats and two views', () => {
  const { oralEntry } = helpers();
  assert.deepEqual(oralEntry('?format=collateral&view=guided&patient=untrusted'), { format: 'collateral', view: 'guided' });
  assert.deepEqual(oralEntry('?format=rounds&view=quick'), { format: 'rounds', view: 'quick' });
  assert.deepEqual(oralEntry('?format=unknown&view=unknown'), { format: null, view: null });
  assert.deepEqual(oralEntry('?format=rounds&format=collateral&view=guided&view=quick'), { format: null, view: null });
});

test('a repeated entry link preserves the checkpoint while a different link opens its requested view', () => {
  const { oralRestore, oralTransition: move } = helpers();
  assert.equal(typeof oralRestore, 'function');
  const link = '?format=collateral&view=guided';
  let s = oralRestore(null, link);
  assert.equal(s.format, 'collateral');
  assert.equal(s.items.collateral.view, 'guided');
  s = move(move(s, { type: 'format', value: 'rounds' }), { type: 'pause' });
  s = oralRestore(JSON.parse(JSON.stringify(s)), link);
  assert.equal(s.format, 'rounds');
  assert.equal(s.items.rounds.view, 'quick');
  assert.equal(s.paused, true);
  s = oralRestore(s, '?format=rounds&view=guided');
  assert.equal(s.format, 'rounds');
  assert.equal(s.items.rounds.view, 'guided');
  assert.equal(s.paused, false);
});

test('restoration strips arbitrary text and normalizes malformed progress', () => {
  const { oralSession } = helpers();
  const s = oralSession({ v: 1, format: 'collateral', paused: true, text: 'untrusted', entry: { format: 'untrusted', view: 'untrusted', text: 'untrusted' }, items: {
    collateral: { seconds: 4000, step: 30, view: 'guided', example: true, done: [0, 0, 4, 6, '1'], repAt: 'untrusted', notes: 'untrusted' },
    rounds: { seconds: -1, step: -1, view: 'unknown', done: null },
  } });
  assert.deepEqual(s.items.collateral, { seconds: 30, step: 4, view: 'guided', example: true, done: [0, 4], repAt: null });
  assert.deepEqual(s.items.rounds, { seconds: 0, step: 0, view: 'quick', example: false, done: [], repAt: null });
  assert.equal(s.paused, true);
  assert.equal(JSON.stringify(s).includes('untrusted'), false);
});

test('view changes and pause/resume preserve the current cue, example and elapsed time', () => {
  const { oralSession, oralTransition: move } = helpers();
  let s = oralSession(null);
  s = move(s, { type: 'step', value: 2 });
  s = move(s, { type: 'seconds', value: 18 });
  s = move(s, { type: 'example' });
  s = move(s, { type: 'view', value: 'guided' });
  s = move(s, { type: 'view', value: 'quick' });
  s = move(s, { type: 'pause' });
  assert.equal(s.paused, true);
  s = move(s, { type: 'resume' });
  assert.equal(s.paused, false);
  assert.equal(s.items.rounds.step, 2);
  assert.equal(s.items.rounds.seconds, 18);
  assert.equal(s.items.rounds.example, true);
});

test('switching formats and resetting one leaves the other practice intact', () => {
  const { oralSession, oralTransition: move } = helpers();
  let s = move(oralSession(null), { type: 'step', value: 3 });
  s = move(s, { type: 'seconds', value: 24 });
  s = move(s, { type: 'done', value: 1 });
  const original = JSON.stringify(s);
  let other = move(s, { type: 'format', value: 'collateral' });
  other = move(other, { type: 'seconds', value: 12 });
  other = move(other, { type: 'reset' });
  other = move(other, { type: 'format', value: 'rounds' });
  assert.equal(other.items.rounds.seconds, 24);
  assert.equal(other.items.rounds.step, 3);
  assert.deepEqual(other.items.rounds.done, [1]);
  assert.equal(other.items.collateral.seconds, 0);
  assert.equal(JSON.stringify(s), original, 'previous React state is not mutated');
});

test('a completed timer does not infer completed cues or a clinical rating', () => {
  const { oralSession, oralTransition: move } = helpers();
  const s = move(oralSession(null), { type: 'seconds', value: 80 });
  assert.equal(s.items.rounds.seconds, 60);
  assert.deepEqual(s.items.rounds.done, []);
  assert.equal(s.items.rounds.step, 0);
  assert.equal(s.items.rounds.repAt, null);
});

test('invalid transitions cannot inject storage content or an unknown format', () => {
  const { oralSession, oralTransition: move } = helpers();
  const s = oralSession(null);
  for (const action of [null, { type: 'format', value: '__proto__' }, { type: 'view', value: 'untrusted' }, { type: 'step', value: NaN }, { type: 'seconds', value: Infinity }, { type: 'done', value: 99 }, { type: 'record', value: 'untrusted' }]) {
    assert.deepEqual(move(s, action), s);
  }
});

test('a saved rep identifier survives resumption and is cleared only for a fresh rep', () => {
  const { oralSession, oralTransition: move } = helpers();
  let s = move(oralSession(null), { type: 'record', value: '2026-09-04T20:00:00.000Z' });
  s = oralSession(JSON.parse(JSON.stringify(s)));
  s = move(move(s, { type: 'pause' }), { type: 'resume' });
  assert.equal(s.items.rounds.repAt, '2026-09-04T20:00:00.000Z');
  assert.equal(move(s, { type: 'reset' }).items.rounds.repAt, null);
});
