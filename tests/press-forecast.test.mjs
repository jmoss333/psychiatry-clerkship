/* The pre-press forecast (faculty-console/press-forecast.mjs): the one line read before a
   many-page press. The server sends per-page facts from the sign-off check's own rule; this
   pins how they become words. Pinned here: what the press leaves waiting; "should pass" only
   when every page that matters was checked; each way the request would still be refused, with
   that way's fix; the #895 case (a page signed in the request that main changed since), which no
   tick can fix; and every unknown saying so. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { pressForecast, reviewRequestName } from '../faculty-console/press-forecast.mjs';

const PR = 'https://github.com/jmoss333/psychiatry-clerkship/pull/895';
const item = (slug, title, was, kind = 'page') => ({ slug, title, kind, was, pendingReason: '' });
const SIGN = [
  item('review.html', 'Daily Review', 'drifted', 'tool'),
  item('sp-interview.html', 'SP Interview', 'drifted', 'tool'),
  item('communication-practice.html', 'What Do You Say Next?', 'drifted', 'tool'),
];
const ALL = new Set(SIGN.map(entry => entry.slug));
const fact = (title, inRequest, okNow, resignOk) => ({ title, inRequest, okNow, resignOk });
// The queue just before the 01:38Z press: two signatures in #895 for text that had changed on
// the branch since; the third page drifted outside the request; another request page is fine.
const facts = (extra = {}) => ({
  'review.html': fact('Daily Review', true, false, true),
  'sp-interview.html': fact('SP Interview', true, false, true),
  'communication-practice.html': fact('What Do You Say Next?', false, false, true),
  'shelf-mode.html': fact('Shelf Mode', true, true, true),
  ...extra,
});
const forecastWith = (extra = {}, pages = facts()) => ({
  reviewRequest: true, baseBranch: 'main', behindBy: 0, signedInRequest: [], conflicts: [], pages, partial: false, ...extra,
});
const run = (overrides = {}) => pressForecast({ sign: SIGN, excluded: [], chosen: ALL, forecast: forecastWith(), pullRequestUrl: PR, ...overrides });

test('the #895 press: all three ticked -- nothing left, and the check should pass', () => {
  assert.deepEqual(run(), {
    request: 'pass',
    text: 'Signing 3 tools leaves nothing waiting for you. Review request #895 should then pass its sign-off check.',
  });
});

test('unticking a page signed in the request names it and the fix', () => {
  const result = run({ chosen: new Set(['sp-interview.html', 'communication-practice.html']) });
  assert.equal(result.request, 'refused');
  assert.equal(result.text, 'Signing 2 tools leaves 1 tool still waiting for you (1 unticked). Review request #895 would '
    + 'still be refused. Daily Review was signed in the request and has changed since: tick it to re-sign.');
});

test('unticking a page NOT signed in the request leaves it waiting but does not refuse the request', () => {
  const result = run({ chosen: new Set(['review.html', 'sp-interview.html']) });
  assert.equal(result.request, 'pass', '--strict is diff-scoped: drift outside the request only warns');
  assert.match(result.text, /^Signing 2 tools leaves 1 tool still waiting for you \(1 unticked\)\. Review request #895 should/);
});

test('THE #895 PATH: a page signed in the request that main has changed since is refused whatever is ticked', () => {
  const pages = facts({ 'question-bank-practice.html': fact('Question Bank', true, false, false) });
  for (const chosen of [ALL, new Set()]) {
    const result = run({ chosen, forecast: forecastWith({}, pages) });
    assert.equal(result.request, 'refused');
    assert.match(result.text, /Main has changed Question Bank since the request was made: on the request's GitHub page press "Update branch", then press Check again here\./);
  }
});

test('a page signed in the request that main changed, TICKED: re-signing the branch copy does not help', () => {
  const pages = facts({ 'review.html': fact('Daily Review', true, false, false) });
  const result = run({ forecast: forecastWith({}, pages) });
  assert.equal(result.request, 'refused');
  assert.match(result.text, /Main has changed Daily Review since the request was made/);
  assert.doesNotMatch(result.text, /tick it/, 'never two contradictory fixes for one page');
});

test('a ticked page main has a newer version of: untick it, or update first', () => {
  const pages = facts({ 'communication-practice.html': fact('What Do You Say Next?', false, false, false) });
  const result = run({ forecast: forecastWith({}, pages) });
  assert.equal(result.request, 'refused');
  assert.match(result.text, /Main has a newer version of What Do You Say Next\?, so signing it here would be refused: untick it, or update the branch first\./);
  const unticked = run({ chosen: new Set(['review.html', 'sp-interview.html']), forecast: forecastWith({}, pages) });
  assert.equal(unticked.request, 'pass', 'unticked, a page outside the request cannot refuse it');
});

test('a page signed in the request that this press cannot sign points to Left out', () => {
  const excluded = [{ ...item('review.html', 'Daily Review', 'drifted', 'tool'), reason: 'Its source file is not on the branch.' }];
  const sign = SIGN.filter(entry => entry.slug !== 'review.html');
  const result = run({ sign, excluded, chosen: new Set(sign.map(e => e.slug)) });
  assert.equal(result.request, 'refused');
  assert.match(result.text, /leaves 1 tool still waiting for you \(1 left out; see Left out\)/);
  assert.match(result.text, /Daily Review was signed in the request and has changed since, but cannot be signed on this press; see Left out\.$/);
});

test('main also changed a row the request signs: a merge conflict, not a pass', () => {
  const result = run({ forecast: forecastWith({ conflicts: ['shelf-mode.html'] }) });
  assert.equal(result.request, 'refused');
  assert.match(result.text, /Main has changed Shelf Mode since the request was made/);
});

test('a signature made before fingerprints is refused anywhere until re-signed', () => {
  const sign = [...SIGN, item('legacy.md', 'Legacy Page', 'unbound')];
  const pages = facts({ 'legacy.md': fact('Legacy Page', false, false, true) });
  const result = run({ sign, chosen: ALL, forecast: forecastWith({}, pages) });
  assert.equal(result.request, 'refused');
  assert.match(result.text, /Legacy Page was signed before fingerprints existed, and the check refuses that anywhere until it is re-signed: tick it\./);
  const ticked = run({ sign, chosen: new Set([...ALL, 'legacy.md']), forecast: forecastWith({}, pages) });
  assert.equal(ticked.request, 'pass');
});

test('the line never reads as passing when anything that matters was not checked', () => {
  const older = run({ forecast: undefined });
  assert.equal(older.request, 'unknown', 'an older server sends no forecast');
  assert.match(older.text, /Whether review request #895 will then pass its sign-off check could not be checked\.$/);
  assert.equal(run({ forecast: { reviewRequest: true, unknown: true } }).request, 'unknown');
  assert.match(run({ forecast: { reviewRequest: true, unknown: true, timedOut: true } }).text, /could not be checked in time\.$/);
  const unread = run({ chosen: new Set(['sp-interview.html', 'communication-practice.html']),
    forecast: forecastWith({}, facts({ 'review.html': fact('Daily Review', true, null, true) })) });
  assert.equal(unread.request, 'unknown', 'an unticked request page whose fingerprint could not be read');
  assert.match(unread.text, /could not be checked for Daily Review\.$/);
  const noResign = run({ forecast: forecastWith({}, facts({ 'review.html': fact('Daily Review', true, false, null) })) });
  assert.equal(noResign.request, 'unknown', 'a ticked page whose new signature could not be predicted');
  const missing = run({ forecast: forecastWith({}, { 'review.html': fact('Daily Review', true, false, true) }) });
  assert.equal(missing.request, 'unknown', 'a ticked page the server sent no facts for');
  const partial = run({ forecast: forecastWith({ partial: true }) });
  assert.equal(partial.request, 'unknown');
  assert.match(partial.text, /could not be checked fully\.$/);
  const refusedAndUnknown = run({ chosen: new Set(['communication-practice.html']),
    forecast: forecastWith({}, facts({ 'sp-interview.html': fact('SP Interview', true, null, true) })) });
  assert.equal(refusedAndUnknown.request, 'refused', 'a refusal it did find is still reported');
  assert.match(refusedAndUnknown.text, /SP Interview could not be checked\.$/);
});

test('a branch with no sign-offs of its own warns that the press will catch up first', () => {
  const result = run({ forecast: forecastWith({ catchesUp: true, behindBy: 4, pages: {} }) });
  assert.equal(result.request, 'unknown');
  assert.match(result.text, /no sign-offs of its own and is 4 changes behind main, so this press first brings it up to date .* which can include pages not listed here\.$/);
});

test('without a review request (ledger mode) it says only what the press leaves waiting', () => {
  assert.deepEqual(run({ forecast: { reviewRequest: false } }), { request: 'none', text: 'Signing 3 tools leaves nothing waiting for you.' });
  assert.equal(run({ chosen: new Set(), forecast: { reviewRequest: false } }), null);
});

test('nothing ticked: silent when all is well, but a request already refused is still said', () => {
  const quiet = pressForecast({ sign: SIGN, excluded: [], chosen: new Set(), forecast: forecastWith({}, facts({
    'review.html': fact('Daily Review', true, true, true), 'sp-interview.html': fact('SP Interview', true, true, true),
  })), pullRequestUrl: PR });
  assert.equal(quiet, null);
  const loud = pressForecast({ sign: SIGN, excluded: [], chosen: new Set(), forecast: forecastWith(), pullRequestUrl: PR });
  assert.equal(loud.request, 'refused');
  assert.match(loud.text, /^Nothing is ticked\. Review request #895 would still be refused\. Daily Review and SP Interview were signed in the request and have changed since: tick them to re-sign\.$/);
});

test('nouns follow each item\'s kind, and questions are counted', () => {
  const sign = [item('a.md', 'A', 'pending'), item('b.md', 'B', 'pending'), item('t.html', 'T', 'pending', 'tool')];
  const pages = { 'a.md': fact('A', false, true, true), 'b.md': fact('B', false, true, true), 't.html': fact('T', false, true, true) };
  const questions = { sign: [{ id: 'q1' }, { id: 'q2' }], excluded: [{ id: 'q3', reason: 'A warning.' }] };
  const result = pressForecast({ sign, excluded: [], chosen: new Set(['a.md', 't.html']), questions, forecast: forecastWith({}, pages), pullRequestUrl: PR });
  assert.match(result.text, /^Signing 1 page and 1 tool and attesting 2 questions leaves 1 page and 1 question still waiting for you \(1 unticked, 1 left out; see Left out\)\./);
  const onlyQuestions = pressForecast({ sign, excluded: [], chosen: new Set(), questions, forecast: forecastWith({}, pages), pullRequestUrl: PR });
  assert.match(onlyQuestions.text, /^Attesting 2 questions leaves 2 pages and 1 tool and 1 question still waiting for you/);
});

test('names are joined in plain English and shortened past three; the request is named from its URL', () => {
  const names = ['A', 'B', 'C', 'D', 'E'];
  const sign = names.map(n => item(`${n}.md`, n, 'drifted'));
  const make = count => Object.fromEntries(names.slice(0, count).map(n => [`${n}.md`, fact(n, true, false, true)]));
  const say = count => pressForecast({ sign, excluded: [], chosen: new Set(), forecast: forecastWith({}, make(count)), pullRequestUrl: PR }).text;
  assert.match(say(1), /A was signed in the request and has changed since: tick it to re-sign\./);
  assert.match(say(2), /A and B were signed in the request and have changed since: tick them to re-sign\./);
  assert.match(say(3), /A, B and C were signed/);
  assert.match(say(5), /A, B, C and 2 more were signed/);
  assert.equal(reviewRequestName(PR), 'review request #895');
  assert.equal(reviewRequestName(`${PR}/checks`), 'review request #895');
  assert.equal(reviewRequestName('https://github.com/o/r/pulls'), 'the review request');
  assert.equal(reviewRequestName(null), 'the review request');
  assert.match(pressForecast({ sign: SIGN, excluded: [], chosen: ALL, forecast: forecastWith() }).text, /The review request should then pass/);
});
