import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('stale opt-ins and saved IDs cannot make an unpublished question servable', () => {
  const source = readFileSync(new URL(
    '../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url,
  ), 'utf8');
  const start = source.indexOf('/* ---- qb servability (shell parity) ----');
  const end = source.indexOf('/* ---- end qb servability ----', start);
  assert.ok(start >= 0 && end > start);
  const servable = new Function('localStorage', `${source.slice(start, end)}
    RELEASED_QB_IDS = ['qb_anx_001']; return qbRecordServable;`)({ getItem: () => 'true' });
  assert.equal(servable('qb_anx_001'), true);
  for (const id of ['qb_anx_002', 'qb_deleted_999', '__proto__']) {
    assert.equal(servable(id), false, `${id} is absent from this release`);
  }
});
