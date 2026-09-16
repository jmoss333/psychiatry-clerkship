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
  fdCapsuleLeft: fdCapsuleLeft,
  fdLastReadRow: fdLastReadRow,
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

// ---- One Thing First: primary variants of the device-store rows (handoff 2026-09-16) -------

const DUE_ONE = { daily: { due: 1 }, qb: { due: 0 }, fam: { due: 0 }, other: { due: 0 } };
const CAPSULE = { queueIds: ['a', 'b', 'c'], idx: 1 };

test('fdCapsuleLeft owns the capsule shape rule once: questions left, or 0 for anything malformed', () => {
  for (const invalid of [null, undefined, {}, { queueIds: 'bad', idx: 0 }, { queueIds: [], idx: 0 },
    { queueIds: ['a'], idx: -1 }, { queueIds: ['a'], idx: 2 }, { queueIds: ['a'], idx: '0' },
    { queueIds: ['a', 'b'], idx: 0.5 }]) {
    assert.equal(F.fdCapsuleLeft(invalid), 0, JSON.stringify(invalid));
  }
  assert.equal(F.fdCapsuleLeft(CAPSULE), 2);
  assert.equal(F.fdCapsuleLeft({ queueIds: ['a'], idx: 1 }), 0, 'a finished session has nothing to resume');
});

test('fdDueRow(b, true) is the primary: is-primary plus the kicker; false or undefined is today\'s markup', () => {
  const plain = F.fdDueRow(DUE_ONE);
  assert.equal(F.fdDueRow(DUE_ONE, false), plain);
  assert.equal(F.fdDueRow(DUE_ONE, undefined), plain);
  assert.doesNotMatch(plain, /is-primary|fd-due__kicker/);
  const primary = F.fdDueRow(DUE_ONE, true);
  assert.match(primary, /^<button type="button" class="fd-due is-primary" data-fd-open="review\.html"><span class="fd-due__kicker">Clear what’s due<\/span><span class="fd-due__label">1 review due<\/span>/);
  assert.equal(primary.replace(' is-primary', '').replace('<span class="fd-due__kicker">Clear what’s due</span>', ''), plain);
  assert.equal(F.fdDueRow({ daily: { due: 0 } }, true), '', 'nothing due renders nothing, primary or not');
});

test('fdResumeCard(c, true) is the primary: is-primary and the "Pick up" heading; the route is untouched', () => {
  const plain = F.fdResumeCard(CAPSULE);
  assert.equal(F.fdResumeCard(CAPSULE, false), plain);
  assert.match(plain, /<section class="fd-resume"><h2 class="fd-sectionhead">Continue where you left off<\/h2>/);
  const primary = F.fdResumeCard(CAPSULE, true);
  assert.match(primary, /^<section class="fd-resume is-primary"><h2 class="fd-sectionhead">Pick up where you left off<\/h2>/);
  assert.match(primary, /href="\?tool=question-bank-practice\.html&amp;resume=1"/);
  assert.match(primary, /2 left, ~2 min/);
  assert.equal(F.fdResumeCard({ queueIds: ['a'], idx: 1 }, true), '');
});

test('fdLastReadRow renders "You were reading" for an undone week read, escapes the title, never for a tool', () => {
  const read = { ref: 'a&b.md', kind: 'read', title: '<Page> & Co', minutes: 6, done: false, isContinueTarget: false };
  const plain = F.fdLastReadRow(read);
  assert.match(plain, /^<button type="button" class="fd-lastread" data-fd-open="a&amp;b\.md">/);
  assert.match(plain, /<span class="fd-lastread__title">You were reading: &lt;Page&gt; &amp; Co — 6 min<\/span>/);
  assert.match(plain, /<span class="fd-lastread__action">Open →<\/span><\/button>$/);
  assert.doesNotMatch(plain, /<Page>|fd-lastread__kicker|is-primary/);
  assert.equal(F.fdLastReadRow(read, false), plain);

  const primary = F.fdLastReadRow(read, true);
  assert.match(primary, /^<button type="button" class="fd-lastread is-primary" data-fd-open="a&amp;b\.md"><span class="fd-lastread__kicker">Pick up where you left off<\/span><span class="fd-lastread__title">You were reading: /);

  assert.equal(F.fdLastReadRow(Object.assign({}, read, { kind: 'tool' }), true), '', 'a tool is not reading');
  assert.equal(F.fdLastReadRow(null, true), '');
  assert.equal(F.fdLastReadRow({ ref: '', kind: 'read' }), '');
  assert.match(F.fdLastReadRow({ ref: 'x.md', kind: 'read', title: 'X', minutes: null }), /You were reading: X<\/span>/,
    'no minutes, no dash');
});

test('the primary variants are audience-neutral', () => {
  const all = F.fdDueRow(DUE_ONE, true) + F.fdResumeCard(CAPSULE, true)
    + F.fdLastReadRow({ ref: 'x.md', kind: 'read', title: 'X', minutes: 3 }, true);
  assert.doesNotMatch(all, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});
