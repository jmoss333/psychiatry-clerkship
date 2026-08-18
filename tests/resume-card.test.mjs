// Migrated resume contract: the session capsule remains canonical, while the standalone pure
// Front Door row owns validation, N/M math, and the exact route-aware resume link.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = '../13_Faculty_Resources/_automation/site_build';
const shell = readFileSync(new URL(`${base}/spa_index.html`, import.meta.url), 'utf8');
const data = readFileSync(new URL(`${base}/frontdoor/fd_data.js`, import.meta.url), 'utf8');
const due = readFileSync(new URL(`${base}/frontdoor/fd_due.js`, import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
const { fdResumeCard } = new Function(`${data}\n${due}\nreturn {fdResumeCard:fdResumeCard};`)();

test('the canonical capsule snippet remains the only session-store implementation', () => {
  assert.equal(shell.split('/*__SESS_CAPSULE__*/').length - 1, 1);
  assert.doesNotMatch(shell, /function\s+sessLoad\s*\(|(['"])cw_sess_v1\1/);
});

test('only a live, well-shaped capsule renders', () => {
  for (const value of [null, {}, { queueIds: 'x', idx: 0 }, { queueIds: [], idx: 0 },
    { queueIds: ['a'], idx: -1 }, { queueIds: ['a'], idx: 2 },
    { queueIds: ['a'], idx: '0' }]) assert.equal(fdResumeCard(value), '');
});

test('resume math and exact query survive the Front Door route adapter', () => {
  assert.match(fdResumeCard({ queueIds: Array(10).fill('x'), idx: 3 }),
    /7 left, ~5 min/);
  assert.match(fdResumeCard({ queueIds: Array(4).fill('x'), idx: 3 }),
    /1 left, ~1 min/);
  const out = fdResumeCard({ queueIds: Array(8).fill('x'), idx: 0 });
  assert.match(out, /8 left, ~6 min/);
  assert.match(out, /href="\?tool=question-bank-practice\.html&amp;resume=1"/);
  assert.doesNotMatch(out, /data-fd-open/,
    'a generic open action would discard resume=1');
});

test('Today composes the capsule row and delegated links forward the exact query', () => {
  assert.match(shell, /fdResumeCard\(sess\)/);
  assert.match(shell, /fdOpenRef\(ref,url\.search\)/);
});
