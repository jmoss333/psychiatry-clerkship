import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPreviewBudget } from '../lib/budget.mjs';

const START = 1_800_000_000_000;
const HALF_HOUR = 30 * 60 * 1000;
const BINDING = 'a'.repeat(64);
const request = (operationId, units = 3) => ({ operationId, bindingHash: BINDING, units });

// Storage is the external boundary: reproduce strong reads, conditional writes,
// and ETags, yielding so concurrent callers actually compete for the same record.
function blob() {
  let record = null, etag = 0;
  const calls = [];
  return {
    calls,
    read: () => structuredClone(record),
    replace: value => { record = structuredClone(value); etag += 1; },
    store: {
      async getWithMetadata(key, options) {
        calls.push({ kind: 'read', key, options });
        assert.deepEqual(options, { type: 'json', consistency: 'strong' });
        return record === null ? null : { data: structuredClone(record), etag: String(etag), metadata: null };
      },
      async set(key, value, options) {
        calls.push({ kind: 'write', key, value, options });
        assert.equal(typeof value, 'string');
        await Promise.resolve();
        if (options.onlyIfNew === true && record !== null) return { modified: false };
        if (options.onlyIfMatch !== undefined && options.onlyIfMatch !== String(etag)) return { modified: false };
        assert.equal(options.onlyIfNew === true || typeof options.onlyIfMatch === 'string', true);
        record = JSON.parse(value);
        return { modified: true, etag: String(++etag) };
      },
    },
  };
}

function fixture(options = {}) {
  const storage = blob();
  let time = START;
  const config = { store: storage.store, namespace: 'deployment-fixture', now: () => time, ...options };
  return { storage, config, budget: createPreviewBudget(config), advance: milliseconds => { time += milliseconds; } };
}

const rejects = (promise, status, code) => assert.rejects(promise, error => error.status === status && error.code === code);

test('paid attempts are charged before work and remain charged across fresh instances', async () => {
  const f = fixture();
  assert.equal(typeof f.budget.reserve, 'function');
  assert.deepEqual(await f.budget.reserve(request('session:opening', 1)), {
    authorized: true, chargedUnits: 1, windowChargedUnits: 1, remainingUnits: 119, windowRemainingUnits: 71,
  });
  const next = createPreviewBudget(f.config);
  const result = await next.reserve(request('session:turn-1'));
  assert.equal(result.chargedUnits, 4);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(next), ['reserve']);
  await rejects(next.reserve(request('session:turn-1')), 409, 'preview_operation_duplicate');
  assert.equal(f.storage.read().chargedUnits, 4);
});

test('duplicate bindings cannot replace a charged operation', async () => {
  const f = fixture();
  await f.budget.reserve(request('session:turn-1'));
  await rejects(f.budget.reserve({ ...request('session:turn-1'), bindingHash: 'b'.repeat(64) }), 409, 'preview_operation_mismatch');
  await rejects(f.budget.reserve(request('session:turn-1', 1)), 409, 'preview_operation_mismatch');
  assert.equal(f.storage.read().chargedUnits, 3);
});

test('two fresh function instances authorize the same operation only once', async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.budget.reserve(request('session:turn-1')),
    createPreviewBudget(f.config).reserve(request('session:turn-1')),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'preview_operation_duplicate');
  assert.equal(f.storage.read().chargedUnits, 3);
});

test('concurrent different turns cannot race past the shared window allowance', async () => {
  const f = fixture({ windowLimit: 3 });
  const results = await Promise.allSettled([
    f.budget.reserve(request('one:turn-1')),
    createPreviewBudget(f.config).reserve(request('two:turn-1')),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'preview_window_exhausted');
  assert.equal(f.storage.read().chargedUnits, 3);
});

test('rolling window expires each charge at thirty minutes without resetting lifetime counts', async () => {
  const f = fixture({ windowLimit: 4 });
  await f.budget.reserve(request('first', 3));
  f.advance(HALF_HOUR / 2);
  await f.budget.reserve(request('second', 1));
  f.advance(HALF_HOUR / 2 - 1);
  await rejects(f.budget.reserve(request('third', 1)), 429, 'preview_window_exhausted');
  f.advance(1);
  const result = await f.budget.reserve(request('third', 3));
  assert.equal(result.windowChargedUnits, 4);
  assert.equal(result.chargedUnits, 7);
  await rejects(f.budget.reserve(request('first', 3)), 409, 'preview_operation_duplicate');
});

test('global ceiling remains effective after every rolling window expires', async () => {
  const f = fixture({ limit: 4, windowLimit: 3 });
  await f.budget.reserve(request('first'));
  f.advance(HALF_HOUR);
  await f.budget.reserve(request('second', 1));
  f.advance(HALF_HOUR);
  await rejects(f.budget.reserve(request('third', 1)), 429, 'preview_budget_exhausted');
  assert.equal(f.storage.read().chargedUnits, 4);
});

test('two full encounters fit while the seventy-third paid call is denied', async () => {
  const f = fixture();
  await f.budget.reserve(request('opening', 1));
  let result;
  for (let turn = 1; turn <= 10; turn += 1) {
    result = await f.budget.reserve(request(`turn-${turn}`, 3));
  }
  assert.equal(result.chargedUnits, 31);
  assert.equal(result.windowChargedUnits, 31);
  assert.equal(result.windowRemainingUnits, 41);
  await f.budget.reserve(request('second-opening', 1));
  for(let turn=1;turn<=10;turn++) await f.budget.reserve(request('second-turn-'+turn,3));
  await f.budget.reserve(request('extra-three-a',3));
  await f.budget.reserve(request('extra-two-a',2));
  await f.budget.reserve(request('extra-three', 3));
  await f.budget.reserve(request('extra-two', 2));
  await rejects(f.budget.reserve(request('seventy-third', 1)), 429, 'preview_window_exhausted');
  assert.equal(f.storage.read().chargedUnits, 72);
});

test('the durable registry stays bounded at 120 entries and never stores raw operation IDs', async () => {
  const f = fixture();
  const sensitiveId = 'synthetic-session-private-nonce';
  await f.budget.reserve(request(sensitiveId, 1));
  for (let i = 1; i < 120; i += 1) {
    f.advance(HALF_HOUR);
    await f.budget.reserve(request(`operation-${i}`, 1));
  }
  f.advance(HALF_HOUR);
  await rejects(f.budget.reserve(request('too-many', 1)), 429, 'preview_budget_exhausted');
  const persisted = JSON.stringify(f.storage.read());
  assert.equal(persisted.includes(sensitiveId), false);
  assert.equal(persisted.includes('operation-'), false);
  assert.equal(Object.keys(f.storage.read().operations).length, 120);
  assert.equal(Object.keys(f.storage.read().operations).every(key => /^[a-f0-9]{64}$/.test(key)), true);
  assert.equal(persisted.includes(createHash('sha256').update(sensitiveId).digest('hex')), true);
});

test('invalid request fields never reach storage', async () => {
  const f = fixture();
  for (const input of [null, {}, request(''), request('x', 0), request('x', 4), request('x', 1.1),
    { ...request('x'), bindingHash: 'not-a-hash' }, { ...request('x'), transcript: 'private' }]) {
    await rejects(f.budget.reserve(input), 400, 'invalid_preview_budget_request');
  }
  assert.equal(f.storage.calls.length, 0);
});

test('operator limits cannot exceed the proof ceilings', () => {
  for (const extra of [{ limit: 121 }, { limit: 0 }, { windowLimit: 73 }, { windowLimit: 0 }, { limit: '10' }, { namespace: '../escape' }]) {
    assert.throws(() => fixture(extra), error => error.status === 500 && error.code === 'invalid_preview_budget_configuration');
  }
});

test('storage outages and ambiguous write receipts never authorize work', async () => {
  for (const store of [
    { getWithMetadata: async () => { throw new Error('private upstream text'); }, set: async () => ({ modified: true, etag: 'ok' }) },
    { getWithMetadata: async () => null, set: async () => { throw new Error('private upstream text'); } },
    { getWithMetadata: async () => null, set: async () => ({ modified: true, etag: '' }) },
    { getWithMetadata: async () => null, set: async () => ({ modified: true }) },
    { getWithMetadata: async () => null, set: async () => ({}) },
  ]) {
    const budget = createPreviewBudget({ store, namespace: 'fail-closed', now: () => START });
    await rejects(budget.reserve(request('x')), 503, 'preview_budget_unavailable');
  }
});

test('continued CAS contention fails closed after bounded retries', async () => {
  let writes = 0;
  const store = { getWithMetadata: async () => null, set: async () => { writes += 1; return { modified: false }; } };
  const budget = createPreviewBudget({ store, namespace: 'contended', now: () => START });
  await rejects(budget.reserve(request('x')), 503, 'preview_budget_contention');
  assert.equal(writes, 5);
});

test('malformed stored totals, extra fields, future clocks, or altered policy fail closed', async () => {
  const f = fixture();
  await f.budget.reserve(request('first'));
  const original = f.storage.read();
  for (const altered of [
    { ...original, chargedUnits: 0 },
    { ...original, transcript: 'private' },
    { ...original, updatedAt: START + 1 },
    { ...original, operations: {} },
    { ...original, windowLimit: 37 },
  ]) {
    f.storage.replace(altered);
    await rejects(f.budget.reserve(request('next')), 503, 'preview_budget_unavailable');
  }
  f.storage.replace(original);
  const changedPolicy = createPreviewBudget({ ...f.config, limit: 119 });
  await rejects(changedPolicy.reserve(request('next')), 503, 'preview_budget_unavailable');
});

test('clock errors and backward clock movement do not reopen a window', async () => {
  const f = fixture();
  await f.budget.reserve(request('first'));
  f.advance(-1);
  await rejects(f.budget.reserve(request('second')), 503, 'preview_budget_unavailable');
  for (const now of [() => NaN, () => Infinity, () => -1, () => { throw new Error('clock'); }]) {
    const budget = createPreviewBudget({ ...f.config, now });
    await rejects(budget.reserve(request('clock-test')), 503, 'preview_budget_unavailable');
  }
});
