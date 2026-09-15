import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPreviewBudget } from '../lib/budget.mjs';

const START = Date.UTC(2026, 8, 8, 12);
const HALF_HOUR = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const BINDING = 'a'.repeat(64);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const request = (operationId, units = 3) => ({ operationId, bindingHash: BINDING, units });

// Storage is the external boundary: reproduce strong reads, conditional writes,
// and ETags, yielding so concurrent callers compete for the same durable record.
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
  const config = { store: storage.store, namespace: 'stable-pilot-fixture', now: () => time, ...options };
  return { storage, config, budget: createPreviewBudget(config), advance: milliseconds => { time += milliseconds; } };
}
const rejects = (promise, status, code) => assert.rejects(promise, error => error.status === status && error.code === code);
const legacy = (operations, overrides = {}) => ({
  schemaVersion: 1, limit: 120, windowLimit: 72,
  createdAt: Math.min(...operations.map(o => o.reservedAt)),
  updatedAt: Math.max(...operations.map(o => o.reservedAt)),
  chargedUnits: operations.reduce((n, o) => n + o.units, 0),
  operations: Object.fromEntries(operations.map(({ id, ...op }) => [sha256(id), { bindingHash: BINDING, ...op }])),
  ...overrides,
});

test('paid attempts stay charged across fresh instances and have separate daily and window counts', async () => {
  const f = fixture();
  assert.deepEqual(await f.budget.reserve(request('session:opening', 1)), {
    authorized: true, chargedUnits: 1, windowChargedUnits: 1, startedEncounters: 1,
    remainingUnits: 679, windowRemainingUnits: 339, remainingStarts: 19, resetsAt: Date.UTC(2026, 8, 9),
  });
  const next = createPreviewBudget(f.config);
  const result = await next.reserve(request('session:turn-1'));
  assert.equal(result.chargedUnits, 4);
  assert.equal(result.startedEncounters, 1);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(next), ['reserve']);
  await rejects(next.reserve(request('session:turn-1')), 409, 'preview_operation_duplicate');
});

test('the twenty-first start is denied while already admitted encounters may continue', async () => {
  const f = fixture();
  for (let i = 1; i <= 20; i++) await f.budget.reserve(request('opening-' + i, 1));
  await rejects(f.budget.reserve(request('opening-21', 1)), 429, 'preview_daily_starts_exhausted');
  const continued = await f.budget.reserve(request('existing:turn'));
  assert.equal(continued.startedEncounters, 20);
  assert.equal(continued.remainingStarts, 0);
  assert.equal(continued.chargedUnits, 23);
});

test('two groups of ten full encounters with one alternative fit the daily allowance', async () => {
  const f = fixture();
  let result;
  for (let group = 0; group < 2; group++) {
    for (let encounter = 0; encounter < 10; encounter++) {
      const id = `${group}-${encounter}`;
      await f.budget.reserve(request(id + ':opening', 1));
      for (let turn = 1; turn <= 11; turn++) result = await f.budget.reserve(request(id + ':turn-' + turn));
    }
    if (group === 0) {
      assert.equal(result.chargedUnits, 340);
      await rejects(f.budget.reserve(request('too-soon:turn')), 429, 'preview_window_exhausted');
      f.advance(HALF_HOUR);
    }
  }
  assert.equal(result.chargedUnits, 680);
  assert.equal(result.startedEncounters, 20);
  assert.equal(result.remainingUnits, 0);
  f.advance(HALF_HOUR);
  await rejects(f.budget.reserve(request('beyond-daily:turn')), 429, 'preview_budget_exhausted');
});

test('daily counters renew at UTC midnight without replaying yesterday or resetting the rolling window', async () => {
  const f = fixture({ startLimit: 1, windowLimit: 4 });
  f.advance(12 * 60 * 60 * 1000 - 1000);
  await f.budget.reserve(request('yesterday:opening', 1));
  await f.budget.reserve(request('yesterday:turn'));
  await rejects(f.budget.reserve(request('too-many:opening', 1)), 429, 'preview_daily_starts_exhausted');
  f.advance(1000);
  await rejects(f.budget.reserve(request('yesterday:turn')), 409, 'preview_operation_duplicate');
  await rejects(f.budget.reserve(request('today:opening', 1)), 429, 'preview_window_exhausted');
  f.advance(HALF_HOUR - 1000);
  const result = await f.budget.reserve(request('today:opening', 1));
  assert.equal(result.chargedUnits, 1);
  assert.equal(result.startedEncounters, 1);
  assert.equal(result.windowChargedUnits, 1);
  assert.equal(Object.keys(f.storage.read().operations).length, 3);
});

test('a full daily allowance renews the next day, retaining old spent receipt hashes', async () => {
  const f = fixture({ limit: 4 });
  await f.budget.reserve(request('first:opening', 1));
  await f.budget.reserve(request('first:turn'));
  f.advance(HALF_HOUR);
  await rejects(f.budget.reserve(request('second:turn')), 429, 'preview_budget_exhausted');
  f.advance(DAY);
  const result = await f.budget.reserve(request('second:turn'));
  assert.equal(result.chargedUnits, 3);
  await rejects(f.budget.reserve(request('first:turn')), 409, 'preview_operation_duplicate');
});

test('pruning retains at least a full day of spent hashes and bounds the ledger across many days', async () => {
  const f = fixture();
  const sensitiveId = 'synthetic-session-private-nonce';
  await f.budget.reserve(request(sensitiveId));
  f.advance(DAY - 1);
  await f.budget.reserve(request('next-day:turn'));
  assert.equal(Object.hasOwn(f.storage.read().operations, sha256(sensitiveId)), true);
  f.advance(DAY + 1);
  await f.budget.reserve(request('third-day:turn'));
  assert.equal(Object.hasOwn(f.storage.read().operations, sha256(sensitiveId)), false);
  for (let day = 3; day < 20; day++) {
    f.advance(DAY);
    await f.budget.reserve(request('day-' + day));
    assert.equal(Object.keys(f.storage.read().operations).length, 2);
  }
  const persisted = JSON.stringify(f.storage.read());
  assert.equal(persisted.includes(sensitiveId), false);
  assert.equal(persisted.includes('day-'), false);
  assert.equal(Object.keys(f.storage.read().operations).every(key => /^[a-f0-9]{64}$/.test(key)), true);
});

test('duplicate bindings cannot replace a charged operation or change its start classification', async () => {
  const f = fixture();
  await f.budget.reserve(request('session:turn-1'));
  await rejects(f.budget.reserve({ ...request('session:turn-1'), bindingHash: 'b'.repeat(64) }), 409, 'preview_operation_mismatch');
  await rejects(f.budget.reserve(request('session:turn-1', 1)), 409, 'preview_operation_mismatch');
});

test('two fresh instances authorize the same operation only once', async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.budget.reserve(request('same')), createPreviewBudget(f.config).reserve(request('same'))]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'preview_operation_duplicate');
});

test('concurrent starts cannot race past the twentieth admission', async () => {
  const f = fixture();
  for (let i = 0; i < 19; i++) await f.budget.reserve(request('opening-' + i, 1));
  const results = await Promise.allSettled([f.budget.reserve(request('opening-20', 1)), createPreviewBudget(f.config).reserve(request('opening-21', 1))]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'preview_daily_starts_exhausted');
});

test('concurrent turns cannot race past either shared paid-call allowance', async () => {
  for (const [config, code] of [[{ windowLimit: 3 }, 'preview_window_exhausted'], [{ limit: 3 }, 'preview_budget_exhausted']]) {
    const f = fixture(config);
    const results = await Promise.allSettled([f.budget.reserve(request('one')), createPreviewBudget(f.config).reserve(request('two'))]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(results.find(item => item.status === 'rejected').reason.code, code);
  }
});

test('legacy production charges migrate atomically in place and keep their replay protection', async () => {
  const f = fixture();
  f.storage.replace(legacy([
    { id: 'yesterday:opening', units: 1, reservedAt: START - DAY },
    { id: 'today:opening', units: 1, reservedAt: START - 1000 },
    { id: 'today:turn', units: 3, reservedAt: START - 500 },
  ]));
  await rejects(f.budget.reserve(request('today:turn')), 409, 'preview_operation_duplicate');
  const result = await f.budget.reserve(request('next:turn'));
  assert.equal(result.chargedUnits, 7);
  assert.equal(result.startedEncounters, 1);
  assert.equal(result.windowChargedUnits, 7);
  assert.equal(f.storage.read().schemaVersion, 2);
  assert.equal(Object.keys(f.storage.read().operations).length, 4);
  assert.equal(f.storage.calls.every(call => call.key === 'stable-pilot-fixture/paid-operations-v1'), true);
  assert.equal(f.storage.calls.filter(call => call.kind === 'write').every(call => call.options.onlyIfMatch), true);
  await rejects(createPreviewBudget(f.config).reserve(request('yesterday:opening', 1)), 409, 'preview_operation_duplicate');
});

test('legacy starts already beyond twenty stay charged and block further starts until tomorrow', async () => {
  const f = fixture();
  f.storage.replace(legacy(Array.from({ length: 21 }, (_, i) => ({ id: 'old-start-' + i, units: 1, reservedAt: START }))));
  await rejects(f.budget.reserve(request('new-start', 1)), 429, 'preview_daily_starts_exhausted');
  const result = await f.budget.reserve(request('continuation'));
  assert.equal(result.startedEncounters, 21);
  assert.equal(result.remainingStarts, 0);
  await f.budget.reserve(request('another-continuation'));
  f.advance(DAY);
  assert.equal((await f.budget.reserve(request('new-start', 1))).startedEncounters, 1);
});

test('competing legacy migrations cannot lose either new reservation', async () => {
  const f = fixture();
  f.storage.replace(legacy([{ id: 'old-start', units: 1, reservedAt: START }]));
  const results = await Promise.all([f.budget.reserve(request('first')), createPreviewBudget(f.config).reserve(request('second'))]);
  assert.equal(Math.max(...results.map(r => r.chargedUnits)), 7);
  assert.equal(Object.keys(f.storage.read().operations).length, 3);
});

test('invalid requests and unconfigured namespaces never reach storage', async () => {
  const f = fixture();
  for (const input of [null, {}, request(''), request('x', 0), request('x', 2), request('x', 4), request('x', 1.1),
    { ...request('x'), bindingHash: 'not-a-hash' }, { ...request('x'), transcript: 'private' }]) {
    await rejects(f.budget.reserve(input), 400, 'invalid_preview_budget_request');
  }
  assert.equal(f.storage.calls.length, 0);
  for (const extra of [{ limit: 681 }, { limit: 0 }, { windowLimit: 341 }, { windowLimit: 0 }, { startLimit: 21 }, { startLimit: 0 }, { limit: '10' }, { namespace: '../escape' }, { namespace: undefined }]) {
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

test('an ambiguous write remains charged even though it did not authorize provider work', async () => {
  const f = fixture({ startLimit: 1 });
  const set = f.storage.store.set;
  f.storage.store.set = async (...args) => { await set(...args); return { modified: true, etag: '' }; };
  await rejects(f.budget.reserve(request('failed-opening', 1)), 503, 'preview_budget_unavailable');
  f.storage.store.set = set;
  await rejects(createPreviewBudget(f.config).reserve(request('failed-opening', 1)), 409, 'preview_operation_duplicate');
  await rejects(f.budget.reserve(request('replacement-opening', 1)), 429, 'preview_daily_starts_exhausted');
});

test('continued CAS contention fails closed after bounded retries', async () => {
  let writes = 0;
  const store = { getWithMetadata: async () => null, set: async () => { writes += 1; return { modified: false }; } };
  await rejects(createPreviewBudget({ store, namespace: 'contended', now: () => START }).reserve(request('x')), 503, 'preview_budget_contention');
  assert.equal(writes, 5);
});

test('malformed stored data and an unreviewed policy change fail closed', async () => {
  const f = fixture();
  await f.budget.reserve(request('first'));
  const original = f.storage.read();
  for (const altered of [
    { ...original, transcript: 'private' }, { ...original, updatedAt: START + 1 },
    { ...original, operations: {} }, { ...original, windowLimit: 37 },
    { ...original, operations: { badHash: { bindingHash: BINDING, units: 3, reservedAt: START } } },
    legacy([{ id: 'bad-kind', units: 2, reservedAt: START }]),
    legacy([{ id: 'bad-total', units: 3, reservedAt: START }], { chargedUnits: 0 }),
    legacy([{ id: 'bad-policy', units: 3, reservedAt: START }], { limit: 119 }),
  ]) {
    f.storage.replace(altered);
    await rejects(f.budget.reserve(request('next')), 503, 'preview_budget_unavailable');
  }
  f.storage.replace(original);
  for (const options of [{ limit: 679 }, { startLimit: 19 }, { windowLimit: 339 }]) {
    await rejects(createPreviewBudget({ ...f.config, ...options }).reserve(request('next')), 503, 'preview_budget_unavailable');
  }
});

test('clock errors and backward movement do not reopen an allowance', async () => {
  const f = fixture();
  await f.budget.reserve(request('first'));
  f.advance(-1);
  await rejects(f.budget.reserve(request('second')), 503, 'preview_budget_unavailable');
  for (const now of [() => NaN, () => Infinity, () => -1, () => { throw new Error('clock'); }]) {
    await rejects(createPreviewBudget({ ...f.config, now }).reserve(request('clock-test')), 503, 'preview_budget_unavailable');
  }
});

test('runtime deployments share the required pinned budget namespace and cannot reset it', async () => {
  const runtime = await import('../netlify/functions/dana-preview.mjs');
  assert.equal(typeof runtime.runtimeBudget, 'function');
  const f = fixture();
  const environment = { DANA_PREVIEW_BUDGET_NAMESPACE: 'original-production-ledger', DEPLOY_ID: 'stale-build-id' };
  const first = runtime.runtimeEnvironment(environment, { deploy: { id: 'deploy-one' } });
  const second = runtime.runtimeEnvironment(environment, { deploy: { id: 'deploy-two' } });
  await runtime.runtimeBudget(f.storage.store, first).reserve(request('deployed-opening', 1));
  await rejects(runtime.runtimeBudget(f.storage.store, second).reserve(request('deployed-opening', 1)), 409, 'preview_operation_duplicate');
  assert.equal(f.storage.calls.every(call => call.key === 'original-production-ledger/paid-operations-v1'), true);
  assert.throws(() => runtime.runtimeBudget(f.storage.store, { DEPLOY_ID: 'not-a-budget-namespace' }),
    error => error.code === 'invalid_preview_budget_configuration');
});
