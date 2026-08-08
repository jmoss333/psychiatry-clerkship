// Behavioural contract for the qbank session-capsule snippet (cw_sess_v1). Evaluates the real
// functions, not their text — a routing/trim regression turns these red even when every future
// consumer stays byte-identical. Harness technique (new Function over the snippet source)
// follows tests/sm2-behavior.test.mjs; the localStorage stub follows the memStorage()
// convention shared by tests/calib-ledger.test.mjs and tests/phase-policy.test.mjs. sessLoad
// takes nowMs as an explicit parameter (fixed epochs below), so no Date.now() monkeypatching
// is needed anywhere here. No consumer wires this snippet yet (Task 7) — these tests cover the
// snippet's own contract only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sess_capsule.js',
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
  return { sessLoad: sessLoad, sessSave: sessSave, sessClear: sessClear };
`);

const AT = 1_700_000_000_000; // arbitrary fixed reference instant
const DAY_MS = 86400000;

function sampleSession(overrides) {
  return Object.assign({
    at: AT,
    expiresAt: AT + DAY_MS,
    queueIds: ['qb_mood_001', 'qb_mood_002'],
    idx: 1,
    responses: [{ id: 'qb_mood_001', correct: 1, confidence: 'certain' }],
  }, overrides);
}

test('literal key check: cw_sess_v1 appears in the snippet source as a quoted literal', () => {
  assert.ok(
    /(['"])cw_sess_v1\1/.test(snippet),
    'the store key must be a literal string inside the snippet body, not built/concatenated',
  );
});

test('signature pin: sessLoad is the snippet\'s first function line and stays under 60 chars', () => {
  const firstFnLine = snippet.split('\n').map((l) => l.trim()).find((l) => l.startsWith('function '));
  assert.equal(firstFnLine, 'function sessLoad(tool, nowMs){');
  assert.ok(firstFnLine.length < 60, `signature too long: ${firstFnLine.length} chars`);
});

// ---- round-trip --------------------------------------------------------------------

test('sessSave then sessLoad round-trips the exact session shape for a fresh store', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const session = sampleSession();
  sessSave('qbank', session);
  assert.deepEqual(sessLoad('qbank', AT), session);
});

test('sessSave persists under the literal cw_sess_v1 key in the expected {v:1,sessions:{...}} shape', () => {
  const ls = memStorage();
  const { sessSave } = make(ls);
  sessSave('qbank', sampleSession());
  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.v, 1);
  assert.ok(raw.sessions && typeof raw.sessions === 'object');
  assert.deepEqual(raw.sessions.qbank, sampleSession());
});

test('sessLoad returns null when no session exists for the requested tool', () => {
  const ls = memStorage();
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
});

// ---- 24h expiry ---------------------------------------------------------------------

test('sessLoad still returns the session just before expiresAt', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const session = sampleSession();
  sessSave('qbank', session);
  assert.deepEqual(sessLoad('qbank', session.expiresAt - 1), session);
});

test('sessLoad returns null once nowMs passes expiresAt, AND prunes the entry from the store', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const session = sampleSession();
  sessSave('qbank', session);

  const loaded = sessLoad('qbank', session.expiresAt + 1);
  assert.equal(loaded, null);

  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.sessions.qbank, undefined, 'expired entry must be pruned, not merely hidden');
  assert.equal(raw.v, 1, 'the rest of the store survives the prune');
});

test('pruning an expired tool entry does not disturb a different tool\'s live entry', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const expired = sampleSession({ expiresAt: AT + DAY_MS });
  const live = sampleSession({ queueIds: ['qb_other_001'], expiresAt: AT + 2 * DAY_MS });
  sessSave('qbank', expired);
  sessSave('other-tool', live);

  assert.equal(sessLoad('qbank', expired.expiresAt + 1), null);

  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.sessions.qbank, undefined);
  assert.deepEqual(raw.sessions['other-tool'], live, 'sibling tool entry must survive the prune');
  assert.deepEqual(sessLoad('other-tool', expired.expiresAt + 1), live);
});

test('sessLoad defaults nowMs to Date.now() when the parameter is omitted', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  // far-future expiry: stable regardless of the instant this test actually runs
  const session = sampleSession({ at: Date.now(), expiresAt: Date.now() + 100 * DAY_MS });
  sessSave('qbank', session);
  assert.deepEqual(sessLoad('qbank'), session);
});

// ---- corrupt store → null, no throw --------------------------------------------------

test('sessLoad returns null (no throw) when the stored value is corrupt JSON', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', '{not json');
  const { sessLoad } = make(ls);
  let result;
  assert.doesNotThrow(() => { result = sessLoad('qbank', AT); });
  assert.equal(result, null);
});

test('sessLoad returns null when sessions is missing or not an object', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({ v: 1 }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);

  const ls2 = memStorage();
  ls2.setItem('cw_sess_v1', JSON.stringify({ v: 1, sessions: 'nope' }));
  const { sessLoad: sessLoad2 } = make(ls2);
  assert.equal(sessLoad2('qbank', AT), null);
});

test('sessLoad returns null and prunes a per-tool entry that is malformed (missing expiresAt)', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({
    v: 1,
    sessions: { qbank: { at: AT, queueIds: ['a'], idx: 0, responses: [] } },
  }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.sessions.qbank, undefined, 'malformed entry must be pruned like an expired one');
});

test('sessLoad returns null when the per-tool entry itself is not an object', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({ v: 1, sessions: { qbank: 'nope' } }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
});

test('sessLoad silently returns null if localStorage.getItem throws — no throw escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const { sessLoad } = make(throwing);
  let result;
  assert.doesNotThrow(() => { result = sessLoad('qbank', AT); });
  assert.equal(result, null);
});

test('sessSave and sessClear silently no-op if localStorage throws — no throw escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const { sessSave, sessClear } = make(throwing);
  assert.doesNotThrow(() => sessSave('qbank', sampleSession()));
  assert.doesNotThrow(() => sessClear('qbank'));
});

// ---- v-reset ---------------------------------------------------------------------------

test('v-reset: a stored shape with v!==1 is treated as absent by sessLoad', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({
    v: 2,
    sessions: { qbank: sampleSession() },
  }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
});

test('v-reset: sessSave against a v!==1 store discards the stale store and writes v:1 fresh', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({
    v: 2,
    sessions: { qbank: sampleSession({ queueIds: ['stale'] }) },
  }));
  const { sessSave, sessLoad } = make(ls);
  const fresh = sampleSession({ queueIds: ['fresh'] });
  sessSave('qbank', fresh);
  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.v, 1);
  assert.deepEqual(sessLoad('qbank', AT), fresh);
});

// ---- sessClear: per-tool isolation ------------------------------------------------------

test('sessClear removes only its own tool\'s slot, leaving other tools\' sessions intact', () => {
  const ls = memStorage();
  const { sessSave, sessClear, sessLoad } = make(ls);
  const qbankSession = sampleSession();
  const otherSession = sampleSession({ queueIds: ['qb_other_001'] });
  sessSave('qbank', qbankSession);
  sessSave('other-tool', otherSession);

  sessClear('qbank');

  assert.equal(sessLoad('qbank', AT), null, 'cleared tool must be gone');
  assert.deepEqual(sessLoad('other-tool', AT), otherSession, 'sibling tool must be untouched');
});

test('sessClear on a tool with no existing session is a safe no-op', () => {
  const ls = memStorage();
  const { sessSave, sessClear, sessLoad } = make(ls);
  sessSave('other-tool', sampleSession());
  assert.doesNotThrow(() => sessClear('qbank'));
  assert.deepEqual(sessLoad('other-tool', AT), sampleSession());
});

test('sessClear against an absent store is a safe no-op (no throw, no store created)', () => {
  const ls = memStorage();
  const { sessClear } = make(ls);
  assert.doesNotThrow(() => sessClear('qbank'));
  assert.equal(ls.getItem('cw_sess_v1'), null);
});
