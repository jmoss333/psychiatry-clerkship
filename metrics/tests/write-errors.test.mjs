import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore, setEnvironmentContext } from '@netlify/blobs';
import { createCounterStore } from '../netlify/functions/_shared/blobs.mjs';
import { increment } from '../netlify/functions/_shared/counters.mjs';
import { createProductionEv } from '../netlify/functions/ev.mjs';

const AT = { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md' };
const COLLECTION = { writesEnabled: true, armedFromWeek: '2026-W30',
  store: 'usage-counters', counterCeiling: 3 };

function fixture(t, status, initial = 1, headers = {}) {
  // Exercise the actual pinned SDK's retry exhaustion without 5-second sleeps.
  // Only the HTTP transport and its sleep timer are replaced; no real network.
  const delays = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    delays.push(delay); queueMicrotask(callback);
  });
  setEnvironmentContext({ siteID: 'fixture', token: 'fixture-not-a-secret',
    edgeURL: 'https://cached.invalid', uncachedEdgeURL: 'https://strong.invalid' });
  const state = { row: initial ? { ...AT, n: initial } : null, reads: 0, writes: 0 };
  const fetch = async (url, options) => {
    if (options.method === 'get') {
      state.reads++;
      assert.equal(new URL(url).hostname, 'strong.invalid');
      return state.row
        ? new Response(JSON.stringify(state.row), { headers: { etag: 'initial' } })
        : new Response(null, { status: 404 });
    }
    assert.equal(options.method, 'put');
    state.writes++;
    if (initial) assert.equal(options.headers['if-match'], 'initial');
    else assert.equal(options.headers['if-none-match'], '*');
    const writeStatus = typeof status === 'function' ? status(state.writes) : status;
    if (writeStatus === 200) state.row = JSON.parse(options.body);
    // Error responses can have ETags too; an ETag alone proves no successful write.
    return new Response(null, { status: writeStatus, headers: { etag: 'response-etag', ...headers } });
  };
  return { state, fetch, delays };
}

for (const status of [403, 404, 429, 500]) {
  for (const initial of [0, 1]) {
    test(`HTTP ${status} cannot falsely acknowledge a counter ${initial ? 'update' : 'creation'}`, async (t) => {
      const { state, fetch, delays } = fixture(t, status, initial);
      const store = createCounterStore(getStore, 'test', fetch);
      await assert.rejects(increment(store, AT, { ceiling: 3 }),
        new RegExp(`counter write failed \\(HTTP ${status}\\)`));
      assert.deepEqual(state.row, initial ? { ...AT, n: initial } : null);
      const retried = status === 429 || status >= 500;
      assert.equal(state.reads, 1, 'a failed SDK write must not restart the increment');
      assert.equal(state.writes, retried ? 6 : 1);
      assert.equal(delays.length, retried ? 5 : 0, 'permanent errors must not enter SDK backoff');
      assert.equal(delays.reduce((sum, delay) => sum + delay, 0), retried ? 5 * (process.env.NODE_ENV === 'test' ? 1 : 5000) : 0);
    });
  }
}

test('the guarded SDK still accepts HTTP 200 and persists the increment', async (t) => {
  const { state, fetch } = fixture(t, 200);
  const store = createCounterStore(getStore, 'test', fetch);
  assert.equal(await increment(store, AT, { ceiling: 3 }), 2);
  assert.deepEqual(state.row, { ...AT, n: 2 });
  assert.equal(state.writes, 1);
});

test('a later successful SDK retry can acknowledge the persisted write', async (t) => {
  const { state, fetch } = fixture(t, (attempt) => attempt === 1 ? 500 : 200);
  const store = createCounterStore(getStore, 'test', fetch);
  assert.equal(await increment(store, AT, { ceiling: 3 }), 2);
  assert.deepEqual(state.row, { ...AT, n: 2 });
  assert.equal(state.reads, 1);
  assert.equal(state.writes, 2);
});

test('HTTP 412 remains a conditional conflict, without SDK transport retries', async (t) => {
  const { state, fetch } = fixture(t, 412);
  const store = createCounterStore(getStore, 'test', fetch);
  await assert.rejects(increment(store, AT, { ceiling: 3 }), /counter write conflict/);
  assert.deepEqual(state.row, { ...AT, n: 1 });
  assert.equal(state.reads, 3);
  assert.equal(state.writes, 3);
});

for (const status of [200, 403]) {
  test(`production wiring validates the raw write response and keeps HTTP ${status} private`, async (t) => {
    const { state, fetch } = fixture(t, status);
    let writers = 0;
    const handler = createProductionEv({
      allowlist: { keys: { ms3: [AT.key], res: [] } }, collection: COLLECTION,
      now: () => new Date('2026-09-04'), fetch,
      getStore(options) {
        if (options.fetch !== fetch) writers++;
        assert.equal(options.name, COLLECTION.store);
        return getStore(options);
      },
    });
    const response = await handler(new Request('https://metrics.invalid/api/ev', {
      method: 'POST', headers: { origin: 'https://une-ms3-psychiatry.netlify.app' },
      body: JSON.stringify({ site: AT.site, keys: [AT.key] }),
    }), { deploy: { context: 'production', published: true } });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(writers, 1, 'the production factory must isolate and validate the writer');
    assert.deepEqual(state.row, { ...AT, n: status === 200 ? 2 : 1 });
    assert.equal(state.writes, 1);
  });
}


test('the SDK still honors a long 429 reset header (a remaining deadline risk)', async (t) => {
  const now = 1700000000000;
  t.mock.method(Date, 'now', () => now);
  const { state, fetch, delays } = fixture(t, (attempt) => attempt === 1 ? 429 : 200, 1,
    { 'X-RateLimit-Reset': String((now + 120000) / 1000) });
  const store = createCounterStore(getStore, 'test', fetch);
  assert.equal(await increment(store, AT, { ceiling: 3 }), 2);
  assert.deepEqual(state.row, { ...AT, n: 2 });
  assert.deepEqual(delays, [120000]);
});

test("concurrent writes cannot validate one another's HTTP status", async (t) => {
  fixture(t, 200);
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const store = createCounterStore(getStore, 'test', async (url) => {
    if (new URL(url).pathname.endsWith('/failed')) {
      await barrier;
      return new Response(null, { status: 403, headers: { etag: 'misleading' } });
    }
    release();
    return new Response(null, { status: 200, headers: { etag: 'persisted' } });
  });
  const [failed, succeeded] = await Promise.allSettled([
    store.setJSON('failed', { ...AT, n: 2 }, { onlyIfMatch: 'old' }),
    store.setJSON('succeeded', { ...AT, n: 2 }, { onlyIfMatch: 'old' }),
  ]);
  assert.equal(failed.status, 'rejected');
  assert.match(failed.reason.message, /HTTP 403/);
  assert.equal(succeeded.status, 'fulfilled');
  assert.equal(succeeded.value.modified, true);
});
