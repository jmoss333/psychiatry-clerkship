import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_tool_pins.js', import.meta.url);
const key = 'cw_tool_pins_v1';
function make(storage) {
  const source = readFileSync(moduleUrl, 'utf8');
  const exports = `return {allowed:fdToolPinAllowed, sanitize:fdToolPinsSanitize,
    read:fdToolPinsRead, write:fdToolPinsWrite, toggle:fdToolPinsToggle,
    clear:fdToolPinsClear, select:fdToolPinsSelect};`;
  return new Function('localStorage', source + exports)(storage);
}
function store(seed = {}) {
  const values = new Map(Object.entries(seed));
  const operations = [];
  return {
    getItem(k) { return values.has(k) ? values.get(k) : null; },
    setItem(k, value) { operations.push(['set', k]); values.set(k, String(value)); },
    removeItem(k) { operations.push(['remove', k]); values.delete(k); },
    operations,
    dump: () => Object.fromEntries(values),
  };
}
function catalog() {
  const items = ['mse.html', 'capacity.html', 'withdrawal.html', 'oral.html', 'violence.html', 'reflection.html']
    .map(ref => ({ ref, kind: 'tool', title: ref }));
  const byRef = Object.fromEntries(items.map(item => [item.ref, item]));
  byRef['reading.md'] = { ref: 'reading.md', kind: 'read' };
  byRef['rights.html'] = { ref: 'rights.html', kind: 'tool', rights: true };
  byRef['search.html'] = { ref: 'search.html', kind: 'tool', searchOnly: true };
  byRef['reader.html'] = { ref: 'reader.html', kind: 'tool', readerOnly: true };
  byRef['unlisted.html'] = { ref: 'unlisted.html', kind: 'tool' };
  byRef['mismatch.html'] = { ref: 'mse.html', kind: 'tool' };
  const columns = [{ name: 'Tools', items: Object.values(byRef).filter(item => item.ref !== 'unlisted.html') }];
  return { byRef, columns, kit: [{ item: { ref: 'suicide.md', kind: 'read' } }] };
}

test('only own catalogued tool identities may be pinned; rights, utility and arbitrary text are rejected', () => {
  const F = make(store()), idx = catalog();
  Object.setPrototypeOf(idx.byRef, { 'inherited.html': { ref: 'inherited.html', kind: 'tool' } });
  idx.columns[0].items.push({ ref: 'inherited.html', kind: 'tool' });
  for (const ref of ['mse.html', 'capacity.html']) assert.equal(F.allowed(idx, ref), true);
  for (const ref of ['reading.md', 'rights.html', 'search.html', 'reader.html', 'unlisted.html', 'mismatch.html',
    'inherited.html', 'deleted.html', '__proto__', 'constructor', '../mse.html', 'mse.html?patient=123',
    'https://example.test/mse.html', 'clinical free text', null, 12, { toString: () => 'mse.html' }]) {
    assert.equal(F.allowed(idx, ref), false, String(ref));
  }
  assert.equal(F.allowed({}, 'mse.html'), false);
  assert.equal(F.allowed({ byRef: idx.byRef, columns: 'invalid' }, 'mse.html'), false);
});

test('sanitization deduplicates, caps valid pins at five, and leaves caller data intact', () => {
  const F = make(store()), idx = catalog();
  const input = Object.freeze(['missing.html', 'mse.html', 'mse.html', 'capacity.html', 'withdrawal.html',
    'oral.html', 'violence.html', 'reflection.html']);
  const before = JSON.stringify(idx);
  assert.deepEqual(F.sanitize(input, idx), ['mse.html', 'capacity.html', 'withdrawal.html', 'oral.html', 'violence.html']);
  assert.equal(input.length, 8);
  assert.equal(JSON.stringify(idx), before);
  const inherited = new Array(2);
  Object.setPrototypeOf(inherited, { 0: 'mse.html' });
  inherited[1] = 'oral.html';
  assert.deepEqual(F.sanitize(inherited, idx), ['oral.html']);
  for (const invalid of [null, {}, 'mse.html', { 0: 'mse.html', length: 1 }]) {
    assert.deepEqual(F.sanitize(invalid, idx), []);
  }
});

test('reads sanitize malformed or stale values without silently writing repairs', () => {
  const idx = catalog();
  for (const raw of ['not json', 'null', '{}', '"mse.html"', '["deleted.html","mse.html","mse.html",{"ref":"oral.html"}]']) {
    const storage = store({ [key]: raw, unrelated: 'keep' });
    const F = make(storage);
    assert.deepEqual(F.read(idx), raw.startsWith('["deleted') ? ['mse.html'] : []);
    assert.deepEqual(storage.dump(), { [key]: raw, unrelated: 'keep' });
    assert.deepEqual(storage.operations, []);
  }
  assert.deepEqual(make(store()).read(idx), []);
});

test('writes persist only bounded valid resource IDs and clearing leaves unrelated state untouched', () => {
  const storage = store({ cw_frontdoor_v1: '{"role":"learner"}', cw_progress_v1: '{"done":true}', unrelated: 'keep' });
  const F = make(storage), idx = catalog();
  assert.equal(F.write(['mse.html', { ref: 'oral.html', note: 'free text' }, 'mse.html', 'capacity.html', 'unknown'], idx), true);
  assert.equal(storage.getItem(key), '["mse.html","capacity.html"]');
  assert.equal(F.clear(), true);
  assert.deepEqual(storage.dump(), { cw_frontdoor_v1: '{"role":"learner"}', cw_progress_v1: '{"done":true}', unrelated: 'keep' });
});

test('toggling appends in pin order, rejects a sixth without eviction, and permits removal at the cap', () => {
  const storage = store(), F = make(storage), idx = catalog();
  for (const ref of ['mse.html', 'capacity.html', 'withdrawal.html', 'oral.html', 'violence.html']) {
    assert.equal(F.toggle(ref, idx).ok, true);
  }
  const before = storage.getItem(key), writes = storage.operations.length;
  assert.deepEqual(F.toggle('reflection.html', idx), {
    ok: false, pins: ['mse.html', 'capacity.html', 'withdrawal.html', 'oral.html', 'violence.html'], reason: 'limit',
  });
  assert.equal(storage.getItem(key), before);
  assert.equal(storage.operations.length, writes);
  assert.deepEqual(F.toggle('withdrawal.html', idx), {
    ok: true, pins: ['mse.html', 'capacity.html', 'oral.html', 'violence.html'], reason: null,
  });
  assert.deepEqual(F.toggle('reflection.html', idx).pins, ['mse.html', 'capacity.html', 'oral.html', 'violence.html', 'reflection.html']);
});

test('invalid toggles do not write, and removing the final pin removes its store', () => {
  const storage = store({ [key]: '["mse.html"]' }), F = make(storage), idx = catalog();
  assert.deepEqual(F.toggle('rights.html', idx), { ok: false, pins: ['mse.html'], reason: 'invalid' });
  assert.deepEqual(storage.operations, []);
  assert.deepEqual(F.toggle('mse.html', idx), { ok: true, pins: [], reason: null });
  assert.equal(storage.getItem(key), null);
});

test('unavailable storage never throws or reports a successful pin', () => {
  const idx = catalog();
  let writes = 0;
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { writes++; }, removeItem() { writes++; } };
  for (const F of [make(blocked), make()]) {
    assert.deepEqual(F.read(idx), []);
    assert.deepEqual(F.toggle('mse.html', idx), { ok: false, pins: [], reason: 'unavailable' });
  }
  assert.equal(writes, 0, 'a failed read must not overwrite an unseen store');
  assert.equal(make().write(['mse.html'], idx), false);
  assert.equal(make().clear(), false);
});

test('failed writes and removals retain the actual prior pin state', () => {
  const idx = catalog();
  const blocked = {
    getItem: () => '["mse.html"]',
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('blocked'); },
  };
  const F = make(blocked);
  assert.deepEqual(F.toggle('oral.html', idx), { ok: false, pins: ['mse.html'], reason: 'unavailable' });
  assert.deepEqual(F.toggle('mse.html', idx), { ok: false, pins: ['mse.html'], reason: 'unavailable' });
  assert.equal(F.write(['oral.html'], idx), false);
  assert.equal(F.clear(), false);
});

test('selection puts pins before unchanged fallback order, returns canonical objects and leaves Safety kit untouched', () => {
  const idx = catalog(), F = make(store());
  const fallback = ['mse.html', 'capacity.html', 'withdrawal.html', 'violence.html', 'reflection.html'].map(ref => idx.byRef[ref]);
  const before = JSON.stringify(idx), input = ['oral.html', 'mse.html', 'rights.html', 'deleted.html'];
  const selected = F.select(idx, input, fallback);
  assert.deepEqual(selected.map(item => item.ref), ['oral.html', 'mse.html', 'capacity.html', 'withdrawal.html', 'violence.html']);
  assert.equal(selected[0], idx.byRef['oral.html']);
  assert.deepEqual(F.select(idx, [], fallback), fallback);
  assert.equal(JSON.stringify(idx), before);
  assert.deepEqual(input, ['oral.html', 'mse.html', 'rights.html', 'deleted.html']);
});

test('selection rejects forged or foreign fallbacks but retains audience-valid week tools outside columns', () => {
  const idx = catalog(), F = make(store());
  const selected = F.select(idx, ['unlisted.html'], [
    { ref: 'mse.html', title: '<script>forged</script>' }, { ref: 'unlisted.html' },
    { ref: 'foreign.html' }, { ref: 'rights.html' }, { ref: 'search.html' }, null,
  ]);
  assert.deepEqual(selected.map(item => item.ref), ['mse.html', 'unlisted.html']);
  assert.equal(selected[0], idx.byRef['mse.html']);
  assert.equal(selected[0].title, 'mse.html');
});

test('real audience projections keep resident-only and student-only tools on their own site', () => {
  const root = new URL('../', import.meta.url);
  const projected = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json,sys
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
from frontdoor_catalog import build_frontdoor_payload
from shipped_pages import load_shipped_pages
cur=json.load(open('curriculum.json')); shipped=load_shipped_pages('.')
out={}
for site,audience in [('ms3','ms3'),('res','resident')]:
    nav=[{'section':'Resources','items':[{'f':p['slug'],'t':p['title'],
      'k':'tool' if p['kind']=='tool' else 'md',
      'governance':{'status':'pending','riskKind':'general','riskLevel':'low'}}
      for p in shipped['pages'] if site in p['sites']]}]
    out[site]=build_frontdoor_payload(audience,cur,nav,'0'*40,shipped=shipped)
print(json.dumps(out))
`], { cwd: root, encoding: 'utf8' }));
  const dataSource = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js', import.meta.url), 'utf8');
  const build = new Function(dataSource + '\nreturn fdBuildIndex;')();
  const meta = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));
  const tools = JSON.parse(readFileSync(new URL('../tool_registry.json', import.meta.url), 'utf8'));
  const seed = '["rp-post-event-huddle.html","prepare-for-tomorrow.html","mse.html","cssrs.html"]';
  for (const [site, want] of [['ms3', ['prepare-for-tomorrow.html', 'mse.html']], ['res', ['rp-post-event-huddle.html', 'mse.html']]]) {
    const payload = projected[site], idx = build(payload.curriculum, meta, tools, payload.manifest);
    const storage = store({ [key]: seed }), F = make(storage);
    assert.deepEqual(F.read(idx), want, site);
    assert.equal(F.allowed(idx, 'cssrs.html'), false, 'a rights reference is never a pinnable tool');
    assert.equal(storage.getItem(key), seed, 'projection does not rewrite another audience\'s stored IDs during reads');
  }
});
