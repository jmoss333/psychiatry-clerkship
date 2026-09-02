// Source-level wiring pins for the timed block and session receipt: the shared snippets reach
// every consumer through their markers exactly once, the tools honour the block parameters the
// planner emits, and the shell splices the block card in with the other device-store rows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const shell = read(`${BUILD}/spa_index.html`);
const qbank = read(`${BUILD}/question-bank-practice.html`);
const review = read('../07_Evidence_and_Reading/Landmark_Trials/review.html');
const shelfMode = read('../07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html');
const common = read(`${BUILD}/common.py`);
const once = (src, marker, where) => assert.equal(src.split(marker).length - 1, 1, `${marker} once in ${where}`);

test('the three snippets are registered and each consumer carries its markers exactly once', () => {
  for (const m of ['/*__BLOCK_STORE__*/', '/*__SESSION_RECEIPT__*/', '/*__FD_BLOCK__*/']) assert.ok(common.includes(`"${m}"`), m);
  once(shell, '/*__BLOCK_STORE__*/', 'shell'); once(shell, '/*__FD_BLOCK__*/', 'shell');
  assert.doesNotMatch(shell, /\/\*__SESSION_RECEIPT__\*\//, 'the shell renders no receipt');
  once(qbank, '/*__BLOCK_STORE__*/', 'qbank'); once(qbank, '/*__SESSION_RECEIPT__*/', 'qbank');
  once(review, '/*__BLOCK_STORE__*/', 'review'); once(review, '/*__SESSION_RECEIPT__*/', 'review');
  once(shelfMode, '/*__SESSION_RECEIPT__*/', 'shelf-mode');
  assert.doesNotMatch(shelfMode, /\/\*__BLOCK_STORE__\*\//, 'exam sets are never a block step');
});

test('no consumer re-implements the snippet functions locally', () => {
  for (const [src, name] of [[qbank, 'qbank'], [review, 'review'], [shelfMode, 'shelf-mode'], [shell, 'shell']]) {
    assert.doesNotMatch(src, /function\s+cwReceipt\s*\(/, name);
    assert.doesNotMatch(src, /function\s+blockLoad\s*\(/, name);
  }
});

test('the question bank starts a bounded, optionally filtered session from ?block=1', () => {
  assert.match(qbank, /sp\.get\('block'\)!=='1'/);
  assert.match(qbank, /startSession\(_blockCat, 'all', String\(BLOCK_REQUEST\.n\)\)/);
  assert.match(qbank, /blockKind:'qb'/);
  assert.match(qbank, /ref:'question-bank-practice\.html'/, 'the qbank IS a week item, so it marks itself done');
});

test('Daily Review slices its queue to ?limit=N under ?block=1 and keeps the pinned start(ahead) shape', () => {
  assert.match(review, /function start\(ahead\)\{/);
  assert.match(review, /bp\.get\("block"\)==="1"/);
  assert.match(review, /q=q\.slice\(0,limit\)/);
  assert.match(review, /blockKind:'review'/);
  assert.match(review, /ref:null, blockKind:'review'/, 'Daily Review is not a week item');
});

test('the shell splices the block card beside the due row and resume card, never in a faculty preview', () => {
  const today = shell.slice(shell.indexOf('function fdTodayLive('), shell.indexOf('function fdRenderCapture('));
  assert.match(today, /fdBlockCard\(/);
  assert.match(today, /if\(!facultyPreviewRequest\)\{\s*var liveForBlock/);
  assert.match(shell, /closest\('\[data-block-start\]'\)/);
  assert.match(shell, /closest\('\[data-block-continue\]'\)/);
  assert.match(shell, /closest\('\[data-block-end\]'\)/);
  assert.match(shell, /closest\('\[data-block-minutes\]'\)/);
});

test('a tool may name its full route through openPage, but only a short plain query is honoured', () => {
  assert.match(shell, /data\.search\.length<=200&&\/\^\\\?\[A-Za-z0-9_\.%=&-\]\*\$\/\.test\(data\.search\)/);
  assert.match(shell, /fdOpenRef\(data\.f, searchOk\?data\.search:undefined\)/);
});
