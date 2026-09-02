// Contract for the timed-block planner and card (frontdoor/fd_block.js). Pure: state, nowMs and
// the store inputs are passed in. Concatenated in the page's injection order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const blockSrc = read('frontdoor/fd_block.js');

// eslint-disable-next-line no-new-func
const F = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_due.js')}
  ${blockSrc}
  return { fdBlockPlan, fdBlockCard, fdBlockRouteForStep, fdBlockStatus, fdBlockBudget, fdBuildIndex, fdItemsForWeek };
`)();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

const CUR = { weeks: [
  { n: 1, title: 'Foundations', theme: 't', items: [
    { ref: 'a.md', kind: 'read' }, { ref: 'b.md', kind: 'read' }, { ref: 'c.md', kind: 'read' },
    { ref: 'question-bank-practice.html', kind: 'tool' },
  ] },
], libraryColumns: [], libraryExclude: [], safetyKit: [], roles: { ms3: [], resident: [] }, synonyms: {} };
const META = { 'a.md': { read: 5 }, 'b.md': { read: 3 }, 'c.md': { read: 12 } };
const TOOLS = { tools: [{ file: 'question-bank-practice.html', title: 'Practice Questions', category: 'practice', riskLevel: 'low' }] };
const MAN = { md: [['s/a.md', 'a.md', 'Alpha'], ['s/b.md', 'b.md', 'Beta'], ['s/c.md', 'c.md', 'Gamma']],
  tools: [['s/q.html', 'question-bank-practice.html', 'Practice Questions']] };
const IDX = F.fdBuildIndex(CUR, META, TOOLS, MAN);
const NOW = new Date(2026, 8, 2, 9, 0, 0).getTime();
const state = (over) => Object.assign({ week: 1, done: {}, nowMs: NOW }, over);
const due = (n) => ({ daily: { due: n }, qb: { due: 0 }, fam: { due: 0 }, other: { due: 0 } });
const WEAK = { c: 'mood', label: 'Mood', score: 55 };

test('the budget snaps to the three offered windows and defaults to ten', () => {
  assert.equal(F.fdBlockBudget(5), 5);
  assert.equal(F.fdBlockBudget('20'), 20);
  assert.equal(F.fdBlockBudget(7), 10);
  assert.equal(F.fdBlockBudget(undefined), 10);
});

test('a ten-minute block is reviews, then the next unread page that fits, then questions', () => {
  const plan = F.fdBlockPlan(IDX, state(), 10, { due: due(8), weakest: WEAK });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['review', 'page', 'qb']);
  assert.equal(plan.steps[0].n, 4, 'two minutes of reviews at thirty seconds each');
  assert.equal(plan.steps[0].min, 2);
  assert.equal(plan.steps[1].ref, 'a.md', 'first unread page in week order');
  assert.equal(plan.steps[1].title, 'Alpha');
  assert.equal(plan.steps[2].cat, 'mood');
  assert.match(plan.steps[2].title, /practice questions on Mood, your weakest area/);
  assert.ok(plan.total <= 10, `total ${plan.total} must fit the window`);
});

test('only Daily Review\'s own bucket makes a review step — question and family dues belong to their tools', () => {
  const plan = F.fdBlockPlan(IDX, state(), 10, { due: { daily: { due: 0 }, qb: { due: 6 }, fam: { due: 2 }, other: { due: 1 } }, weakest: null });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['page', 'qb'],
    'review.html cannot serve QB#/FAM# cards, so they must not be promised as a review step');
  const mixed = F.fdBlockPlan(IDX, state(), 10, { due: { daily: { due: 3 }, qb: { due: 6 }, fam: { due: 2 }, other: { due: 0 } }, weakest: null });
  assert.equal(mixed.steps[0].n, 3, 'the review step counts daily dues only');
});

test('no dues means no review step; no weak area means unfiltered questions', () => {
  const plan = F.fdBlockPlan(IDX, state(), 10, { due: due(0), weakest: null });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['page', 'qb']);
  assert.equal(plan.steps[1].cat, null);
  assert.match(plan.steps[1].title, /^\d+ practice questions$/);
});

test('done pages are skipped; a page too long for the window gives way to a shorter one', () => {
  const plan = F.fdBlockPlan(IDX, state({ done: { 'a.md': true } }), 5, { due: due(3), weakest: null });
  // 5 min: reviews 3 → 2 min; remaining 3 → b.md (3 min) fits, c.md (12) does not.
  assert.equal(plan.steps[0].n, 3);
  assert.equal(plan.steps[1].ref, 'b.md');
  assert.equal(plan.steps.length, 2, 'no room left for questions');
});

test('a page that would run the window over is never admitted, even as the shortest', () => {
  // 5 min, 4 reviews due → 2 min; 3 left. Unread pages are 5 and 12 minutes: neither fits, so
  // the block goes straight to questions and stays inside its promise.
  const plan = F.fdBlockPlan(IDX, state({ done: { 'b.md': true } }), 5, { due: due(4), weakest: null });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['review', 'qb']);
  assert.ok(plan.total <= 5, `total ${plan.total}`);
});

test('a twenty-minute block spends four minutes on reviews and caps questions at ten', () => {
  const plan = F.fdBlockPlan(IDX, state(), 20, { due: due(30), weakest: WEAK });
  assert.equal(plan.steps[0].n, 8);
  assert.equal(plan.steps[0].min, 4);
  assert.ok(plan.steps[2].n <= 10);
  assert.ok(plan.total <= 20);
});

test('with nothing due and every page read, the plan is questions alone or empty', () => {
  const plan = F.fdBlockPlan(IDX, state({ done: { 'a.md': true, 'b.md': true, 'c.md': true } }), 5, { due: due(0), weakest: null });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['qb']);
  const none = F.fdBlockPlan(IDX, state({ week: 99 }), 5, { due: due(0), weakest: null });
  assert.deepEqual(none.steps.map((s) => s.kind), ['qb'], 'no week still offers a question set');
});

test('step routes carry the block flag and the bounded size the tools read', () => {
  assert.equal(F.fdBlockRouteForStep({ kind: 'review', n: 3 }), '?tool=review.html&block=1&limit=3');
  assert.equal(F.fdBlockRouteForStep({ kind: 'qb', n: 4, cat: 'mood' }), '?tool=question-bank-practice.html&block=1&n=4&cat=mood');
  assert.equal(F.fdBlockRouteForStep({ kind: 'qb', n: 4, cat: null }), '?tool=question-bank-practice.html&block=1&n=4');
  assert.equal(F.fdBlockRouteForStep({ kind: 'page', ref: 't_mood.md' }), '?page=t_mood.md');
});

test('block status derives page completion from the progress map, other steps from the store', () => {
  const b = { steps: [{ kind: 'review', done: true }, { kind: 'page', ref: 'a.md' }, { kind: 'qb' }] };
  const s1 = F.fdBlockStatus(b, {});
  assert.equal(s1.done, 1); assert.equal(s1.next.kind, 'page');
  const s2 = F.fdBlockStatus(b, { 'a.md': true });
  assert.equal(s2.done, 2); assert.equal(s2.next.kind, 'qb'); assert.equal(s2.complete, false);
  const s3 = F.fdBlockStatus({ steps: [{ kind: 'qb', done: true }] }, {});
  assert.equal(s3.complete, true); assert.equal(s3.next, null);
});

test('the planner card offers the three chips with the chosen one pressed, and a start button', () => {
  const plan = F.fdBlockPlan(IDX, state(), 10, { due: due(8), weakest: WEAK });
  const html = F.fdBlockCard(plan, 10, null, {});
  assert.match(html, /<section class="fd-block" aria-labelledby="fdBlockTitle">/);
  assert.equal((html.match(/data-block-minutes="/g) || []).length, 3);
  assert.match(html, /data-block-minutes="10" aria-pressed="true"/);
  assert.match(html, /data-block-minutes="5" aria-pressed="false"/);
  assert.match(html, /data-block-start="10">Start the 10-minute block</);
  assert.equal((html.match(/class="fd-block__step"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-fd-/, 'block actions stay out of the controller namespace');
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

test('an empty plan explains itself instead of offering a start', () => {
  const html = F.fdBlockCard({ steps: [], total: 0, minutes: 5 }, 5, null, {});
  assert.match(html, /fd-block__empty/);
  assert.doesNotMatch(html, /data-block-start/);
});

test('a live block renders done marks, the count, Continue to the next step, and End', () => {
  const block = { minutes: 10, steps: [
    { kind: 'review', title: '3 reviews that are due', min: 2, done: true },
    { kind: 'page', ref: 'a.md', title: 'Alpha', min: 5 },
    { kind: 'qb', title: '4 practice questions', min: 3 },
  ] };
  const html = F.fdBlockCard(null, 10, block, {});
  assert.match(html, /<section class="fd-block is-live" aria-labelledby="fdBlockTitle">/);
  assert.match(html, /<span class="fd-block__kicker" id="fdBlockTitle">Your 10-minute block</,
    'the section is named by its kicker, not the first step');
  assert.equal((html.match(/fd-visually-hidden">Done: /g) || []).length, 1);
  assert.equal((html.match(/fd-visually-hidden">Not yet: /g) || []).length, 2);
  assert.match(html, /1 of 3 done/);
  assert.equal((html.match(/fd-block__step is-done/g) || []).length, 1);
  assert.match(html, /data-block-continue="1">Continue: Alpha →/);
  assert.match(html, /data-block-end="1">End block</);
  assert.doesNotMatch(html, /data-block-minutes/, 'no chips while a block is live');
});

test('a completed block says so and offers only Clear', () => {
  const block = { minutes: 5, steps: [{ kind: 'review', title: 'r', min: 2, done: true }, { kind: 'page', ref: 'a.md', title: 'Alpha', min: 3 }] };
  const html = F.fdBlockCard(null, 5, block, { 'a.md': true });
  assert.match(html, /<span class="fd-block__kicker" id="fdBlockTitle">Block complete</);
  assert.match(html, /2 of 2 done/);
  assert.match(html, /All 2 steps done\./, 'the closing line counts the steps the block actually held');
  const one = F.fdBlockCard(null, 5, { minutes: 5, steps: [{ kind: 'qb', title: 'q', min: 3, done: true }] }, {});
  assert.match(one, /The one step is done\./);
  assert.doesNotMatch(html, /data-block-continue/);
  assert.match(html, /data-block-end="1">Clear</);
});

test('titles are escaped and the module touches no DOM, storage, or clock', () => {
  const html = F.fdBlockCard(null, 10, { minutes: 10, steps: [{ kind: 'page', ref: 'x.md', title: '<b>&', min: 1 }] }, {});
  assert.match(html, /&lt;b&gt;&amp;/);
  const body = blockSrc.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(body, /document\.|localStorage|Date\.now\(|new Date\(\)/);
});
