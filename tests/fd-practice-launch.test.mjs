import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const build = '../13_Faculty_Resources/_automation/site_build/';
const read = (file) => readFileSync(new URL(build + file, import.meta.url), 'utf8');
const shell = read('spa_index.html');
const start = shell.indexOf('  function fdPracticeLaunchSearch(');
const launch = shell.slice(start, shell.indexOf('\n  function fdOpenResourceLive(', start));
const fn = new Function(`${read('frontdoor/fd_state.js')}\n${launch}\nreturn fdPracticeLaunchSearch;`)();
const index = { weeks: [1, 2, 3].map((n) => ({ n, items: [
  { ref: 'practice.html', kind: 'tool' }, { ref: 'guide.md', kind: 'read' },
] })) };

test('practice launches pin the viewed week and retain the active block question limit', () => {
  const q = new URLSearchParams(fn('practice.html', '?tool=practice.html&block=1&n=2',
    { tab: 'path', openId: 'practice.html', week: 1, viewWeek: 2 }, index));
  assert.equal(q.get('practiceWeek'), '2');
  assert.equal(q.get('block'), '1');
  assert.equal(q.get('n'), '2');
});

test('Today uses the current week instead of a previously viewed Path week', () => {
  const q = new URLSearchParams(fn('practice.html', '?practiceWeek=3',
    { tab: 'today', fromTab: 'today', openId: 'practice.html', week: 1, viewWeek: 2 }, index));
  assert.equal(q.get('practiceWeek'), '1');
});

test('reading and unconfigured browsing do not inherit another tool practice week', () => {
  assert.equal(new URLSearchParams(fn('guide.md', '?practiceWeek=2&block=1',
    { tab: 'today', week: 1 }, index)).has('practiceWeek'), false);
  assert.equal(new URLSearchParams(fn('practice.html', '?practiceWeek=2',
    { tab: 'library' }, index)).has('practiceWeek'), false);
});
