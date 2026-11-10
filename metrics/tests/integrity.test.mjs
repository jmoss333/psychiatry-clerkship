import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore, setEnvironmentContext } from '@netlify/blobs';
import { blobKey, increment } from '../netlify/functions/_shared/counters.mjs';
import { createEv } from '../netlify/functions/ev.mjs';
import { createCohort, loadFeed, readRealCounters } from '../aggregate/cohort_function.mjs';
import { fakeStore } from './helpers/store.mjs';

const AT = { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md' };
const PATH = blobKey(AT.site, AT.week, AT.key);
const COLLECTION = { writesEnabled: true, armedFromWeek: '2026-W30',
  store: 'usage-counters', counterCeiling: 3 };
const CALENDAR = [{ id: 'b1', site: 'ms3', start: '2026-08-31', weeks: 6 }];

// Hold a stale write until other requests have persisted the capped state. No sleeps or timing.
function holdFirstWrite(store) {
  let notify, release;
  const ready = new Promise((resolve) => { notify = resolve; });
  const barrier = new Promise((resolve) => { release = resolve; });
  let first = true;
  return { ready, release, client: { ...store, async setJSON(...args) {
    if (first) { first = false; notify(); await barrier; }
    return store.setJSON(...args);
  } } };
}

for (const initial of [0, 1]) {
  test(`stale ${initial ? 'update' : 'creation'} cannot erase a concurrent cap`, async () => {
    const store = fakeStore();
    if (initial) await store.setJSON(PATH, { ...AT, n: initial });
    const held = holdFirstWrite(store);
    const stale = increment(held.client, AT, { ceiling: 3 });
    await held.ready;
    try {
      for (let i = initial; i < 3; i++) await increment(store, AT, { ceiling: 3 });
    } finally { held.release(); }
    assert.equal(await stale, 3);
    assert.deepEqual(await store.get(PATH), { ...AT, n: 3, capped: true });
  });
}

test('increments require strong snapshots and conditional writes, including cap normalization', async () => {
  const store = fakeStore();
  const writes = [];
  const client = { ...store,
    async getWithMetadata(key, options) {
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      return store.getWithMetadata(key, options);
    },
    async setJSON(key, row, options) {
      writes.push(options);
      return store.setJSON(key, row, options);
    },
  };
  await increment(client, AT, { ceiling: 3 });
  await increment(client, AT, { ceiling: 3 });
  await increment(client, AT, { ceiling: 2 });
  assert.deepEqual(writes, [{ onlyIfNew: true }, { onlyIfMatch: '1' }, { onlyIfMatch: '2' }]);
  assert.deepEqual(await store.get(PATH), { ...AT, n: 2, capped: true });
});

test('a cap remains sticky if the ceiling is raised or omitted', async () => {
  const store = fakeStore();
  await store.setJSON(PATH, { ...AT, n: 3, capped: true });
  const client = { ...store, async setJSON() { assert.fail('must not rewrite a capped counter'); } };
  assert.equal(await increment(client, AT, { ceiling: 9 }), 3);
  assert.equal(await increment(client, AT), 3);
  assert.deepEqual(await store.get(PATH), { ...AT, n: 3, capped: true });
});

test('missing ETags fail closed rather than falling back to an unconditional write', async () => {
  let writes = 0;
  const store = { async getWithMetadata() { return { data: { ...AT, n: 1 } }; },
    async setJSON() { writes++; return { modified: true }; } };
  await assert.rejects(increment(store, AT, { ceiling: 3 }), /ETag/);
  assert.equal(writes, 0);
});

test('conflicts stop at three attempts; the collector still responds 204', async () => {
  let reads = 0, writes = 0;
  const store = {
    async getWithMetadata() { reads++; return { data: { ...AT, n: 1 }, etag: 'stale' }; },
    async setJSON(_key, _row, options) {
      writes++;
      assert.deepEqual(options, { onlyIfMatch: 'stale' });
      return { modified: false };
    },
  };
  await assert.rejects(increment(store, AT, { ceiling: 3 }), /conflict/);
  assert.equal(reads, 3);
  assert.equal(writes, 3);
  reads = 0; writes = 0;
  const handler = createEv({ store, collection: COLLECTION,
    allowlist: { keys: { ms3: [AT.key], res: [] } }, now: () => new Date('2026-09-04') });
  const res = await handler(new Request('https://metrics.invalid/api/ev', {
    method: 'POST', headers: { origin: 'https://une-ms3-psychiatry.netlify.app' },
    body: JSON.stringify({ site: AT.site, keys: [AT.key] }),
  }), { deploy: { context: 'production', published: true } });
  assert.equal(res.status, 204);
  assert.equal(reads, 3);
  assert.equal(writes, 3);
});

for (const capped of [{ n: 500, capped: true }, { n: 500 }, { n: 900 }, { n: 1, capped: true }]) {
  test(`a countable capped cell never becomes a partial aggregate: ${JSON.stringify(capped)}`, async () => {
    const store = fakeStore();
    const collection = { ...COLLECTION, counterCeiling: 500 };
    await store.setJSON(PATH, { ...AT, n: 7 });
    await store.setJSON('contaminated', { ...AT, key: 'page:y.md', ...capped });
    await assert.rejects(readRealCounters(store, collection), /incomplete.*capped/i);
    const handler = createCohort({ load: () => loadFeed({ realEnabled: true,
      calendar: CALENDAR, collection, getStore: () => store }) });
    const res = await handler(new Request('https://metrics.invalid/api/cohort'));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { error: 'incomplete', reason: 'capped-counters' });
    const head = await handler(new Request('https://metrics.invalid/api/cohort', { method: 'HEAD' }));
    assert.equal(head.status, 503);
    assert.equal(await head.text(), '');
  });
}

test('pre-armed caps do not poison eligible rows; unarmed reads remain empty', async () => {
  const store = fakeStore();
  await store.setJSON('early', { ...AT, week: '2026-W29', n: 3, capped: true });
  await store.setJSON(PATH, { ...AT, n: 2 });
  assert.deepEqual(await readRealCounters(store, COLLECTION), [{ ...AT, n: 2 }]);
  assert.deepEqual(await readRealCounters(store), []);
});


test('pinned Blobs SDK sends conditional headers and retries HTTP 412 without losing a cap', async () => {
  // Actual SDK, fake transport only: no credentials or network, no permissive fake write API.
  setEnvironmentContext({ siteID: 'fixture', token: 'fixture-not-a-secret',
    edgeURL: 'https://cached.invalid', uncachedEdgeURL: 'https://strong.invalid' });
  let row = { ...AT, n: 1 }, etag = 'initial', conflict = true;
  const headersSeen = [];
  const store = getStore({ name: 'test', fetch: async (url, options) => {
    if (options.method === 'get') {
      assert.equal(new URL(url).hostname, 'strong.invalid');
      return new Response(JSON.stringify(row), { headers: { etag } });
    }
    assert.equal(options.method, 'put');
    headersSeen.push(options.headers);
    if (conflict) {
      // Another request reaches the cap before this conditional write arrives.
      conflict = false; row = { ...AT, n: 3, capped: true }; etag = 'newer';
      return new Response(null, { status: 412 });
    }
    assert.fail('after observing the cap, no second write is allowed');
  } });
  assert.equal(await increment(store, AT, { ceiling: 3 }), 3);
  assert.equal(headersSeen.length, 1);
  assert.equal(headersSeen[0]['if-match'], 'initial');
  assert.deepEqual(row, { ...AT, n: 3, capped: true });
});

test('pinned Blobs SDK sends If-None-Match for creation and recognizes a successful write', async () => {
  setEnvironmentContext({ siteID: 'fixture', token: 'fixture-not-a-secret',
    edgeURL: 'https://cached.invalid', uncachedEdgeURL: 'https://strong.invalid' });
  let writes = 0;
  const store = getStore({ name: 'test', fetch: async (url, options) => {
    if (options.method === 'get') {
      assert.equal(new URL(url).hostname, 'strong.invalid');
      return new Response(null, { status: 404 });
    }
    writes++;
    assert.equal(options.headers['if-none-match'], '*');
    assert.equal(options.headers['if-match'], undefined);
    assert.deepEqual(JSON.parse(options.body), { ...AT, n: 1 });
    return new Response(null, { status: 200, headers: { etag: 'new' } });
  } });
  assert.equal(await increment(store, AT, { ceiling: 3 }), 1);
  assert.equal(writes, 1);
});
