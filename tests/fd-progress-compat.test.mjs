// Compatibility contract for the shared cw_progress_v1 object. The retained shell reads
// entry.done, so Front Door may project booleans for rendering but must write legacy entries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_today.js')}
  return {
    fdProgressDoneMap: fdProgressDoneMap,
    fdProgressToggle: fdProgressToggle,
    fdTodayProgress: fdTodayProgress,
  };
`);
const F = make();
const now = new Date(2026, 7, 12, 9, 0, 0).getTime();

const legacy = {
  'mse.md': { done: true, at: '2026-08-10' },
  'sleep.md': { done: false, at: '2026-08-10' },
};

test('projects legacy progress entries into the boolean map renderers need', () => {
  assert.deepEqual(F.fdProgressDoneMap(legacy), { 'mse.md': true, 'sleep.md': false });
});

test('checking writes the legacy object entry with a local-day timestamp', () => {
  assert.deepEqual(F.fdProgressToggle(legacy, 'sleep.md', true, now), {
    'mse.md': { done: true, at: '2026-08-10' },
    'sleep.md': { done: true, at: '2026-08-12' },
  });
  assert.equal(legacy['sleep.md'].done, false, 'toggle must not mutate the loaded object');
});

test('unchecking removes the legacy entry instead of writing a false-shaped replacement', () => {
  assert.equal(F.fdProgressToggle(legacy, 'mse.md', false, now)['mse.md'], undefined);
});

test('a Front Door write remains readable by the retained entry.done contract', () => {
  const written = F.fdProgressToggle({}, 'mse.md', true, now);
  assert.equal(written['mse.md'].done, true);
  assert.equal(written['mse.md'].at, '2026-08-12');
});

test('an explicit legacy false entry is not counted as complete', () => {
  assert.deepEqual(F.fdTodayProgress([{ ref: 'sleep.md' }], legacy), {
    done: 0, total: 1, pct: 0, next: { ref: 'sleep.md' },
  });
});
