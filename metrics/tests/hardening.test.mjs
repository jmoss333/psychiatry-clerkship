import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as collector from '../netlify/functions/ev.mjs';
import { createEv, createProductionEv, isPublishedProduction, LEARNER_ORIGIN_SITES } from '../netlify/functions/ev.mjs';
import {
  DISABLED, isIsoWeek, loadCollection, parseCollection, weekCounts,
} from '../netlify/functions/_shared/collection.mjs';
import { blobKey, increment } from '../netlify/functions/_shared/counters.mjs';

// H1-H6 hardening of the usage-analytics collector (metrics/HARDENING.md). Each gate is pinned
// on its own: every test here would pass if its gate were deleted ONLY by also breaking the
// assertion that names it.

const MS3 = 'https://une-ms3-psychiatry.netlify.app';
const RES = 'https://mmc-psychiatry-residents-sanford.netlify.app';
const ALLOWLIST = { version: 1, keys: { ms3: ['page:t_mood.md'], res: ['page:x.md'] } };
const NOW = () => new Date('2026-09-04T12:00:00Z'); // ISO week 2026-W36
const WEEK = '2026-W36';
const PROD = { deploy: { context: 'production', published: true } };

const armed = (overrides = {}) => parseCollection({
  schemaVersion: 1, writes: 'on', armedFromWeek: '2026-W30', store: 'usage-counters',
  counterCeiling: 500, ...overrides,
});

function fakeStore() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
}

function post(body, origin = MS3) {
  return new Request('https://metrics.invalid/api/ev', {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', origin },
    body: JSON.stringify(body),
  });
}

/** A handler plus a counter of how often it acquired the store. */
function rig(collection, { now = NOW } = {}) {
  const store = fakeStore();
  let acquired = 0;
  const handler = createEv({
    getStore: () => { acquired += 1; return store; }, allowlist: ALLOWLIST, now, collection,
  });
  return { store, handler, acquired: () => acquired };
}

const MS3_EVENT = { site: 'ms3', keys: ['page:t_mood.md'] };
const MS3_BLOB = blobKey('ms3', WEEK, 'page:t_mood.md');

// ── H1: writes disabled by default; an explicit enable flag is required ──────────────────────

test('H1: the committed collection.json ships with writes OFF and unarmed', () => {
  // Deliberate tripwire. Turning collection on is a reviewed owner decision (L8 switch-on, not
  // before the determination letters): the PR that flips metrics/collection.json must update
  // this assertion in the same diff, so the change cannot land unnoticed.
  const raw = JSON.parse(readFileSync(new URL('../collection.json', import.meta.url), 'utf8'));
  assert.equal(raw.writes, 'off');
  assert.equal(raw.armedFromWeek, null);
  assert.equal(loadCollection().writesEnabled, false);
});

test('H1: a handler built without a collection writes nothing, even as published production', async () => {
  const store = fakeStore();
  let acquired = 0;
  const handler = createEv({ getStore: () => { acquired += 1; return store; }, allowlist: ALLOWLIST, now: NOW });
  const res = await handler(post(MS3_EVENT), PROD);
  assert.equal(res.status, 204);
  assert.equal(acquired, 0, 'the default collection must never acquire the store');
  assert.equal(store.data.size, 0);
});

test('H1: writes "off", a missing flag, or any value other than the exact string "on" stays off', async () => {
  for (const writes of ['off', undefined, true, 'ON', 'yes', 1]) {
    const { handler, acquired } = rig(armed({ writes }));
    assert.equal((await handler(post(MS3_EVENT), PROD)).status, 204);
    assert.equal(acquired(), 0, `writes=${JSON.stringify(writes)} must not enable writes`);
  }
});

test('H1: "on" without an armed week is still off (both halves of the switch are required)', async () => {
  const { handler, acquired } = rig(armed({ armedFromWeek: null }));
  await handler(post(MS3_EVENT), PROD);
  assert.equal(acquired(), 0);
});

test('H1: malformed switch files fail closed', () => {
  for (const raw of [null, [], 'on', {}, { schemaVersion: 2, writes: 'on', armedFromWeek: '2026-W30', store: 'usage-counters', counterCeiling: 500 },
    { schemaVersion: 1, writes: 'on', armedFromWeek: '2026-W30', store: '../x', counterCeiling: 500 },
    { schemaVersion: 1, writes: 'on', armedFromWeek: '2026-W30', store: 'usage-counters', counterCeiling: 0 },
    { schemaVersion: 1, writes: 'on', armedFromWeek: '2026-W30', store: 'usage-counters', counterCeiling: 2.5 }]) {
    assert.equal(parseCollection(raw).writesEnabled, false, JSON.stringify(raw));
  }
  assert.equal(loadCollection(new URL('file:///nonexistent/collection.json')), DISABLED,
    'an unreadable switch file disables writes rather than throwing at boot');
});

test('H1: an explicitly enabled and armed switch writes', async () => {
  const { store, handler } = rig(armed());
  await handler(post(MS3_EVENT), PROD);
  assert.equal((await store.get(MS3_BLOB)).n, 1);
});

test('H1: the switch is unobservable from outside (same 204, no body, either way)', async () => {
  const off = await rig(DISABLED).handler(post(MS3_EVENT), PROD);
  const on = await rig(armed()).handler(post(MS3_EVENT), PROD);
  assert.equal(off.status, on.status);
  assert.equal(await off.text(), await on.text());
});

test('H1: the OPTIONS preflight (the kit smoke test) still answers 204 with writes off', async () => {
  const { handler, acquired } = rig(DISABLED);
  const res = await handler(new Request('https://metrics.invalid/api/ev', { method: 'OPTIONS', headers: { origin: MS3 } }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), MS3);
  assert.equal(acquired(), 0);
});

// ── H2: only the published production deploy writes ──────────────────────────────────────────

test('H2: deploy previews, branch deploys, dev, unpublished production and missing context never write', async () => {
  const contexts = [
    undefined,
    {},
    { deploy: {} },
    { deploy: { context: 'deploy-preview', published: false } },
    { deploy: { context: 'deploy-preview', published: true } },
    { deploy: { context: 'branch-deploy', published: false } },
    { deploy: { context: 'dev', published: false } },
    { deploy: { context: 'production', published: false } }, // an old production permalink
    { deploy: { context: 'production' } },
    { deploy: { context: 'production', published: 'true' } },
  ];
  for (const ctx of contexts) {
    const { store, handler, acquired } = rig(armed());
    const res = await handler(post(MS3_EVENT), ctx);
    assert.equal(res.status, 204);
    assert.equal(acquired(), 0, `context ${JSON.stringify(ctx)} must not acquire the store`);
    assert.equal(store.data.size, 0);
  }
  assert.equal(isPublishedProduction(PROD), true);
});

test('H2: the gate reads the trusted handler context, never the CONTEXT env var', async () => {
  const source = readFileSync(new URL('../netlify/functions/ev.mjs', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /process\.env|Netlify\.env/, 'the collector reads no environment variables');
  const saved = process.env.CONTEXT;
  process.env.CONTEXT = 'production';
  try {
    const { acquired, handler } = rig(armed());
    await handler(post(MS3_EVENT), { deploy: { context: 'deploy-preview', published: false } });
    assert.equal(acquired(), 0, 'CONTEXT=production in the environment must not unlock a preview');
  } finally {
    if (saved === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = saved;
  }
});

test('H2: the production entry point forwards Netlify\'s context to the gate', async () => {
  const mod = await import('../netlify/functions/ev.mjs');
  assert.equal(mod.default.length, 2, 'default export must accept (request, context)');
  let acquired = 0;
  const handler = createProductionEv({
    allowlist: ALLOWLIST, getStore: () => { acquired += 1; return fakeStore(); }, now: NOW, collection: armed(),
  });
  await handler(post(MS3_EVENT), { deploy: { context: 'branch-deploy', published: false } });
  assert.equal(acquired, 0);
  await handler(post(MS3_EVENT), PROD);
  assert.equal(acquired, 1);
});

// ── H3: each learner origin may post counts for its own site only ────────────────────────────

test('H3: the origin→site map is exactly the two learner sites', () => {
  assert.deepEqual({ ...LEARNER_ORIGIN_SITES }, { [MS3]: 'ms3', [RES]: 'res' });
});

test('H3: the MS3 origin cannot write residents counts, and vice versa', async () => {
  const a = rig(armed());
  await a.handler(post({ site: 'res', keys: ['page:x.md'] }, MS3), PROD);
  assert.equal(a.acquired(), 0, 'ms3 origin posting site=res must be dropped');
  assert.equal(a.store.data.size, 0);

  const b = rig(armed());
  await b.handler(post({ site: 'ms3', keys: ['page:t_mood.md'] }, RES), PROD);
  assert.equal(b.acquired(), 0, 'res origin posting site=ms3 must be dropped');
});

test('H3: each origin still writes its own site', async () => {
  const { store, handler } = rig(armed());
  await handler(post({ site: 'ms3', keys: ['page:t_mood.md'] }, MS3), PROD);
  await handler(post({ site: 'res', keys: ['page:x.md'] }, RES), PROD);
  assert.equal((await store.get(MS3_BLOB)).n, 1);
  assert.equal((await store.get(blobKey('res', WEEK, 'page:x.md'))).n, 1);
});

test('H3: a learner-site deploy-preview origin is not a learner origin', async () => {
  const { handler, acquired } = rig(armed());
  const res = await handler(post(MS3_EVENT, 'https://deploy-preview-1--une-ms3-psychiatry.netlify.app'), PROD);
  assert.equal(res.status, 403);
  assert.equal(acquired(), 0);
});

// ── H4: per-client rate limit at Netlify's edge (code-based rule, available on every plan) ───

test('H4: the only registered collector path carries the per-IP rate limit', () => {
  assert.deepEqual(collector.config, {
    path: '/api/ev',
    rateLimit: {
      action: 'rate_limit',
      windowLimit: 120,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    },
  }, 'custom path disables the default function endpoint; the rule must cover that path');
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  const active = toml.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(active, /\[\[redirects\]\]/,
    'no rewrite may target the disabled endpoint or create an alternate collector route');
});

test('H4: direct function URLs and alternate paths cannot read bodies or acquire storage', async () => {
  for (const path of [
    '/.netlify/functions/ev', '/.netlify/functions/ev/', '/.netlify/functions/ev/extra',
    '/.netlify/functions/ev?path=/api/ev', '/api/ev/', '/api/ev/extra', '/api/%65v',
    '/API/ev', '/unlimited',
  ]) {
    for (const method of ['POST', 'OPTIONS']) {
      let acquired = 0;
      const handler = createProductionEv({
        allowlist: ALLOWLIST, now: NOW, collection: armed(),
        getStore: () => { acquired += 1; return fakeStore(); },
      });
      const request = new Request(`https://metrics.invalid${path}`, {
        method, headers: { origin: MS3, 'Content-Type': 'text/plain' },
        ...(method === 'POST' ? { body: JSON.stringify(MS3_EVENT) } : {}),
      });
      let bodyRead = false;
      request.text = async () => { bodyRead = true; return JSON.stringify(MS3_EVENT); };
      const response = await handler(request, PROD);
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(bodyRead, false, `${method} ${path} must not read the body`);
      assert.equal(acquired, 0, `${method} ${path} must not acquire storage`);
    }
  }
});

test('H4: the canonical route accepts POST and OPTIONS, including query strings', async () => {
  for (const suffix of ['', '?ignored=value']) {
    const { handler, store, acquired } = rig(armed());
    const url = `https://metrics.invalid/api/ev${suffix}`;
    const preflight = await handler(new Request(url, { method: 'OPTIONS', headers: { origin: MS3 } }), PROD);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), MS3);
    assert.equal(acquired(), 0);
    const response = await handler(new Request(url, {
      method: 'POST', headers: { origin: MS3 }, body: JSON.stringify(MS3_EVENT),
    }), PROD);
    assert.equal(response.status, 204);
    assert.equal((await store.get(MS3_BLOB)).n, 1);
  }
});

// ── H5: per-counter ceiling ──────────────────────────────────────────────────────────────────

test('H5: a counter stops at the ceiling and is marked capped exactly once', async () => {
  const store = fakeStore();
  const at = { site: 'ms3', week: WEEK, key: 'page:t_mood.md' };
  let writes = 0;
  const counting = { get: store.get, async setJSON(k, v) { writes += 1; return store.setJSON(k, v); } };
  for (let i = 0; i < 2; i += 1) await increment(counting, at, { ceiling: 3 });
  assert.deepEqual(await store.get(blobKey(at.site, at.week, at.key)), { ...at, n: 2 });
  assert.equal(await increment(counting, at, { ceiling: 3 }), 3);
  assert.deepEqual(await store.get(blobKey(at.site, at.week, at.key)), { ...at, n: 3, capped: true });
  const before = writes;
  for (let i = 0; i < 10; i += 1) assert.equal(await increment(counting, at, { ceiling: 3 }), 3);
  assert.equal(writes, before, 'a capped counter costs reads only, never another write');
});

test('H5: a pre-existing counter above a lowered ceiling is clamped and capped', async () => {
  const store = fakeStore();
  const at = { site: 'ms3', week: WEEK, key: 'page:t_mood.md' };
  await store.setJSON(blobKey(at.site, at.week, at.key), { ...at, n: 9 });
  assert.equal(await increment(store, at, { ceiling: 5 }), 5);
  assert.deepEqual(await store.get(blobKey(at.site, at.week, at.key)), { ...at, n: 5, capped: true });
});

test('H5: the collector applies the switch\'s ceiling', async () => {
  const { store, handler } = rig(armed({ counterCeiling: 2 }));
  for (let i = 0; i < 5; i += 1) await handler(post(MS3_EVENT), PROD);
  assert.deepEqual(await store.get(MS3_BLOB), { site: 'ms3', week: WEEK, key: 'page:t_mood.md', n: 2, capped: true });
});

// ── H6: weeks before the armed week are never written or read ────────────────────────────────

test('H6: ISO week strings compare correctly across years', () => {
  assert.ok(isIsoWeek('2027-W01') && !isIsoWeek('2027-W54') && !isIsoWeek('2027-W1'));
  const c = armed({ armedFromWeek: '2027-W02' });
  assert.equal(weekCounts('2026-W53', c), false);
  assert.equal(weekCounts('2027-W01', c), false);
  assert.equal(weekCounts('2027-W02', c), true);
  assert.equal(weekCounts('2028-W01', c), true);
  assert.equal(weekCounts('2027-W10', DISABLED), false, 'unarmed: no week counts');
});

test('H6: the collector writes nothing before the armed week, and starts on it', async () => {
  const early = rig(armed({ armedFromWeek: '2027-W02' }), { now: () => new Date('2027-01-06T12:00:00Z') }); // 2027-W01
  await early.handler(post(MS3_EVENT), PROD);
  assert.equal(early.acquired(), 0, 'a week before armedFromWeek must not be written');

  const onTime = rig(armed({ armedFromWeek: '2027-W02' }), { now: () => new Date('2027-01-11T12:00:00Z') }); // 2027-W02
  await onTime.handler(post(MS3_EVENT), PROD);
  assert.equal((await onTime.store.get(blobKey('ms3', '2027-W02', 'page:t_mood.md'))).n, 1);
});

test('H6 + H5: the cohort reader drops pre-armed weeks and capped cells', async () => {
  const { readRealCounters, loadFeed } = await import('../aggregate/cohort_function.mjs');
  const rows = {
    a: { site: 'ms3', week: '2027-W01', key: 'page:x.md', n: 7 },           // before armed week
    b: { site: 'ms3', week: '2027-W02', key: 'page:x.md', n: 6 },           // counts
    c: { site: 'ms3', week: '2027-W03', key: 'page:y.md', n: 500, capped: true }, // capped
  };
  const store = { list: async () => ({ blobs: Object.keys(rows).map((key) => ({ key })) }), get: async (k) => rows[k] };
  const c = armed({ armedFromWeek: '2027-W02' });
  assert.deepEqual(await readRealCounters(store, c), [{ site: 'ms3', week: '2027-W02', key: 'page:x.md', n: 6 }]);
  assert.deepEqual(await readRealCounters(store), [], 'with the committed (unarmed) switch nothing counts');
  await assert.rejects(
    loadFeed({ realEnabled: true, calendar: [{ id: 'b1', site: 'ms3', start: '2027-01-04', weeks: 6 }], getStore: () => store }),
    /collection not armed/,
  );
});

test('H6: the reader opens the same store the writer writes', async () => {
  const { loadFeed } = await import('../aggregate/cohort_function.mjs');
  let opened = null;
  await loadFeed({
    realEnabled: true,
    calendar: [{ id: 'b1', site: 'ms3', start: '2027-01-04', weeks: 6 }],
    collection: armed({ store: 'usage-counters-2027', armedFromWeek: '2027-W02' }),
    getStore: (name) => { opened = name; return { list: async () => ({ blobs: [] }) }; },
  });
  assert.equal(opened, 'usage-counters-2027');
});
