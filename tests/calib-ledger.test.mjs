// Behavioural contract for the calibration-ledger snippet (cw_calib_v1). Evaluates the real
// functions, not their text — a routing/trim regression turns these red even when every
// consumer stays byte-identical. Harness technique (new Function over the snippet source)
// follows tests/sm2-behavior.test.mjs; the localStorage stub follows the memStorage()
// convention shared by tests/srs-home-counters.test.mjs and tests/qbank-draft-visibility.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/calib_log.js',
  import.meta.url,
), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `
  ${snippet}
  return { calibLog: calibLog, calibRead: calibRead, calibClear: calibClear };
`);

const EMPTY = { v: 1, qb: [], rev: [] };

test('literal key check: cw_calib_v1 appears in the snippet source as a quoted literal', () => {
  assert.ok(
    /(['"])cw_calib_v1\1/.test(snippet),
    'the store key must be a literal string inside the snippet body, not built/concatenated',
  );
});

test('calibRead returns the empty shape when the store is absent', () => {
  const ls = memStorage();
  const { calibRead } = make(ls);
  assert.deepEqual(calibRead(), EMPTY);
});

test('calibRead returns the empty shape when the stored value is corrupt JSON', () => {
  const ls = memStorage();
  ls.setItem('cw_calib_v1', '{not json');
  const { calibRead } = make(ls);
  assert.deepEqual(calibRead(), EMPTY);
});

test('calibRead returns the empty shape when the stored shape is malformed (qb not an array)', () => {
  const ls = memStorage();
  ls.setItem('cw_calib_v1', JSON.stringify({ v: 1, qb: 'nope', rev: [] }));
  const { calibRead } = make(ls);
  assert.deepEqual(calibRead(), EMPTY);
});

test('calibLog routes qb events to qb[] and rev events to rev[] by evt.s', () => {
  const ls = memStorage();
  const { calibLog, calibRead } = make(ls);
  calibLog({ s: 'qb', p: 'guess', id: 'qb_1' });
  calibLog({ s: 'rev', p: 'Again', id: 'rev_1' });
  const d = calibRead();
  assert.equal(d.qb.length, 1);
  assert.equal(d.rev.length, 1);
  assert.equal(d.qb[0].id, 'qb_1');
  assert.equal(d.rev[0].id, 'rev_1');
});

test('per-source ring trims at 400: the 401st qb event evicts qb[0]; rev is untouched', () => {
  const ls = memStorage();
  const { calibLog, calibRead } = make(ls);
  for (let i = 0; i < 400; i++) calibLog({ s: 'qb', p: 'guess', id: `qb_${i}` });
  calibLog({ s: 'rev', p: 'Good', id: 'rev_keep' });

  let d = calibRead();
  assert.equal(d.qb.length, 400, 'ring at exactly 400 does not trim yet');
  assert.equal(d.qb[0].id, 'qb_0');

  calibLog({ s: 'qb', p: 'guess', id: 'qb_400' }); // 401st qb event
  d = calibRead();
  assert.equal(d.qb.length, 400, 'ring stays capped at 400');
  assert.equal(d.qb[0].id, 'qb_1', 'oldest entry (qb_0) evicted');
  assert.equal(d.qb[399].id, 'qb_400', 'newest entry appended at the end');
  assert.equal(d.rev.length, 1, 'rev ring untouched by qb trimming');
  assert.equal(d.rev[0].id, 'rev_keep');
});

test('v-reset: a stored shape with v!==1 (e.g. {v:2}) is treated as absent and reset on next write', () => {
  const ls = memStorage();
  ls.setItem('cw_calib_v1', JSON.stringify({ v: 2, qb: [{ s: 'qb', p: 'guess', id: 'stale' }], rev: [] }));
  const { calibLog, calibRead } = make(ls);
  calibLog({ s: 'qb', p: 'certain', id: 'fresh' });
  const d = calibRead();
  assert.equal(d.v, 1);
  assert.equal(d.qb.length, 1, 'stale v:2 data discarded rather than appended to');
  assert.equal(d.qb[0].id, 'fresh');
});

test('enum rejection: unknown evt.s is silently ignored — no write, no throw', () => {
  const ls = memStorage();
  const { calibLog, calibRead } = make(ls);
  assert.doesNotThrow(() => calibLog({ s: 'bogus', p: 'guess' }));
  assert.equal(ls.getItem('cw_calib_v1'), null, 'unknown source must not create the store');
  assert.deepEqual(calibRead(), EMPTY);
});

test('enum rejection: unknown evt.p for a known evt.s is silently ignored — no write, no throw', () => {
  const ls = memStorage();
  const { calibLog, calibRead } = make(ls);
  assert.doesNotThrow(() => calibLog({ s: 'qb', p: 'not-a-real-prediction' }));
  assert.doesNotThrow(() => calibLog({ s: 'rev', p: 'Meh' }));
  assert.equal(ls.getItem('cw_calib_v1'), null);
  assert.deepEqual(calibRead(), EMPTY);
});

test('calibLog silently no-ops on a falsy evt — no throw, no write', () => {
  const ls = memStorage();
  const { calibLog } = make(ls);
  assert.doesNotThrow(() => calibLog(null));
  assert.doesNotThrow(() => calibLog(undefined));
  assert.equal(ls.getItem('cw_calib_v1'), null);
});

test('calibClear removes the store entirely (not just resets its shape)', () => {
  const ls = memStorage();
  const { calibLog, calibClear, calibRead } = make(ls);
  calibLog({ s: 'qb', p: 'guess', id: 'qb_1' });
  assert.notEqual(ls.getItem('cw_calib_v1'), null, 'sanity: store exists before clear');
  calibClear();
  assert.equal(ls.getItem('cw_calib_v1'), null, 'calibClear must remove the underlying key');
  assert.deepEqual(calibRead(), EMPTY, 'calibRead falls back to the empty shape after clear');
});

test('calibClear silently no-ops if localStorage throws — no throw escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const { calibClear } = make(throwing);
  assert.doesNotThrow(() => calibClear());
});
