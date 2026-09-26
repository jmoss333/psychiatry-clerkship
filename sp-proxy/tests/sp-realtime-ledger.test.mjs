import assert from 'node:assert/strict';
import test from 'node:test';

import { createRealtimeLedger } from '../netlify/functions/_shared/sp-realtime-ledger.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const HASH = 'ab'.repeat(32);
const MINUTE = 60 * 1000;

function ledgerWith({ store, now = NOW, ...overrides } = {}) {
  const clock = typeof now === 'function' ? now : () => now;
  return createRealtimeLedger({
    store,
    rotationId: 'rotation-2026-09',
    capMicros: 2_000_000,
    startLimit: 3,
    windowLimit: 2,
    clock,
    ...overrides,
  });
}

function reservation(operationId, overrides = {}) {
  return {
    operationId,
    bindingHash: HASH,
    maximumMicros: 500_000,
    deadline: NOW + 15 * MINUTE,
    ...overrides,
  };
}

test('reserve → attach → end: the reservation becomes a charge the moment the call exists, and is never refunded', async () => {
  const fake = createFakeBlobStore();
  const ledger = ledgerWith({ store: fake.store });
  const reserved = await ledger.reserveSession(reservation('start:enc-1'));
  assert.equal(reserved.authorized, true);
  assert.equal(reserved.band, 'ok');
  assert.equal(reserved.startsToday, 1);
  let usage = await ledger.getUsage();
  assert.equal(usage.reservedMicros, 500_000);
  assert.equal(usage.spentMicros, 0);

  const attached = await ledger.attachCall({ operationId: 'start:enc-1', callId: 'rtc_abc' });
  assert.equal(attached.attached, true);
  usage = await ledger.getUsage();
  assert.equal(usage.reservedMicros, 0);
  assert.equal(usage.spentMicros, 500_000);
  assert.equal(usage.activeSessions, 1);

  const ended = await ledger.endSession({ operationId: 'start:enc-1' });
  assert.deepEqual(ended, { changed: true, callId: 'rtc_abc' });
  usage = await ledger.getUsage();
  assert.equal(usage.spentMicros, 500_000, 'ending does not refund');
  assert.equal(usage.activeSessions, 0);
  // Ending twice is idempotent and still reports the call.
  assert.deepEqual(await ledger.endSession({ operationId: 'start:enc-1' }), { changed: false, callId: 'rtc_abc' });
  // Releasing an active session is a state conflict, never a refund.
  await assert.rejects(ledger.releaseSession({ operationId: 'start:enc-1' }), { code: 'budget_state_conflict' });
  // Usage is content-free: numbers, band, timestamps only.
  assert.deepEqual(Object.keys(usage).sort(), ['activeSessions', 'band', 'capMicros', 'currency', 'reservedMicros', 'schemaVersion', 'spentMicros', 'startLimit', 'startsToday', 'updatedAt', 'windowLimit']);
  const stored = JSON.stringify(fake.read('realtime/rotation-2026-09/sessions-v1'));
  assert.ok(!/text|transcript|audio|passcode/i.test(stored));
});

test('a failed SDP exchange releases the reservation; the same id can then be reserved again', async () => {
  const fake = createFakeBlobStore();
  const ledger = ledgerWith({ store: fake.store });
  await ledger.reserveSession(reservation('start:enc-2'));
  assert.deepEqual(await ledger.releaseSession({ operationId: 'start:enc-2' }), { released: true });
  assert.equal((await ledger.getUsage()).reservedMicros, 0);
  assert.deepEqual(await ledger.releaseSession({ operationId: 'start:enc-2' }), { released: false });
  await assert.doesNotReject(ledger.reserveSession(reservation('start:enc-2')));
});

test('duplicate and mismatched reservations are refused before any authority is granted', async () => {
  const fake = createFakeBlobStore();
  const ledger = ledgerWith({ store: fake.store });
  await ledger.reserveSession(reservation('start:enc-3'));
  await assert.rejects(ledger.reserveSession(reservation('start:enc-3')), { status: 409, code: 'realtime_operation_duplicate' });
  await assert.rejects(ledger.reserveSession(reservation('start:enc-3', { maximumMicros: 1 })), { status: 409, code: 'idempotency_mismatch' });
  await assert.rejects(ledger.reserveSession(reservation('start:enc-3', { bindingHash: 'cd'.repeat(32) })), { status: 409, code: 'idempotency_mismatch' });
});

test('the rolling half-hour window, the daily start limit and the rotation cap each refuse a start', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = ledgerWith({ store: fake.store, now: () => now, capMicros: 2_000_000, startLimit: 3, windowLimit: 2 });
  // The real flow attaches within seconds of reserving; a reservation left
  // unattached past its lease is reclaimed, which a later test pins.
  await ledger.reserveSession(reservation('a', { deadline: now + 15 * MINUTE }));
  await ledger.attachCall({ operationId: 'a', callId: 'rtc_a' });
  await ledger.reserveSession(reservation('b', { deadline: now + 15 * MINUTE }));
  await ledger.attachCall({ operationId: 'b', callId: 'rtc_b' });
  await assert.rejects(ledger.reserveSession(reservation('c', { deadline: now + 15 * MINUTE })), { status: 429, code: 'realtime_window_exhausted' });
  now += 31 * MINUTE;
  await ledger.reserveSession(reservation('c', { deadline: now + 15 * MINUTE }));
  await ledger.attachCall({ operationId: 'c', callId: 'rtc_c' });
  await assert.rejects(ledger.reserveSession(reservation('d', { deadline: now + 15 * MINUTE })), { status: 429, code: 'realtime_daily_starts_exhausted' });
  // Next UTC day: starts renew, but the rotation cap (2,000,000 micro) does not.
  now = NOW + 24 * 60 * MINUTE + MINUTE;
  await ledger.reserveSession(reservation('e', { deadline: now + 15 * MINUTE }));
  await assert.rejects(ledger.reserveSession(reservation('f', { deadline: now + 15 * MINUTE })), { status: 429, code: 'realtime_budget_reserved' });
  assert.equal(await ledger.getBand(), 'capped');
});

test('band moves ok → warning at 80% → capped', async () => {
  const fake = createFakeBlobStore();
  const ledger = ledgerWith({ store: fake.store, capMicros: 1_000_000, startLimit: 10, windowLimit: 10 });
  assert.equal(await ledger.getBand(), 'ok');
  await ledger.reserveSession(reservation('w1', { maximumMicros: 800_000 }));
  assert.equal(await ledger.getBand(), 'warning');
  await ledger.reserveSession(reservation('w2', { maximumMicros: 200_000 }));
  assert.equal(await ledger.getBand(), 'capped');
});

test('a reservation whose exchange never completed is reclaimed after its lease; nothing was spent', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = ledgerWith({ store: fake.store, now: () => now });
  await ledger.reserveSession(reservation('stale'));
  assert.equal((await ledger.getUsage()).reservedMicros, 500_000);
  now += 3 * MINUTE;
  const usage = await ledger.getUsage();
  assert.equal(usage.reservedMicros, 0);
  assert.equal(usage.spentMicros, 0);
  // Attaching after the lease is a state conflict: the server must not adopt a call it stopped accounting for.
  await assert.rejects(ledger.attachCall({ operationId: 'stale', callId: 'rtc_x' }), { code: 'budget_state_conflict' });
});

test('the reaper sees only active sessions past their deadline, and reaping is keyed by the stored hash', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = ledgerWith({ store: fake.store, now: () => now, startLimit: 10, windowLimit: 10 });
  await ledger.reserveSession(reservation('r1', { deadline: NOW + 5 * MINUTE }));
  await ledger.reserveSession(reservation('r2', { deadline: NOW + 50 * MINUTE }));
  await ledger.reserveSession(reservation('r3', { deadline: NOW + 5 * MINUTE }));
  await ledger.attachCall({ operationId: 'r1', callId: 'rtc_r1' });
  await ledger.attachCall({ operationId: 'r2', callId: 'rtc_r2' });
  await ledger.attachCall({ operationId: 'r3', callId: 'rtc_r3' });
  await ledger.endSession({ operationId: 'r3' });
  assert.deepEqual(await ledger.expiredSessions(), []);
  now = NOW + 6 * MINUTE;
  const expired = await ledger.expiredSessions();
  assert.equal(expired.length, 1);
  assert.equal(expired[0].callId, 'rtc_r1');
  assert.match(expired[0].operationHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await ledger.markReapedByHash({ operationHash: expired[0].operationHash }), { changed: true });
  assert.deepEqual(await ledger.markReapedByHash({ operationHash: expired[0].operationHash }), { changed: false });
  assert.deepEqual(await ledger.expiredSessions(), []);
  assert.equal((await ledger.getUsage()).activeSessions, 1);
});

test('finished sessions are dropped after retention; their charge stays', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = ledgerWith({ store: fake.store, now: () => now, startLimit: 10, windowLimit: 10 });
  await ledger.reserveSession(reservation('old'));
  await ledger.attachCall({ operationId: 'old', callId: 'rtc_old' });
  await ledger.endSession({ operationId: 'old' });
  now = NOW + 3 * 24 * 60 * MINUTE;
  const usage = await ledger.getUsage();
  assert.equal(usage.spentMicros, 500_000);
  // Housekeeping is persisted by the next write, not by a read.
  await ledger.reserveSession(reservation('new', { deadline: now + 15 * MINUTE }));
  const stored = fake.read('realtime/rotation-2026-09/sessions-v1');
  assert.equal(Object.keys(stored.sessions).length, 1);
  assert.equal(stored.spentMicros, 500_000);
});

test('every write is a compare-and-swap; a lost race retries and an exhausted retry is contention', async () => {
  const fake = createFakeBlobStore({ onlyIfMatchConflicts: 2 });
  const ledger = ledgerWith({ store: fake.store, startLimit: 10, windowLimit: 10 });
  await ledger.reserveSession(reservation('cas-1'));
  fake.conflictNextMatches(2);
  await assert.doesNotReject(ledger.reserveSession(reservation('cas-2')));
  const sets = fake.calls.filter((call) => call.method === 'set');
  assert.ok(sets.every((call) => call.options.onlyIfNew === true || typeof call.options.onlyIfMatch === 'string'), 'no unconditional write');
  fake.conflictNextMatches(10);
  await assert.rejects(ledger.reserveSession(reservation('cas-3')), { status: 503, code: 'budget_contention' });
});

test('an unavailable or ambiguous store fails closed and grants nothing', async () => {
  const down = createFakeBlobStore({ unavailable: true });
  await assert.rejects(ledgerWith({ store: down.store }).reserveSession(reservation('x')), { status: 503, code: 'budget_unavailable' });
  await assert.rejects(ledgerWith({ store: down.store }).getBand(), { code: 'budget_unavailable' });
  const ambiguous = createFakeBlobStore();
  ambiguous.ambiguousNextWrites(1, '');
  await assert.rejects(ledgerWith({ store: ambiguous.store }).reserveSession(reservation('y')), { code: 'budget_unavailable' });
  const corrupt = createFakeBlobStore();
  corrupt.replace('realtime/rotation-2026-09/sessions-v1', { schemaVersion: 1, nonsense: true });
  await assert.rejects(ledgerWith({ store: corrupt.store }).reserveSession(reservation('z')), { code: 'budget_unavailable' });
});

test('invalid requests and configuration are refused', async () => {
  const fake = createFakeBlobStore();
  const ledger = ledgerWith({ store: fake.store });
  await assert.rejects(ledger.reserveSession({ ...reservation('ok'), extra: 1 }), { code: 'invalid_budget_request' });
  await assert.rejects(ledger.reserveSession(reservation('bad hash', { bindingHash: 'nope' })), { code: 'invalid_budget_request' });
  await assert.rejects(ledger.reserveSession(reservation('zero', { maximumMicros: 0 })), { code: 'invalid_budget_request' });
  await assert.rejects(ledger.reserveSession(reservation('past', { deadline: NOW - 1 })), { code: 'invalid_budget_request' });
  await assert.rejects(ledger.attachCall({ operationId: 'ok', callId: 'bad id' }), { code: 'invalid_budget_request' });
  await assert.rejects(ledger.markReapedByHash({ operationHash: 'x' }), { code: 'invalid_budget_request' });
  assert.throws(() => createRealtimeLedger({ store: fake.store, rotationId: 'r', capMicros: 0 }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeLedger({ store: fake.store, rotationId: 'r/x', capMicros: 1 }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeLedger({ store: {}, rotationId: 'r', capMicros: 1 }), { code: 'invalid_configuration' });
});
