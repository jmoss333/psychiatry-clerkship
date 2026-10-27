import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// F8 read-only cohort aggregate (D-F8-2). Pins the HANDLER only: method gate, no storage, no
// request reading, no logging, real data hard-off. The aggregation/suppression engine it shares
// with the director dashboard is tested once, in the root tests/director-dashboard.test.mjs.

const SOURCE = readFileSync(new URL('../aggregate/cohort_function.mjs', import.meta.url), 'utf8');
// Code only (comments describe what the function never does, so they must not trip the scans).
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const mod = await import('../aggregate/cohort_function.mjs');

test('module boots (bundler-carried files resolve) and the default export is a handler', async () => {
  assert.equal(typeof mod.default, 'function');
  const res = await mod.default(new Request('https://metrics.invalid/api/cohort'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'same-origin only');
});

test('serves the SYNTHETIC aggregate: grouped, suppressed totals and nothing raw', async () => {
  const body = await (await mod.default(new Request('https://metrics.invalid/api/cohort'))).json();
  assert.equal(body._synthetic, true);
  assert.equal(body.aggregateVersion, 1);
  assert.deepEqual(Object.keys(body.sites).sort(), ['ms3', 'res']);
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /"counters"|"prepost"|"week":|answered-|graded-/);
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.shown === false) assert.deepEqual(Object.keys(o), ['shown'], 'a hidden cell carries no value');
    Object.values(o).forEach(walk);
  })(body);
});

test('the response does not depend on anything in the request', async () => {
  const plain = await (await mod.default(new Request('https://metrics.invalid/api/cohort'))).text();
  const noisy = await (await mod.default(new Request('https://metrics.invalid/api/cohort?site=res&block=x&raw=1', {
    headers: { origin: 'https://evil.invalid', 'x-forwarded-for': '203.0.113.9', cookie: 'a=b' },
  }))).text();
  assert.equal(noisy, plain);
});

test('only GET/HEAD; writes are refused', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await mod.default(new Request('https://metrics.invalid/api/cohort', { method, body: method === 'OPTIONS' ? undefined : '{}' }));
    assert.equal(res.status, 405, method);
  }
  const head = await mod.default(new Request('https://metrics.invalid/api/cohort', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('real counters are HARD-disabled: literal false, no env switch, store never touched', async () => {
  assert.equal(mod.REAL_COUNTERS_ENABLED, false);
  assert.equal(mod.REAL_CALENDAR, null);
  assert.match(SOURCE, /export const REAL_COUNTERS_ENABLED = false;/);
  assert.match(SOURCE, /ENABLE ONLY AFTER THE L8 D1–D3 OWNER\s*\n\/\/ DECISIONS/);
  assert.doesNotMatch(CODE, /process\.env|Netlify\.env|Deno\.env/);
  let touched = 0;
  const getStore = () => { touched++; return { list: async () => ({ blobs: [] }) }; };
  const feed = await mod.loadFeed({ getStore });
  assert.equal(feed._synthetic, true);
  assert.equal(touched, 0, 'default path never acquires the store');
  // Even with the flag forced on in a test, the real path refuses without a wired calendar.
  await assert.rejects(mod.loadFeed({ realEnabled: true, getStore }), /no rotation calendar wired/);
  assert.equal(touched, 0);
});

test('nothing is stored, logged or cookied', () => {
  assert.doesNotMatch(CODE, /console\.|setJSON|\.set\(|\.delete\(|writeFile|appendFile|Set-Cookie/i);
  assert.doesNotMatch(CODE, /request\.(json|text|formData|arrayBuffer|headers|url|body)\b/);
});

test('readRealCounters keeps only the 4-field contract shape (fake store, flag untouched)', async () => {
  const rows = {
    a: { site: 'ms3', week: '2026-W37', key: 'page:x.md', n: 3, ip: '203.0.113.9' },
    b: { site: 'ms3', week: '2026-W37', key: 'page:y.md', n: 2.5 },
    c: null,
  };
  const store = { list: async () => ({ blobs: Object.keys(rows).map((key) => ({ key })) }), get: async (k) => rows[k] };
  assert.deepEqual(await mod.readRealCounters(store), [{ site: 'ms3', week: '2026-W37', key: 'page:x.md', n: 3 }]);
});

test('UN-WIRED: no Netlify site deploys it (the metrics site does not exist yet)', () => {
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.doesNotMatch(toml, /cohort|aggregate\//, 'metrics/netlify.toml must not reference it until the owner wires it');
  assert.throws(() => readFileSync(new URL('../netlify/functions/cohort.mjs', import.meta.url)),
    /ENOENT/, 'it must stay out of the auto-discovered functions directory');
  assert.match(SOURCE, /UN-WIRED\. This file deliberately lives OUTSIDE metrics\/netlify\/functions\//);
});

test('a broken feed fails closed with no detail', async () => {
  const res = await mod.createCohort({ load: async () => ({ _synthetic: true, contractVersion: 1, rotationBlocks: [], counters: [{ student: 'x' }] }) })(
    new Request('https://metrics.invalid/api/cohort'));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'unavailable' });
});
