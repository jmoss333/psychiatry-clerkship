import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, blobKey, increment } from '../netlify/functions/_shared/counters.mjs';

test('isoWeek formats an ISO week-numbering date', () => {
  assert.equal(isoWeek(new Date('2026-09-04T12:00:00Z')), '2026-W36');
  // 2027-01-01 is a Friday and belongs to ISO week 53 of 2026.
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
  // 2026-01-01 is a Thursday, so it is week 1 of 2026.
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01');
});

test('blobKey is stable and contains no separator ambiguity', () => {
  assert.equal(blobKey('ms3', '2026-W36', 'tool:interview-room:step2'),
    'ms3/2026-W36/tool%3Ainterview-room%3Astep2');
});

test('increment creates a counter at 1 then advances it', async () => {
  const data = new Map();
  const store = {
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
  const at = { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md' };
  assert.equal(await increment(store, at), 1);
  assert.equal(await increment(store, at), 2);
  const stored = JSON.parse(data.get(blobKey(at.site, at.week, at.key)));
  assert.deepEqual(stored, { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md', n: 2 });
});

test('increment stores no field beyond the four in the schema', async () => {
  const data = new Map();
  const store = {
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
  await increment(store, { site: 'res', week: '2026-W36', key: 'page:x.md' });
  const stored = JSON.parse([...data.values()][0]);
  assert.deepEqual(Object.keys(stored).sort(), ['key', 'n', 'site', 'week']);
});
