import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js', import.meta.url,
), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`${source}\nreturn {fdOfflineUrls,fdOfflineResponse,fdOfflineStatus,fdOfflineCard};`)();
const dataSource = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js', import.meta.url,
), 'utf8');
// eslint-disable-next-line no-new-func
const { fdBuildIndex } = new Function(`${dataSource}\nreturn {fdBuildIndex};`)();
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const item = (ref, kind = ref.endsWith('.html') ? 'tool' : 'read', extra = {}) =>
  ({ ref, kind, ...extra });
const index = (items) => ({
  weeks: [{ n: 1, items: [item('week-one.md')] }, { n: 2, items }],
  byRef: Object.fromEntries([item('week-one.md'), ...items].map((it) => [it.ref, it])),
});
const route = [item('lesson.md'), item('practice.html')];

test('current week maps only its canonical reading and tool refs', () => {
  assert.deepEqual(F.fdOfflineUrls(index(route), { week: 2 }), [
    '/', '/search-index.json', '/content/lesson.md', '/tools/practice.html',
  ]);
});

test('duplicate week entries add one URL and never include another week', () => {
  const idx = index([route[0], route[0], route[1]]);
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), [
    '/', '/search-index.json', '/content/lesson.md', '/tools/practice.html',
  ]);
});

test('all six real MS3 weeks include their separately linked landing pages', () => {
  const cur = readJson('../curriculum.json');
  const projected = { ...cur, path: { id: 'ms3-six-week', weekCount: 6 },
    weeks: cur.learningPaths.ms3.weeks };
  const idx = fdBuildIndex(projected, readJson('../topic_meta.json'),
    readJson('../tool_registry.json'),
    readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json'));
  for (let week = 1; week <= 6; week += 1) {
    const urls = F.fdOfflineUrls(idx, { week });
    assert.equal(urls[2], `/content/week${week}.md`, `week ${week} landing precedes assignments`);
    assert.equal(urls.filter((url) => url === `/content/week${week}.md`).length, 1);
    assert.equal(urls.some((url) => /^\/content\/week[1-6]\.md$/.test(url)
      && url !== `/content/week${week}.md`), false);
  }
});

test('landing page is deduped with assignments and invalid landing refs are excluded', () => {
  const idx = index([item('landing.md'), item('lesson.md')]);
  idx.weeks[1].landingRef = 'landing.md';
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), [
    '/', '/search-index.json', '/content/landing.md', '/content/lesson.md',
  ]);
  idx.weeks[1].items = [item('lesson.md')];
  for (const landingRef of ['../escape.md', 'https://example.md', '//host.md',
    'audio.mp3', 'bad.md?x=1', 'bad.md#fragment', 'missing.md']) {
    idx.weeks[1].landingRef = landingRef;
    assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), [
      '/', '/search-index.json', '/content/lesson.md',
    ], landingRef);
  }
  idx.weeks[1].landingRef = 'landing.md';
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 99 }), []);
});

test('APP invitation computes bridge and all On shift activity refs afresh', () => {
  const idx = index([item('week.md'), item('pa.md'), item('nurse.md'), item('task.html')]);
  const appPathway = {
    bridges: { pa: { refs: ['pa.md'] }, pmhnp: { refs: ['nurse.md'] } },
    activities: [{ refs: ['task.html', 'pa.md'] }],
  };
  assert.deepEqual(F.fdOfflineUrls(idx, { appMode: true, appBridge: 'pmhnp', appPathway }), [
    '/', '/search-index.json', '/content/nurse.md', '/tools/task.html', '/content/pa.md',
  ]);
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), [
    '/', '/search-index.json', '/content/week.md', '/content/pa.md',
    '/content/nurse.md', '/tools/task.html',
  ]);
});

test('invalid or absent week and absent APP pathway are uncheckable', () => {
  const idx = index(route);
  assert.deepEqual(F.fdOfflineUrls(idx, {}), []);
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 99 }), []);
  assert.deepEqual(F.fdOfflineUrls(idx, { week: '2' }), []);
  assert.deepEqual(F.fdOfflineUrls(idx, { appMode: true, week: 2 }), []);
  assert.deepEqual(F.fdOfflineUrls(idx, { appMode: true, appPathway: { bridges: {} } }), []);
});

test('unsafe, media, rights, mismatched, and unindexed refs are excluded', () => {
  const refs = [
    item('good.md'), item('rights.html', 'tool', { rights: true }),
    item('audio.mp3', 'read'), item('video.mp4', 'tool'),
    item('outside.md?x=1'), item('frag.md#x'), item('../escape.md'),
    item('/absolute.md'), item('//host.md'), item('https:bad.md'),
    item('nested/page.md'), item('tool.md', 'tool'), item('page.html', 'read'),
    item('not-indexed.md'),
  ];
  const idx = index(refs);
  delete idx.byRef['not-indexed.md'];
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), [
    '/', '/search-index.json', '/content/good.md',
  ]);
});

test('inherited lookup entries and prototype keys cannot become URLs', () => {
  const idx = index([item('safe.md'), item('constructor.md')]);
  idx.byRef = Object.create({ 'ghost.md': item('ghost.md') });
  idx.byRef['safe.md'] = item('safe.md');
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), [
    '/', '/search-index.json', '/content/safe.md',
  ]);
});

test('inherited route refs and status claims do not become trusted input', () => {
  const idx = index([item('safe.md')]);
  idx.weeks[1].items = [item('safe.md')];
  idx.weeks[1].items.length = 2;
  Object.setPrototypeOf(idx.weeks[1].items, Object.assign([], { 1: item('ghost.md') }));
  assert.deepEqual(F.fdOfflineUrls(idx, { week: 2 }), ['/', '/search-index.json', '/content/safe.md']);
  const inheritedResponse = Object.create({ response: complete, expected: EXPECTED });
  assert.equal(F.fdOfflineStatus(inheritedResponse).kind, 'not-ready');
});

test('APP ignores inherited array refs when composing its route inventory', () => {
  const idx = index([item('pa.md'), item('task.html'), item('ghost.md')]);
  const bridgeRefs = ['pa.md'];
  bridgeRefs.length = 2;
  Object.setPrototypeOf(bridgeRefs, Object.assign([], { 1: 'ghost.md' }));
  const appPathway = {
    bridges: { pa: { refs: bridgeRefs } },
    activities: [{ refs: ['task.html'] }],
  };
  assert.deepEqual(F.fdOfflineUrls(idx, { appMode: true, appPathway }), [
    '/', '/search-index.json', '/content/pa.md', '/tools/task.html',
  ]);
});

test('overlarge route is uncheckable rather than silently truncated', () => {
  const items = Array.from({ length: 199 }, (_, n) => item(`p-${n}.md`));
  assert.deepEqual(F.fdOfflineUrls(index(items), { week: 2 }), []);
});

const EXPECTED = ['/', '/search-index.json', '/content/lesson.md', '/tools/practice.html'];
const complete = { version: 'abc-123', ready: true, present: EXPECTED, missing: [] };

test('response accepts exact unordered partition and derives ready from missing set', () => {
  assert.deepEqual(F.fdOfflineResponse(complete, EXPECTED), complete);
  const partial = { version: 'abc-123', ready: false,
    present: ['/tools/practice.html', '/'],
    missing: ['/content/lesson.md', '/search-index.json'] };
  assert.deepEqual(F.fdOfflineResponse(partial, EXPECTED), partial);
});

test('response rejects omitted, unexpected, duplicate, overlap, and invalid readiness', () => {
  const invalid = [
    { ...complete, present: ['/'] },
    { ...complete, present: [...EXPECTED, '/content/extra.md'] },
    { ...complete, present: [...EXPECTED, '/'] },
    { ...complete, present: ['/', '/search-index.json', '/content/lesson.md'], missing: ['/content/lesson.md', '/tools/practice.html'] },
    { ...complete, ready: false },
    { ...complete, ready: 'true' },
    { ...complete, version: '' },
    { ...complete, version: '../bad' },
    { ...complete, missing: 'none' },
    { ...complete, present: ['/content/lesson.md?x=1', '/', '/search-index.json', '/tools/practice.html'] },
  ];
  for (const value of invalid) assert.equal(F.fdOfflineResponse(value, EXPECTED), null);
  assert.equal(F.fdOfflineResponse(complete, []), null);
  assert.equal(F.fdOfflineResponse(complete, ['/', '/']), null);
  const sparseExpected = ['/'];
  sparseExpected.length = 2;
  Object.setPrototypeOf(sparseExpected, Object.assign([], { 1: '/content/ghost.md' }));
  assert.equal(F.fdOfflineResponse(complete, sparseExpected), null);
});

test('status treats malformed and truthy values as not ready', () => {
  assert.equal(F.fdOfflineStatus({ checking: true }).kind, 'checking');
  assert.equal(F.fdOfflineStatus({ response: complete, expected: EXPECTED }).kind, 'ready');
  assert.equal(F.fdOfflineStatus({ response: complete, expected: EXPECTED, waiting: true }).kind, 'update');
  assert.equal(F.fdOfflineStatus({ response: complete }).kind, 'not-ready');
  assert.equal(F.fdOfflineStatus({ response: { ready: true }, expected: EXPECTED, waiting: true }).kind, 'not-ready');
  assert.equal(F.fdOfflineStatus({ response: { ...complete, ready: false }, expected: EXPECTED, waiting: true }).kind, 'not-ready');
  assert.equal(F.fdOfflineStatus({ reason: 'timeout' }).kind, 'not-ready');
  assert.equal(F.fdOfflineStatus({ reason: 'unsupported' }).kind, 'not-ready');
  assert.equal(F.fdOfflineStatus({ reason: 'uncontrolled' }).kind, 'not-ready');
  assert.equal(F.fdOfflineStatus(true).kind, 'not-ready');
});

test('card names current cache status and connection-required exceptions', () => {
  assert.doesNotMatch(F.fdOfflineCard({ checking: true }), /fd-offline__status" role="status">Ready/);
  const ready = F.fdOfflineCard({ response: complete, expected: EXPECTED });
  assert.match(ready, /Ready/);
  assert.match(ready, /current device/i);
  for (const phrase of ['audio', 'video', 'live services', 'external links', 'email sending']) {
    assert.match(ready, new RegExp(phrase, 'i'));
  }
  assert.match(F.fdOfflineCard({ response: complete, expected: EXPECTED, waiting: true }), /Update available/);
  assert.match(F.fdOfflineCard({ reason: 'timeout' }), /Not ready/);
});
