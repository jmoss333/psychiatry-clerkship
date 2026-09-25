import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = path.join(process.cwd(), '13_Faculty_Resources/_automation/site_build/analytics.js');
const source = fs.readFileSync(SRC, 'utf8');

function load({ dnt = undefined, gpc = undefined, stored = null, site = 'ms3', page = undefined } = {}) {
  const sent = [];
  const store = { value: stored };
  const win = {
    CW_SITE: site,
    CW_PAGE: page,
    navigator: {
      doNotTrack: dnt,
      globalPrivacyControl: gpc,
      sendBeacon: (url, body) => { sent.push({ url, body: JSON.parse(body) }); return true; },
    },
    localStorage: {
      getItem: (k) => (k === 'cw_analytics_optout_v1' ? store.value : null),
      setItem: (k, v) => { if (k === 'cw_analytics_optout_v1') store.value = v; },
      removeItem: (k) => { if (k === 'cw_analytics_optout_v1') store.value = null; },
    },
    addEventListener() {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(source, win);
  return { api: win.cwAnalytics, sent, store };
}

test('records an event as a beacon to /api/ev', () => {
  const { api, sent } = load();
  api.record('page:t_mood.md');
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/api\/ev$/);
  assert.deepEqual(sent[0].body, { site: 'ms3', keys: ['page:t_mood.md'] });
});

test('transmits no identifier and no timestamp', () => {
  const { api, sent } = load();
  api.record('page:t_mood.md');
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['keys', 'site'],
    'the payload has exactly two fields: site and keys');
  const serialized = JSON.stringify(sent[0].body);
  assert.doesNotMatch(serialized, /\d{4}-\d{2}-\d{2}T/, 'no timestamp');
  assert.doesNotMatch(serialized, /session|visit|uuid|[0-9a-f]{16}/i, 'no identifier');
});

test('dedups a repeated key within the visit', () => {
  const { api, sent } = load();
  api.record('tool:interview-room:open');
  api.record('tool:interview-room:open');
  assert.equal(sent.length, 1, 'a refresh or replay must not double-count');
});

test('sends nothing when Do Not Track is set', () => {
  const { api, sent } = load({ dnt: '1' });
  api.record('page:t_mood.md');
  assert.equal(sent.length, 0);
});

test('sends nothing when Global Privacy Control is set', () => {
  const { api, sent } = load({ gpc: true });
  api.record('page:t_mood.md');
  assert.equal(sent.length, 0);
});

test('sends nothing when the learner has opted out', () => {
  const { api, sent } = load({ stored: '1' });
  api.record('page:t_mood.md');
  assert.equal(sent.length, 0);
  assert.equal(api.enabled(), false);
});

test('optOut persists to the cw_-namespaced key and takes effect immediately', () => {
  const { api, sent, store } = load();
  api.optOut();
  api.record('page:t_mood.md');
  assert.equal(store.value, '1');
  assert.equal(sent.length, 0);
  api.optIn();
  api.record('page:t_mood.md');
  assert.equal(sent.length, 1);
});

test('a throwing sendBeacon never propagates to the page', () => {
  const sent = [];
  const win = {
    CW_SITE: 'ms3',
    navigator: {
      sendBeacon: () => { throw new Error('beacon blocked by an extension'); },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(source, win);
  assert.doesNotThrow(() => win.cwAnalytics.record('page:t_mood.md'));
  assert.equal(sent.length, 0);
});

test('a throwing localStorage does not disable the page', () => {
  const win = {
    CW_SITE: 'ms3',
    navigator: { sendBeacon: () => true },
    localStorage: { getItem: () => { throw new Error('site data blocked'); }, setItem() {}, removeItem() {} },
    addEventListener() {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(source, win);
  assert.doesNotThrow(() => win.cwAnalytics.record('page:t_mood.md'));
});

test('the source references only the one sanctioned storage key', () => {
  const keys = [...source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'expected at least one storage access');
  for (const k of keys) assert.equal(k, 'cw_analytics_optout_v1');
});

// --- Auto-record of the current page (CW_PAGE), a build-time literal only ---

test('auto-records page:<CW_PAGE> on load when CW_PAGE is a non-empty string', () => {
  const { sent } = load({ page: 't_mood.md' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/api\/ev$/);
  assert.deepEqual(sent[0].body, { site: 'ms3', keys: ['page:t_mood.md'] });
});

test('auto-record sends nothing when CW_PAGE is absent, empty, or not a string', () => {
  for (const page of [undefined, '', 0, null, {}, []]) {
    const { sent } = load({ page });
    assert.equal(sent.length, 0, `CW_PAGE=${JSON.stringify(page)} must not auto-record`);
  }
});

test('auto-record does not fire when opted out, or when DNT/GPC is set', () => {
  assert.equal(load({ page: 't_mood.md', stored: '1' }).sent.length, 0, 'opted out');
  assert.equal(load({ page: 't_mood.md', dnt: '1' }).sent.length, 0, 'DNT');
  assert.equal(load({ page: 't_mood.md', gpc: true }).sent.length, 0, 'GPC');
});

test('the auto-recorded page participates in dedup', () => {
  const { api, sent } = load({ page: 't_mood.md' });
  assert.equal(sent.length, 1, 'auto-record fired once on load');
  api.record('page:t_mood.md');
  assert.equal(sent.length, 1, 'a later manual record of the same key must not send again');
});
