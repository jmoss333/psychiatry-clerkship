import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEv, createProductionEv } from '../netlify/functions/ev.mjs';

const ALLOWLIST = { version: 1, keys: { ms3: ['page:t_mood.md', 'tool:interview-room:open'], res: ['page:x.md'] } };
const ORIGINS = ['https://une-ms3-psychiatry.netlify.app', 'https://mmc-psychiatry-residents-sanford.netlify.app'];

// Real allowlisted ms3 keys, read from the actual registry rather than
// invented strings — so "more than MAX_KEYS distinct keys" genuinely
// exercises the allowlist-membership check too, not just the cap.
const REAL_ALLOWLIST = JSON.parse(
  readFileSync(new URL('../allowlist.json', import.meta.url), 'utf8'),
);
const REAL_MS3_KEYS = REAL_ALLOWLIST.keys.ms3;
assert.ok(REAL_MS3_KEYS.length > 20, 'need more than MAX_KEYS real ms3 keys to test the cap');

function fakeStore() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
}

function post(body, origin = ORIGINS[0]) {
  return new Request('https://metrics.invalid/api/ev', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

const build = (store) => createEv({
  store, allowlist: ALLOWLIST, origins: ORIGINS,
  now: () => new Date('2026-09-04T12:00:00Z'),
});

test('counts an allowlisted key', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'ms3', keys: ['page:t_mood.md'] }));
  assert.equal(res.status, 204);
  assert.deepEqual(await store.get('ms3/2026-W36/page%3At_mood.md'),
    { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md', n: 1 });
});

test('silently drops a key that is not on the allowlist', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'ms3', keys: ['page:../../etc/passwd', 'free text'] }));
  assert.equal(res.status, 204, 'never tells a probe which keys are real');
  assert.equal(store.data.size, 0, 'nothing outside the allowlist may enter the store');
});

test('drops a key allowlisted for the OTHER site', async () => {
  const store = fakeStore();
  await build(store)(post({ site: 'ms3', keys: ['page:x.md'] }));
  assert.equal(store.data.size, 0);
});

test('rejects an unknown site', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'faculty', keys: ['page:t_mood.md'] }));
  assert.equal(res.status, 204);
  assert.equal(store.data.size, 0);
});

test('caps the batch at MAX_KEYS (20) even when every key is distinct and allowlisted', async () => {
  const store = fakeStore();
  const distinctRealKeys = REAL_MS3_KEYS.slice(0, 25); // > 20, all real, all distinct
  const buildReal = createEv({
    store, allowlist: REAL_ALLOWLIST, origins: ORIGINS,
    now: () => new Date('2026-09-04T12:00:00Z'),
  });
  const res = await buildReal(post({ site: 'ms3', keys: distinctRealKeys }));
  assert.equal(res.status, 204);
  assert.equal(store.data.size, 20,
    'sending 25 distinct allowlisted keys must still write only 20 — this would pass ' +
    'at 25 if the .slice(0, MAX_KEYS) cap were deleted');
  assert.ok(await store.get(`ms3/2026-W36/${encodeURIComponent(distinctRealKeys[0])}`),
    'a key within the cap must be written');
  assert.equal(await store.get(`ms3/2026-W36/${encodeURIComponent(distinctRealKeys[24])}`), null,
    'the 25th distinct key falls outside the 20-key cap and must not be written');
});

test('dedups repeated keys within a single batch', async () => {
  const store = fakeStore();
  await build(store)(post({ site: 'ms3', keys: Array(50).fill('page:t_mood.md') }));
  assert.equal((await store.get('ms3/2026-W36/page%3At_mood.md')).n, 1,
    'a repeated key in one batch counts once');
});

test('rejects a non-POST', async () => {
  const res = await build(fakeStore())(new Request('https://metrics.invalid/api/ev', { method: 'GET' }));
  assert.equal(res.status, 405);
});

test('rejects an origin that is not a learner site', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'ms3', keys: ['page:t_mood.md'] }, 'https://evil.invalid'));
  assert.equal(res.status, 403);
  assert.equal(store.data.size, 0);
});

test('a store failure still returns 204 and never throws to the client', async () => {
  const store = { async get() { throw new Error('blobs down'); }, async setJSON() {} };
  const res = await build(store)(post({ site: 'ms3', keys: ['page:t_mood.md'] }));
  assert.equal(res.status, 204);
});

test('malformed JSON is a 204, not a 500', async () => {
  const req = new Request('https://metrics.invalid/api/ev', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: ORIGINS[0] }, body: '{oops',
  });
  assert.equal((await build(fakeStore())(req)).status, 204);
});

test('the production store is acquired fresh on every invocation, never cached across calls', async () => {
  // Simulates the real @netlify/blobs contract: getStore(name) returns a new
  // client object each call, but every client talks to the same persistent
  // backend. A regression that memoizes the STORE (rather than just the
  // allowlist / the dynamic import) would still pass every other test here —
  // this is the only test that would catch it.
  const backend = new Map();
  let getStoreCalls = 0;
  const getStore = () => {
    getStoreCalls += 1;
    return {
      async get(k) { return backend.has(k) ? JSON.parse(backend.get(k)) : null; },
      async setJSON(k, v) { backend.set(k, JSON.stringify(v)); },
    };
  };

  const handler = createProductionEv({
    allowlist: ALLOWLIST, getStore, origins: ORIGINS,
    now: () => new Date('2026-09-04T12:00:00Z'),
  });

  await handler(post({ site: 'ms3', keys: ['page:t_mood.md'] }));
  await handler(post({ site: 'ms3', keys: ['page:t_mood.md'] }));

  assert.equal(getStoreCalls, 2, 'getStore() must run once per request, not once per container');
  assert.equal(JSON.parse(backend.get('ms3/2026-W36/page%3At_mood.md')).n, 2,
    'both invocations must still increment the same backend-persisted counter');
});
