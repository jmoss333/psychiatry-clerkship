// Contract for the shared timed-block store (block_store.js): load/validate/expire, save, and
// the receipt-side step marker. Evaluated with an in-memory localStorage and explicit nowMs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const src = readFileSync(new URL(`${BUILD}/block_store.js`, import.meta.url), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}
// eslint-disable-next-line no-new-func
const make = (ls) => new Function('localStorage', `${src}\nreturn {blockLoad, blockSave, blockClear, blockMarkStep, CW_BLOCK_TTL_MS};`)(ls);

const NOW = new Date(2026, 8, 2, 9, 0, 0).getTime();
const block = () => ({ v: 1, minutes: 10, createdAt: NOW - 60000, steps: [
  { kind: 'review', ref: 'review.html', n: 3, min: 2, title: '3 reviews that are due' },
  { kind: 'page', ref: 't_psychosis.md', min: 5, title: 'Psychosis' },
  { kind: 'qb', ref: 'question-bank-practice.html', n: 4, min: 3, title: '4 practice questions' },
] });

test('the store key is namespaced cw_ and round-trips a block', () => {
  const ls = memStorage(); const F = make(ls);
  F.blockSave(block());
  assert.deepEqual(ls.keys(), ['cw_block_v1']);
  assert.equal(F.blockLoad(NOW).steps.length, 3);
});

test('malformed or empty blocks load as null without throwing', () => {
  const ls = memStorage(); const F = make(ls);
  for (const raw of ['{not json', 'null', '{"v":2,"steps":[]}', '{"v":1,"steps":[]}', '{"v":1,"steps":"x"}']) {
    ls.setItem('cw_block_v1', raw);
    assert.equal(F.blockLoad(NOW), null, raw);
  }
});

test('a block older than the TTL is pruned on load, and a future-dated one is not trusted', () => {
  const ls = memStorage(); const F = make(ls);
  F.blockSave(Object.assign(block(), { createdAt: NOW - F.CW_BLOCK_TTL_MS - 1 }));
  assert.equal(F.blockLoad(NOW), null);
  assert.deepEqual(ls.keys(), [], 'stale block removed, not just hidden');
  F.blockSave(Object.assign(block(), { createdAt: NOW + 10 * 60000 }));
  assert.equal(F.blockLoad(NOW), null);
});

test('blockMarkStep marks the first undone step of that kind and persists it', () => {
  const ls = memStorage(); const F = make(ls);
  F.blockSave(block());
  const after = F.blockMarkStep('review', NOW);
  assert.equal(after.steps[0].done, true);
  assert.equal(after.steps[0].doneAt, NOW);
  assert.equal(F.blockLoad(NOW).steps[0].done, true, 'persisted');
  assert.equal(F.blockMarkStep('review', NOW), null, 'nothing of that kind left');
  assert.equal(F.blockMarkStep('page', NOW).steps[1].done, true,
    'page steps are derived on Today but the marker still accepts them');
  assert.equal(F.blockMarkStep('qb', NOW + 1).steps[2].doneAt, NOW + 1);
});

test('blockClear removes the key and a later load is null', () => {
  const ls = memStorage(); const F = make(ls);
  F.blockSave(block()); F.blockClear();
  assert.equal(F.blockLoad(NOW), null);
});
