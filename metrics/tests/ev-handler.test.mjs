import test from 'node:test';
import assert from 'node:assert/strict';
import { createEv } from '../netlify/functions/ev.mjs';

const ALLOWLIST = { version: 1, keys: { ms3: ['page:t_mood.md', 'tool:interview-room:open'], res: ['page:x.md'] } };
const ORIGINS = ['https://une-ms3-psychiatry.netlify.app', 'https://mmc-psychiatry-residents-sanford.netlify.app'];

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

test('caps the batch and dedups within it', async () => {
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
