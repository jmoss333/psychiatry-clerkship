import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REAP_LIMIT,
  config as reaperConfig,
  createReaperHandler,
  default as scheduledReaper,
  reapExpired,
} from '../netlify/functions/sp-realtime-reaper.mjs';
import { reapExpired as routeReapExpired } from '../netlify/functions/sp-realtime.mjs';
import { PRODUCTION_BUDGET_STORE_NAME } from '../netlify/functions/_shared/sp-budget.mjs';
import { createRealtimeLedger } from '../netlify/functions/_shared/sp-realtime-ledger.mjs';
import { createRealtimeProvider } from '../netlify/functions/_shared/sp-realtime-provider.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const MINUTE = 60 * 1000;
const ROTATION = 'rotation-2026-09';
const HASH = 'ab'.repeat(32);
const API_KEY = 'sk-test-server-key';
const LEDGER_KEY = `realtime/${ROTATION}/sessions-v1`;

function fakeFetch({ hangupStatus = 200 } = {}) {
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push({ url, init });
    const status = typeof hangupStatus === 'function' ? hangupStatus(url, calls.length) : hangupStatus;
    return new Response(null, { status });
  }
  return { fetchImpl, calls };
}

function provider(fetch, { readApiKey = () => API_KEY } = {}) {
  return createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey, timeoutMs: 1_000 });
}

// Two active calls past their deadline, one live one, one already ended.
async function seededLedger({ store, clock, capMicros = 20_000_000 }) {
  const ledger = createRealtimeLedger({ store, rotationId: ROTATION, capMicros, startLimit: 40, windowLimit: 8, clock });
  const reserve = (operationId, deadline) => ledger.reserveSession({ operationId, bindingHash: HASH, maximumMicros: 100_000, deadline });
  await reserve('start:a', NOW + 5 * MINUTE);
  await ledger.attachCall({ operationId: 'start:a', callId: 'rtc_a' });
  await reserve('start:b', NOW + 6 * MINUTE);
  await ledger.attachCall({ operationId: 'start:b', callId: 'rtc_b' });
  await reserve('start:live', NOW + 50 * MINUTE);
  await ledger.attachCall({ operationId: 'start:live', callId: 'rtc_live' });
  await reserve('start:done', NOW + 5 * MINUTE);
  await ledger.attachCall({ operationId: 'start:done', callId: 'rtc_done' });
  await ledger.endSession({ operationId: 'start:done' });
  return ledger;
}

function statuses(fake) {
  return Object.values(fake.read(LEDGER_KEY).sessions)
    .map((session) => [session.callId, session.status])
    .sort();
}

test('the reaper hangs up exactly the active calls past their deadline and marks them reaped; the live call is untouched', async () => {
  assert.equal(reapExpired, routeReapExpired, 'one implementation, exported from both entry points');
  assert.deepEqual(reaperConfig, { schedule: '*/5 * * * *' });
  assert.equal(REAP_LIMIT, 25);

  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = await seededLedger({ store: fake.store, clock: () => now });
  const fetch = fakeFetch();
  const events = [];

  assert.deepEqual(await reapExpired({ ledger, provider: provider(fetch), logger: (event) => events.push(event) }), { reaped: 0, failed: 0, deferred: 0 });
  assert.equal(fetch.calls.length, 0, 'nothing is past its deadline yet');

  now = NOW + 7 * MINUTE;
  const result = await reapExpired({ ledger, provider: provider(fetch), logger: (event) => events.push(event) });
  assert.deepEqual(result, { reaped: 2, failed: 0, deferred: 0 });
  assert.deepEqual(fetch.calls.map((call) => call.url).sort(), [
    'https://api.openai.com/v1/realtime/calls/rtc_a/hangup',
    'https://api.openai.com/v1/realtime/calls/rtc_b/hangup',
  ]);
  for (const call of fetch.calls) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers.Authorization, `Bearer ${API_KEY}`);
  }
  assert.deepEqual(statuses(fake), [['rtc_a', 'reaped'], ['rtc_b', 'reaped'], ['rtc_done', 'ended'], ['rtc_live', 'active']]);
  assert.deepEqual(await ledger.expiredSessions(), []);
  assert.equal((await ledger.getUsage()).activeSessions, 1);
  assert.deepEqual(events.filter((event) => event.event === 'sp_realtime_reaped').pop(), { event: 'sp_realtime_reaped', reaped: 2, failed: 0, deferred: 0 });
  // A second pass has nothing to do.
  assert.deepEqual(await reapExpired({ ledger, provider: provider(fetch) }), { reaped: 0, failed: 0, deferred: 0 });
  assert.equal(fetch.calls.length, 2);
});

test('a 404 from hangup still marks the row reaped; a 500 leaves it active and counts as failed', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = await seededLedger({ store: fake.store, clock: () => now });
  now = NOW + 7 * MINUTE;
  const fetch = fakeFetch({ hangupStatus: (url) => (url.includes('rtc_a') ? 404 : 500) });
  const events = [];
  const result = await reapExpired({ ledger, provider: provider(fetch), logger: (event) => events.push(event) });
  assert.deepEqual(result, { reaped: 1, failed: 1, deferred: 0 });
  assert.deepEqual(statuses(fake), [['rtc_a', 'reaped'], ['rtc_b', 'active'], ['rtc_done', 'ended'], ['rtc_live', 'active']]);
  assert.equal((await ledger.expiredSessions()).length, 1, 'the refused call is still there for the next pass');
  assert.deepEqual(events.filter((event) => event.event === 'sp_realtime_reap_failed'), [{ event: 'sp_realtime_reap_failed', code: 'provider_status' }]);
  // Nothing in the log names a call.
  assert.ok(!JSON.stringify(events).includes('rtc_'));

  // A provider with no key fails every hangup as a configuration fault and reaps nothing.
  const keyless = provider(fakeFetch(), { readApiKey: () => undefined });
  assert.deepEqual(await reapExpired({ ledger, provider: keyless }), { reaped: 0, failed: 1, deferred: 0 });
});

test('the batch is bounded by `limit`; the remainder is reported as deferred and picked up next pass', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  const ledger = await seededLedger({ store: fake.store, clock: () => now });
  now = NOW + 7 * MINUTE;
  const fetch = fakeFetch();
  assert.deepEqual(await reapExpired({ ledger, provider: provider(fetch), limit: 1 }), { reaped: 1, failed: 0, deferred: 1 });
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(await reapExpired({ ledger, provider: provider(fetch), limit: 1 }), { reaped: 1, failed: 0, deferred: 0 });
  assert.equal(fetch.calls.length, 2);

  await assert.rejects(reapExpired({ ledger, provider: provider(fetch), limit: 0 }), { code: 'invalid_configuration' });
  await assert.rejects(reapExpired({ ledger: {}, provider: provider(fetch) }), { code: 'invalid_configuration' });
  await assert.rejects(reapExpired({ ledger, provider: {} }), { code: 'invalid_configuration' });
  // A ledger that cannot be read throws: there is nothing to iterate.
  const down = createRealtimeLedger({ store: createFakeBlobStore({ unavailable: true }).store, rotationId: ROTATION, capMicros: 1 });
  await assert.rejects(reapExpired({ ledger: down, provider: provider(fetch) }), { code: 'budget_unavailable' });
});

test('the scheduled handler builds the ledger and provider from the environment, reaps, and reports counts', async () => {
  const fake = createFakeBlobStore();
  let now = NOW;
  await seededLedger({ store: fake.store, clock: () => now });
  now = NOW + 7 * MINUTE;
  const fetch = fakeFetch();
  const storeRequests = [];
  const events = [];
  const env = {
    CONTEXT: 'production',
    // Disabled: the reaper still runs — sessions from before a disable must be hung up.
    SP_REALTIME_ENABLED: 'false',
    SP_ROTATION_ID: ROTATION,
    OPENAI_API_KEY: API_KEY,
  };
  const handler = createReaperHandler({
    readEnv: (name) => env[name],
    getStore(options) { storeRequests.push(options); return fake.store; },
    fetchImpl: fetch.fetchImpl,
    logger: (event) => events.push(event),
    clock: () => now,
  });
  const response = await handler(new Request('https://proxy.example.test/.netlify/functions/sp-realtime-reaper', { method: 'POST', body: '{"next_run":"2026-09-26T12:10:00.000Z"}' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reaped: 2, failed: 0, deferred: 0 });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  // The same blob store the managed-voice ledger uses, under its own namespace.
  assert.deepEqual(storeRequests, [{ name: PRODUCTION_BUDGET_STORE_NAME, consistency: 'strong' }]);
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(statuses(fake), [['rtc_a', 'reaped'], ['rtc_b', 'reaped'], ['rtc_done', 'ended'], ['rtc_live', 'active']]);
  assert.deepEqual(events.filter((event) => event.event === 'sp_realtime_reaped'), [{ event: 'sp_realtime_reaped', reaped: 2, failed: 0, deferred: 0 }]);
  assert.ok(!JSON.stringify(events).includes(API_KEY));
  assert.ok(!JSON.stringify(events).includes('rtc_'));

  // The ledger policy comes from the same parser the route uses: a tuned cap
  // still opens the record the route wrote under the default cap only if they
  // agree, so the reaper reads the record as unavailable when they do not.
  const mismatched = createReaperHandler({
    readEnv: (name) => ({ ...env, SP_REALTIME_ROTATION_CAP_USD: '5' })[name],
    getStore() { return fake.store; },
    fetchImpl: fetch.fetchImpl,
    logger: (event) => events.push(event),
    clock: () => now,
  });
  const refused = await mismatched(new Request('https://proxy.example.test/reaper', { method: 'POST' }));
  assert.equal(refused.status, 503);
  assert.deepEqual(await refused.json(), { error: { code: 'budget_unavailable' } });
});

test('without a server key or a rotation the scheduled handler skips, says so, and touches neither store nor network', async () => {
  for (const [env, reason] of [
    [{ CONTEXT: 'production', SP_ROTATION_ID: ROTATION }, 'missing_api_key'],
    [{ CONTEXT: 'production', SP_ROTATION_ID: ROTATION, OPENAI_API_KEY: '  ' }, 'missing_api_key'],
    [{ CONTEXT: 'production', OPENAI_API_KEY: API_KEY }, 'invalid_configuration'],
    [{ CONTEXT: 'production', OPENAI_API_KEY: API_KEY, SP_ROTATION_ID: ROTATION, SP_REALTIME_STARTS_PER_DAY: 'many' }, 'invalid_configuration'],
  ]) {
    const events = [];
    let stores = 0;
    let fetches = 0;
    const handler = createReaperHandler({
      readEnv: (name) => env[name],
      getStore() { stores += 1; throw new Error('store must not be opened'); },
      fetchImpl: async () => { fetches += 1; throw new Error('network must not be touched'); },
      logger: (event) => events.push(event),
    });
    const response = await handler(new Request('https://proxy.example.test/reaper', { method: 'POST' }));
    assert.equal(response.status, 200, reason);
    assert.deepEqual(await response.json(), { reaped: 0, failed: 0, deferred: 0, skipped: reason });
    assert.deepEqual(events, [{ event: 'sp_realtime_reaper_skipped', reason }]);
    assert.equal(stores, 0);
    assert.equal(fetches, 0);
  }
  // A store that fails to open is reported, not thrown.
  const events = [];
  const broken = createReaperHandler({
    readEnv: (name) => ({ CONTEXT: 'production', OPENAI_API_KEY: API_KEY, SP_ROTATION_ID: ROTATION })[name],
    getStore() { throw new Error('no blobs context'); },
    fetchImpl: async () => { throw new Error('network must not be touched'); },
    logger: (event) => events.push(event),
  });
  const response = await broken(new Request('https://proxy.example.test/reaper', { method: 'POST' }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'internal_error' } });
  assert.deepEqual(events, [{ event: 'sp_realtime_reaper_failed', code: 'internal_error' }]);

  assert.throws(() => createReaperHandler({ readEnv: () => undefined }), /Invalid reaper dependencies/);
  assert.equal(typeof scheduledReaper, 'function');
});

test('the default scheduled export skips cleanly in a process without a key, touching no network', async () => {
  const names = ['CONTEXT', 'OPENAI_API_KEY', 'SP_ROTATION_ID'];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const priorFetch = globalThis.fetch;
  const priorInfo = console.info;
  const lines = [];
  process.env.CONTEXT = 'production';
  delete process.env.OPENAI_API_KEY;
  process.env.SP_ROTATION_ID = ROTATION;
  globalThis.fetch = async () => { throw new Error('network denied in endpoint tests'); };
  console.info = (line) => lines.push(line);
  try {
    const response = await scheduledReaper(new Request('https://proxy.example.test/reaper', { method: 'POST' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reaped: 0, failed: 0, deferred: 0, skipped: 'missing_api_key' });
    assert.deepEqual(lines.map((line) => JSON.parse(line)), [{ event: 'sp_realtime_reaper_skipped', reason: 'missing_api_key' }]);
  } finally {
    console.info = priorInfo;
    globalThis.fetch = priorFetch;
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
});
