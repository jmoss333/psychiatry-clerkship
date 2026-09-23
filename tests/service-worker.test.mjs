import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sw_template.js', import.meta.url,
), 'utf8');
const registerSource = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sw_register.js', import.meta.url,
), 'utf8');
const offlineModelSource = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js', import.meta.url,
), 'utf8');
const offlineModel = vm.runInNewContext(`${offlineModelSource}\n({fdOfflineUrls,fdOfflineUrl})`);

function worker(options = {}) {
  const handlers = {};
  const opened = [];
  const matched = [];
  const precache = ['/', '/search-index.json', '/content/lesson.md', '/tools/practice.html'];
  const hits = new Set(options.hits ?? precache);
  const cache = { match(url, matchOptions) {
    matched.push([url, matchOptions]);
    if (options.matchError) return Promise.reject(new Error('cache match failed'));
    return Promise.resolve(hits.has(url) ? { ok: true } : undefined);
  } };
  const caches = { open(name) {
    opened.push(name);
    if (options.openError) return Promise.reject(new Error('cache open failed'));
    return Promise.resolve(cache);
  } };
  const self = {
    location: { origin: 'https://library.example' },
    addEventListener(name, handler) { handlers[name] = handler; },
    skipWaiting() { self.skipped = true; },
  };
  const emitted = workerSource
    .replace("VERSION='__VERSION__';", "VERSION='test-v1';")
    .replace('KILL=__KILL__;', 'KILL=false;')
    .replace('/*__PRECACHE_START__*/[]/*__PRECACHE_END__*/',
      `/*__PRECACHE_START__*/${JSON.stringify(precache)}/*__PRECACHE_END__*/`);
  vm.runInNewContext(emitted, { self, caches, URL, Promise, fetch: () => Promise.reject(
    new Error('network unavailable')), setTimeout, clearTimeout });
  async function send(urls, { port = true, type = 'CW_OFFLINE_VERIFY' } = {}) {
    const messages = [];
    let settled;
    const ev = { data: { type, urls }, ports: port ? [{ postMessage(value) {
      messages.push(JSON.parse(JSON.stringify(value)));
    } }] : [], waitUntil(promise) { settled = promise; } };
    handlers.message(ev);
    if (settled) await settled;
    await Promise.resolve();
    return { messages, waited: !!settled };
  }
  return { send, handlers, opened, matched, precache, self };
}

test('active worker partitions deduped safe URLs using its current versioned cache', async () => {
  const w = worker({ hits: ['/', '/search-index.json', '/tools/practice.html'] });
  const result = await w.send(['/', '/search-index.json', '/content/lesson.md',
    '/tools/practice.html', '/content/lesson.md']);
  assert.equal(result.waited, true);
  assert.deepEqual(result.messages, [{ version: 'test-v1', ready: false,
    present: ['/', '/search-index.json', '/tools/practice.html'],
    missing: ['/content/lesson.md'] }]);
  assert.deepEqual(w.opened, ['cw-precache-test-v1']);
  assert.equal(w.matched.length, 4);
  assert.ok(w.matched.every(([, opts]) => opts?.ignoreSearch === false));
});

test('complete current cache replies ready with no missing URLs', async () => {
  const result = await worker().send(['/', '/search-index.json', '/content/lesson.md']);
  assert.deepEqual(result.messages, [{ version: 'test-v1', ready: true,
    present: ['/', '/search-index.json', '/content/lesson.md'], missing: [] }]);
});

test('route URL model and worker accept the same safe path language', async () => {
  const idx = { weeks: [{ n: 2, landingRef: 'week2.md', items: [
    { ref: 'lesson.md' }, { ref: 'practice.html' }, { ref: '../unsafe.md' },
  ] }], byRef: { 'week2.md': { ref: 'week2.md', kind: 'read' },
    'lesson.md': { ref: 'lesson.md', kind: 'read' },
    'practice.html': { ref: 'practice.html', kind: 'tool' },
    '../unsafe.md': { ref: '../unsafe.md', kind: 'read' } } };
  const urls = Array.from(offlineModel.fdOfflineUrls(idx, { week: 2 }));
  assert.deepEqual(urls, ['/', '/search-index.json', '/content/week2.md',
    '/content/lesson.md', '/tools/practice.html']);
  const w = worker({ hits: urls });
  const result = await w.send(urls);
  assert.deepEqual(result.messages, [{ version: 'test-v1', ready: true,
    present: urls, missing: [] }]);
  for (const invalid of ['/content/nested/a.md', '/content/a.mp3',
    '/content/a.md?x=1', '//elsewhere/a.md', '/content/../a.md']) {
    assert.equal(offlineModel.fdOfflineUrl(invalid), false, invalid);
    assert.deepEqual((await worker().send([invalid])).messages[0],
      { version: 'test-v1', ready: false, present: [], missing: [] }, invalid);
  }
});

test('worker accepts the 200-item bound and rejects item 201 before opening cache', async () => {
  const urls = ['/', '/search-index.json', ...Array.from({ length: 198 },
    (_, i) => `/content/lesson-${i}.md`)];
  const accepted = worker();
  const ok = await accepted.send(urls);
  assert.equal(ok.messages[0].missing.length, 198);
  assert.equal(accepted.matched.length, 200);
  const rejected = worker();
  const bad = await rejected.send([...urls, '/tools/extra.html']);
  assert.deepEqual(bad.messages, [{ version: 'test-v1', ready: false,
    present: [], missing: [] }]);
  assert.deepEqual(rejected.opened, []);
});

test('malformed, external, traversal, media, and nested paths never probe cache', async () => {
  const invalid = [null, {}, [], '/', ['https://elsewhere.example/lesson.md'],
    ['//elsewhere.example/lesson.md'], ['/content/../lesson.md'],
    ['/content/nested/lesson.md'], ['/content/lesson.md?x=1'],
    ['/content/lesson.md#part'], ['/content/lesson.mp3'],
    ['/tools/practice.mp4'], ['/content/%2e%2e.md'],
    ['/content/.hidden.md'], ['/tools/practice.md'], ['/content/lesson.html']];
  for (const urls of invalid) {
    const w = worker();
    const result = await w.send(urls);
    assert.deepEqual(result.messages, [{ version: 'test-v1', ready: false,
      present: [], missing: [] }], JSON.stringify(urls));
    assert.deepEqual(w.opened, [], JSON.stringify(urls));
  }
});

test('missing port and unrelated messages never open the cache', async () => {
  const w = worker();
  assert.deepEqual((await w.send(['/'], { port: false })).messages, []);
  assert.deepEqual((await w.send(['/'], { type: 'OTHER' })).messages, []);
  assert.deepEqual(w.opened, []);
});

test('cache open or match failures reply once with all requested URLs missing', async () => {
  for (const failure of [{ openError: true }, { matchError: true }]) {
    const w = worker(failure);
    const result = await w.send(['/', '/content/lesson.md']);
    assert.equal(result.waited, true);
    assert.deepEqual(result.messages, [{ version: 'test-v1', ready: false,
      present: [], missing: ['/', '/content/lesson.md'] }]);
  }
});

test('existing skip-waiting and media fetch behavior remain intact', () => {
  const w = worker();
  w.handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(w.self.skipped, true);
  for (const url of ['https://library.example/audio/brief.mp3',
    'https://library.example/media/video.mp4']) {
    let responded = false;
    w.handlers.fetch({ request: { url, mode: 'cors', headers: { Range: 'bytes=0-' } },
      respondWith() { responded = true; } });
    assert.equal(responded, false);
  }
});

function registration(options = {}) {
  const reg = { update: options.update ?? (() => Promise.resolve()),
    addEventListener() {} };
  const navigator = options.unsupported ? {} : { serviceWorker: {
    register: options.register ?? (() => Promise.resolve(reg)),
    addEventListener() {}, controller: {},
  } };
  const context = { navigator, Promise, URLSearchParams,
    location: { search: '', reload() {} }, document: { createElement() { return {}; }, body: {} } };
  vm.runInNewContext(registerSource, context);
  return { context, reg };
}

test('registration API reports unsupported, unregistered, and fulfilled update accurately', async () => {
  const unsupported = registration({ unsupported: true });
  assert.equal(unsupported.context.clerkshipSWRegistration(), null);
  assert.equal(await unsupported.context.requestClerkshipSWUpdate(), false);
  const pending = registration({ register: () => new Promise(() => {}) });
  assert.equal(pending.context.clerkshipSWRegistration(), null);
  assert.equal(await pending.context.requestClerkshipSWUpdate(), false);
  let updated = 0;
  const ready = registration({ update: () => { updated += 1; return Promise.resolve(); } });
  await Promise.resolve();
  assert.equal(ready.context.clerkshipSWRegistration(), ready.reg);
  assert.equal(await ready.context.requestClerkshipSWUpdate(), true);
  assert.equal(updated, 1);
});

test('registration update rejection resolves false', async () => {
  const r = registration({ update: () => Promise.reject(new Error('offline')) });
  await Promise.resolve();
  assert.equal(await r.context.requestClerkshipSWUpdate(), false);
});
