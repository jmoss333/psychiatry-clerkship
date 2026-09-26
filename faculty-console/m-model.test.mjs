/* Phone client model: grouping, advance, applying write rows, diff flattening. Pure functions,
   fixtures inline — never the live ledger (a test may not depend on live governance state). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyRows, contentEligibility, diffLines, groupQueue, nextAfterSign, phoneQueue,
  questionEligibility, questionEntry, reviewReason, timeoutStatus,
} from './m/m-model.mjs';

const REV = 'a'.repeat(64);
const STALE = 'Content changed since faculty review on 2026-09-21; awaiting re-attestation.';

function server() {
  return {
    student: 'https://ms3.example/', resident: 'https://res.example/', attester: 'Dr Test',
    items: [
      { slug: 't_mood.md', title: 'Mood', kind: 'page', site: 'ms3', sites: ['ms3', 'res'], status: 'unreviewed', at: '2026-09-21', by: 'Dr Test', risk: { kind: 'clinical', level: 'high' }, stale: true, reason: STALE },
      { slug: 't_sud.md', title: 'SUD', kind: 'page', site: 'ms3', sites: ['ms3'], status: 'unreviewed', at: '2026-09-21', by: 'Dr Test', risk: { kind: 'clinical', level: 'high' }, stale: true, reason: STALE },
      { slug: 'mse.html', title: 'MSE tool', kind: 'tool', site: 'ms3', sites: ['ms3'], status: 'unreviewed', at: '', by: '', risk: { kind: 'general', level: 'low' }, reason: 'New tool awaiting review' },
      { slug: 'cotw_20260831_catatonia_ms3.md', title: 'Catatonia — MS3', kind: 'page', site: 'ms3', sites: ['ms3'], status: 'unreviewed', at: '', by: '', risk: { kind: 'clinical', level: 'moderate' }, reason: '' },
      { slug: 'cotw_20260831_catatonia_res.md', title: 'Catatonia — Resident', kind: 'page', site: 'res', sites: ['res'], status: 'unreviewed', at: '', by: '', risk: { kind: 'clinical', level: 'moderate' }, reason: '' },
      { slug: 'done.md', title: 'Done', kind: 'page', site: 'ms3', sites: ['ms3'], status: 'reviewed', at: '2026-09-25', by: 'Dr Test', risk: { kind: 'general', level: 'low' }, reason: '' },
    ],
    qbank: [
      { id: 'qb_mood_001', status: 'draft', revision: REV, assessment: { gate: 'ready', blockers: [], warnings: [] }, stem: 'S', options: [], category: 'mood', difficulty: 2, pages: [], evidence: '' },
    ],
  };
}
function changes() {
  return {
    view: 'changes', groups: [
      { id: 'pr:813', pr: 813, sha: 'abc', title: 'WP-9 citations', date: '2026-09-25', url: 'https://x/813', slugs: ['t_mood.md', 't_sud.md'] },
      { id: 'pr:765', pr: 765, sha: 'def', title: 'WP-8', date: '2026-09-24', url: 'https://x/765', slugs: ['t_sud.md'] },
    ],
    unexplained: ['mse.html'], unchecked: [], pages: {},
  };
}

test('phoneQueue keeps only items that need review, questions included', () => {
  const q = phoneQueue(server());
  assert.deepEqual(q.map(i => i.key).sort(), [
    'page:cotw_20260831_catatonia_ms3.md', 'page:cotw_20260831_catatonia_res.md', 'page:t_mood.md', 'page:t_sud.md',
    'question:qb_mood_001', 'tool:mse.html',
  ]);
});

test('groupQueue: corrections first (largest first), then no-text-change, then the rest; a slug named by two groups is placed once', () => {
  const items = phoneQueue(server());
  const sections = groupQueue(items, changes());
  assert.deepEqual(sections.map(s => [s.id, s.items.map(i => i.identity)]), [
    ['pr:813', ['t_mood.md', 't_sud.md']],
    ['no-text-change', ['mse.html']],
    ['pending', ['cotw_20260831_catatonia_ms3.md', 'cotw_20260831_catatonia_res.md', 'qb_mood_001']],
  ]);
  assert.equal(sections[0].title, '#813 WP-9 citations');
});

test('groupQueue without a changes view puts everything under pending', () => {
  const sections = groupQueue(phoneQueue(server()), null);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, 'pending');
});

test('reviewReason prefers the drift reason, then the pending reason, then a default', () => {
  const items = phoneQueue(server());
  const by = k => items.find(i => i.key === k);
  assert.equal(reviewReason(by('page:t_mood.md')), STALE);
  assert.equal(reviewReason(by('tool:mse.html')), 'New tool awaiting review');
  assert.equal(reviewReason(by('page:cotw_20260831_catatonia_ms3.md')), 'Pending faculty review');
  assert.equal(reviewReason(by('question:qb_mood_001')), 'Draft question awaiting attestation');
});

test('nextAfterSign: twin first, then the same group, then the next pending page or tool, never a question', () => {
  const items = phoneQueue(server());
  const sections = groupQueue(items, changes());
  assert.equal(nextAfterSign('page:cotw_20260831_catatonia_ms3.md', items, sections), 'page:cotw_20260831_catatonia_res.md');
  assert.equal(nextAfterSign('page:t_mood.md', items, sections), 'page:t_sud.md');
  assert.equal(nextAfterSign('page:t_sud.md', items, sections), 'page:t_mood.md');   // wraps within the group
  assert.equal(nextAfterSign('tool:mse.html', items, sections), 'page:cotw_20260831_catatonia_ms3.md');   // falls through to the first pending page/tool in sorted order
  const onlyQuestion = items.filter(i => i.type === 'question' || i.key === 'tool:mse.html');
  assert.equal(nextAfterSign('tool:mse.html', onlyQuestion, groupQueue(onlyQuestion, null)), null);
});

test('applyRows updates the matching items in place and drops the stale flag; unknown slugs are ignored', () => {
  const next = applyRows(server(), {
    't_mood.md': { status: 'reviewed', at: '2026-09-26', by: 'Dr Test', risk: { kind: 'clinical', level: 'high' }, reason: '' },
    'ghost.md': { status: 'reviewed', at: '2026-09-26', by: 'Dr Test', risk: null, reason: '' },
  });
  const mood = next.items.find(i => i.slug === 't_mood.md');
  assert.equal(mood.status, 'reviewed');
  assert.equal(mood.at, '2026-09-26');
  assert.equal('stale' in mood, false);
  assert.equal(mood.reason, '');
  assert.equal(next.items.length, server().items.length);
  assert.equal(next.items.some(i => i.slug === 'ghost.md'), false);
  assert.deepEqual(applyRows(server(), undefined), server());
});

test('diffLines flattens hunks into file / context / del / add lines, splitting change rows', () => {
  const diff = { view: 'diff', files: [
    { path: 'a.md', status: 'modified', hunks: [{ oldStart: 1, newStart: 1, rows: [
      { kind: 'context', segments: [{ t: 'eq', s: 'Unchanged line' }] },
      { kind: 'change', segments: [{ t: 'eq', s: 'Dose ' }, { t: 'del', s: 'is 10' }, { t: 'add', s: 'varies' }] },
      { kind: 'del', segments: [{ t: 'del', s: 'Removed line' }] },
      { kind: 'add', segments: [{ t: 'add', s: 'Added line' }] },
    ] }] },
    { path: 'b.md', status: 'unchanged', hunks: [] },
  ] };
  assert.deepEqual(diffLines(diff), [
    { kind: 'file', text: 'a.md' },
    { kind: 'context', text: 'Unchanged line' },
    { kind: 'del', text: 'Dose is 10' },
    { kind: 'add', text: 'Dose varies' },
    { kind: 'del', text: 'Removed line' },
    { kind: 'add', text: 'Added line' },
  ]);
  assert.deepEqual(diffLines(null), []);
});

test('diffLines never lets a changed file vanish: too large, binary and truncated files each carry a note', () => {
  // The server sends hunks: [] with tooLarge: true past 6,000 lines or 2,000 edits.
  assert.deepEqual(diffLines({ files: [{ path: 'big.md', status: 'modified', hunks: [], tooLarge: true }] }), [
    { kind: 'file', text: 'big.md' },
    { kind: 'note', text: 'Too much changed to show here; open the comparison on GitHub.' },
  ]);
  assert.deepEqual(diffLines({ files: [{ path: 'img.png', status: 'binary', hunks: [] }] }), [
    { kind: 'file', text: 'img.png' },
    { kind: 'note', text: 'Binary file changed.' },
  ]);
  assert.deepEqual(diffLines({ files: [{ path: 'long.md', status: 'modified', truncated: true, hunks: [{ oldStart: 1, newStart: 1, rows: [
    { kind: 'add', segments: [{ t: 'add', s: 'New line' }] },
  ] }] }] }), [
    { kind: 'file', text: 'long.md' },
    { kind: 'add', text: 'New line' },
    { kind: 'note', text: 'Only the first 60 hunks are shown.' },
  ]);
  // Only unchanged and missing files are skipped.
  assert.deepEqual(diffLines({ files: [
    { path: 'same.md', status: 'unchanged', hunks: [] },
    { path: 'gone.md', status: 'missing', hunks: [] },
  ] }), []);
});

test('timeoutStatus mirrors the desktop: protocol_unavailable once the frame loaded, else frame_failure', () => {
  assert.equal(timeoutStatus(true), 'protocol_unavailable');
  assert.equal(timeoutStatus(false), 'frame_failure');
});

test('contentEligibility is false until the preview is ready and all three acknowledgements are set', () => {
  const item = phoneQueue(server()).find(i => i.key === 'page:t_mood.md');
  assert.equal(contentEligibility(item, { previewStatus: 'loading' }).eligible, false);
  assert.equal(contentEligibility(item, { previewStatus: 'ready' }).eligible, false);
  assert.equal(contentEligibility(item, { previewStatus: 'ready', completeItemReviewed: true, accuracy: true, interactions: true }).eligible, true);
  // A failed preview needs the separate-tab acknowledgement instead.
  assert.equal(contentEligibility(item, { previewStatus: 'frame_failure', retryAttempted: true, separateTabReviewed: true, accuracy: true, interactions: true }).eligible, true);
  assert.equal(contentEligibility(item, { previewStatus: 'frame_failure', accuracy: true, interactions: true }).eligible, false);
});

test('questionEligibility needs the live receipt, the saved-revision receipt and the three confirmations; questionEntry mirrors the desktop body', () => {
  const q = phoneQueue(server()).find(i => i.type === 'question');
  const ok = { previewStatus: 'ready', liveReviewed: true, reviewedRevision: REV, clinical: true, evidence: true, originalityAndNoPhi: true };
  assert.equal(questionEligibility(q, ok).eligible, true);
  assert.equal(questionEligibility(q, { ...ok, reviewedRevision: '' }).eligible, false);
  assert.equal(questionEligibility(q, { ...ok, clinical: false }).eligible, false);
  assert.deepEqual(questionEntry(q, REV), { id: 'qb_mood_001', revision: REV, reviewedRevision: REV, acknowledgedWarnings: [] });
});

test('questionEntry carries the recorded receipt as given, so a stale or missing one reaches the server and fails there', () => {
  const q = phoneQueue(server()).find(i => i.type === 'question');
  assert.deepEqual(questionEntry(q, 'stale'), { id: 'qb_mood_001', revision: REV, reviewedRevision: 'stale', acknowledgedWarnings: [] });
  assert.deepEqual(questionEntry(q, undefined), { id: 'qb_mood_001', revision: REV, reviewedRevision: '', acknowledgedWarnings: [] });
});

test('the web manifest starts the phone client standalone at /m/ and names both icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('./m/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.start_url, '/m/');
  assert.equal(manifest.scope, '/m/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(i => i.src).sort(), ['./apple-touch-icon.png', './icon.svg']);
  const png = readFileSync(new URL('./m/apple-touch-icon.png', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);   // PNG signature
});
