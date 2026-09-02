// Contract for the shared session receipt (session_receipt.js): the three moves every tool's end
// screen now makes — name what to re-read, offer one next action, mark the Today item done —
// plus timed-block advancement when the block store is present. Evaluated with an in-memory
// localStorage and no document (the snippet must render without one).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const receiptSrc = read('session_receipt.js');
const storeSrc = read('block_store.js');

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}
// eslint-disable-next-line no-new-func
const withStore = (ls) => new Function('localStorage', `${storeSrc}\n${receiptSrc}\nreturn {cwReceipt, blockLoad, blockSave};`)(ls);
// eslint-disable-next-line no-new-func
const withoutStore = (ls) => new Function('localStorage', `${receiptSrc}\nreturn {cwReceipt};`)(ls);

const NOW = new Date(2026, 8, 2, 14, 30, 0).getTime();
const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;
const base = () => ({
  tool: 'qbank', ref: 'question-bank-practice.html', refTitle: 'Practice Questions', blockKind: 'qb', nowMs: NOW,
  context: '10 questions', headline: '7 of 10 — and two you were sure about.', sub: 'The score matters less.',
  stats: [{ label: 'Correct', value: '7 / 10' }, { label: 'Certain & wrong', value: '2', tone: 'warn' }],
  reread: [{ tag: 'Certain · wrong', warn: true, title: 'Antidepressant in unscreened hypomania', note: 'Trap: anchoring', ref: 't_mood.md', refTitle: 'Mood' }],
  actions: [{ id: 'practiceMoreBtn', label: 'Practice more', primary: true }], homeId: 'goHomeBtn',
});

test('the receipt renders headline, stats, re-reads, and the two actions without a document', () => {
  const ls = memStorage(); const F = withoutStore(ls);
  const r = F.cwReceipt(base());
  assert.match(r.html, /<section class="cw-receipt" aria-label="Session receipt">/);
  assert.match(r.html, /7 of 10 — and two you were sure about\./);
  assert.match(r.html, /cw-receipt__stat is-warn/);
  assert.match(r.html, /Worth a second look/);
  assert.match(r.html, /data-cw-receipt-search="\?page=t_mood\.md"/);
  assert.match(r.html, /Re-read: Mood →/);
  assert.match(r.html, /id="practiceMoreBtn"/);
  assert.match(r.html, /data-cw-receipt-home id="goHomeBtn">Back to Today</);
  assert.doesNotMatch(r.html, AUDIENCE_TOKEN_RE);
});

test('a ref marks the Today item done once, in the legacy {done,at} shape, and says so once', () => {
  const ls = memStorage(); const F = withoutStore(ls);
  const first = F.cwReceipt(base());
  assert.equal(first.marked, true);
  assert.deepEqual(JSON.parse(ls.getItem('cw_progress_v1')), { 'question-bank-practice.html': { done: true, at: '2026-09-02' } });
  assert.match(first.html, /Marked done on Today:<\/b> Practice Questions\./);
  const second = F.cwReceipt(base());
  assert.equal(second.marked, false, 'already done: no second write, no second announcement');
  assert.doesNotMatch(second.html, /Marked done on Today/);
});

test('no ref means no progress write (Daily Review and exam sets are not week items)', () => {
  const ls = memStorage(); const F = withoutStore(ls);
  const r = F.cwReceipt(Object.assign(base(), { ref: null }));
  assert.equal(r.marked, false);
  assert.equal(ls.getItem('cw_progress_v1'), null);
});

test('an existing progress map is preserved, not replaced', () => {
  const ls = memStorage({ cw_progress_v1: JSON.stringify({ 'a.md': { done: true, at: '2026-08-30' } }) });
  withoutStore(ls).cwReceipt(base());
  const p = JSON.parse(ls.getItem('cw_progress_v1'));
  assert.equal(p['a.md'].at, '2026-08-30');
  assert.equal(p['question-bank-practice.html'].done, true);
});

test('with a live block the receipt marks its step and offers the next one instead of the tool action', () => {
  const ls = memStorage(); const F = withStore(ls);
  F.blockSave({ v: 1, minutes: 10, createdAt: NOW - 60000, steps: [
    { kind: 'qb', ref: 'question-bank-practice.html', n: 4, min: 3, title: '4 practice questions' },
    { kind: 'page', ref: 't_psychosis.md', min: 5, title: 'Psychosis' },
    { kind: 'review', ref: 'review.html', n: 3, min: 2, title: '3 reviews that are due' },
  ] });
  const r = F.cwReceipt(base());
  assert.equal(F.blockLoad(NOW).steps[0].done, true, 'the qb step is marked');
  assert.equal(r.next.kind, 'page');
  assert.match(r.html, /Next in your block: Psychosis<small>~5 min<\/small>/);
  assert.match(r.html, /data-cw-receipt-ref="t_psychosis\.md" data-cw-receipt-search="\?page=t_psychosis\.md"/);
  assert.match(r.html, /Block · 1 of 3 done/);
  assert.doesNotMatch(r.html, /id="practiceMoreBtn"/, 'one next action, not two');
});

test('a page step already ticked in progress counts as done for the block', () => {
  const ls = memStorage({ cw_progress_v1: JSON.stringify({ 't_psychosis.md': { done: true, at: '2026-09-02' } }) });
  const F = withStore(ls);
  F.blockSave({ v: 1, minutes: 10, createdAt: NOW - 60000, steps: [
    { kind: 'review', ref: 'review.html', n: 3, min: 2, title: '3 reviews that are due' },
    { kind: 'page', ref: 't_psychosis.md', min: 5, title: 'Psychosis' },
    { kind: 'qb', ref: 'question-bank-practice.html', n: 4, min: 3, title: '4 practice questions' },
  ] });
  const r = F.cwReceipt(Object.assign(base(), { ref: null, blockKind: 'review' }));
  assert.equal(r.next.kind, 'qb');
  assert.match(r.html, /Block · 2 of 3 done/);
  assert.match(r.html, /data-cw-receipt-search="\?tool=question-bank-practice\.html&amp;block=1&amp;n=4"/);
});

test('finishing the last step reports the block complete, clears it, and falls back to the tool action', () => {
  const ls = memStorage(); const F = withStore(ls);
  F.blockSave({ v: 1, minutes: 5, createdAt: NOW - 60000, steps: [
    { kind: 'qb', ref: 'question-bank-practice.html', n: 4, min: 3, title: '4 practice questions' },
  ] });
  const r = F.cwReceipt(base());
  assert.equal(r.next, null);
  assert.match(r.html, /Block complete · 1 of 1 done/);
  assert.match(r.html, /id="practiceMoreBtn"/);
  assert.equal(ls.getItem('cw_block_v1'), null, 'a finished block does not linger');
});

test('every interpolated string is escaped', () => {
  const ls = memStorage(); const F = withoutStore(ls);
  const r = F.cwReceipt(Object.assign(base(), { headline: '<img>&', reread: [{ tag: '<t>', title: '<u>', note: '&', ref: 'x.md', refTitle: '<r>' }] }));
  assert.doesNotMatch(r.html, /<img>|<u>|<t>|<r>/);
  assert.match(r.html, /&lt;img&gt;&amp;/);
});

test('the snippet only ever touches cw_-namespaced keys', () => {
  const keys = [...receiptSrc.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(keys.length > 0);
  for (const k of keys) assert.match(k, /^cw_/);
});
