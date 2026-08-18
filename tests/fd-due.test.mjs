import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const data = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');
const due = readFileSync(new URL(`${BUILD}/frontdoor/fd_due.js`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`${data}\n${due}\nreturn {
  fdDueRow: fdDueRow,
  fdResumeCard: fdResumeCard,
  fdCaptureTriage: fdCaptureTriage,
};`);

const F = make();

test('due row is omitted at zero and uses exact singular/plural labels', () => {
  assert.equal(F.fdDueRow({
    daily: { due: 0 }, qb: { due: 0 }, fam: { due: 0 }, other: { due: 0 },
  }), '');

  const one = F.fdDueRow({
    daily: { due: 1 }, qb: { due: 0 }, fam: { due: 0 }, other: { due: 0 },
  });
  assert.match(one, />1 review due</);
  assert.doesNotMatch(one, /1 reviews/);

  const many = F.fdDueRow({
    daily: { due: 2 }, qb: { due: 3 }, fam: { due: 1 }, other: { due: 0 },
  });
  assert.match(many, />6 reviews due</);
  assert.match(many, /2 daily/);
  assert.match(many, /3 practice/);
  assert.match(many, /1 family/);
  assert.match(many, /data-fd-open="review\.html"/);
});

test('resume card renders only a valid capsule and retains the exact resume route', () => {
  for (const invalid of [null, {}, { queueIds: 'bad', idx: 0 }, { queueIds: [], idx: '0' },
    { queueIds: ['a'], idx: -1 }, { queueIds: ['a'], idx: 2 }]) {
    assert.equal(F.fdResumeCard(invalid), '');
  }

  const out = F.fdResumeCard({ queueIds: ['a', 'b', 'c'], idx: 1 });
  assert.match(out, /href="\?tool=question-bank-practice\.html&amp;resume=1"/);
  assert.match(out, /2 left/);
  assert.match(out, /~2 min/);
  assert.doesNotMatch(out, /data-fd-open/,
    'the route-aware retained link must not be reduced to an action that drops resume=1');
});

test('capture triage is omitted when empty and keeps the approved no-PHI warning byte-for-byte', () => {
  assert.equal(F.fdCaptureTriage([]), '');
  const out = F.fdCaptureTriage([{ id: 'c1', text: 'Why this choice?', match: null }]);
  assert.match(out, /Questions you captured on the unit\. Open the matching page, schedule one for review, or copy the list to raise in supervision\. Stays on this device — no patient details\./);
  assert.match(out, /data-cap-drop="c1"/);
  assert.match(out, /data-cap-copy="1"/);
});

test('capture triage escapes every interpolated value and exposes only valid matched actions', () => {
  const out = F.fdCaptureTriage([{
    id: 'c&quot;<id>',
    text: '<img src=x onerror=alert(1)>',
    match: { ref: 'topic&quot;<.md', title: '<b>Unsafe</b>', hasQuiz: true },
  }]);
  assert.doesNotMatch(out, /<img\b|<b>Unsafe/);
  assert.match(out, /&lt;img/);
  assert.match(out, /&lt;b&gt;Unsafe&lt;\/b&gt;/);
  assert.match(out, /data-cap-open="c&amp;quot;&lt;id&gt;"/);
  assert.match(out, /data-cap-review="c&amp;quot;&lt;id&gt;"/);
  assert.match(out, /data-cap-ref="topic&amp;quot;&lt;\.md"/);

  const noQuiz = F.fdCaptureTriage([{
    id: 'c2', text: 'Question', match: { ref: 'plain.md', title: 'Plain', hasQuiz: false },
  }]);
  assert.match(noQuiz, /data-cap-open="c2"/);
  assert.doesNotMatch(noQuiz, /data-cap-review=/);
});

test('fd_due stays ES5, audience-neutral, and does not introduce storage', () => {
  assert.doesNotMatch(due, /\b(?:const|let)\s|=>|`/);
  assert.doesNotMatch(due, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
  assert.doesNotMatch(due, /localStorage/);
});
