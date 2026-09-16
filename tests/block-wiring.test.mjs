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
  assert.match(qbank, /blockKind:\(SESSION&&SESSION\.fromBlock\)\?'qb':null/, 'only a block-started session may mark the block step');
  assert.match(qbank, /SESSION\.fromBlock = true/);
  assert.match(qbank, /ref:'question-bank-practice\.html'/, 'the qbank IS a week item, so it marks itself done');
});

test('Daily Review slices its queue to ?limit=N under ?block=1 and keeps the pinned start(ahead) shape', () => {
  assert.match(review, /function start\(ahead\)\{/);
  assert.match(review, /bp\.get\("block"\)==="1"/);
  assert.match(review, /q=q\.slice\(0,limit\)/);
  assert.match(review, /ref:null, blockKind:sess\.fromBlock\?'review':null/, 'Daily Review is not a week item, and only a block-started session marks the step');
  assert.match(review, /fromBlock:fromBlock/);
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

test('the shell picks exactly one primary, names the secondary heading once, and splices at the lead marker', () => {
  const today = shell.slice(shell.indexOf('function fdTodayLive('), shell.indexOf('function fdRenderCapture('));
  assert.equal(today.split('fdTodayPrimary(').length - 1, 1, 'one picker call');
  assert.equal(today.split('Also today').length - 1, 1, 'one heading');
  assert.match(today, /live\.primaryKind=primary\.kind;/, 'the pure renderer is told who won before it renders');
  assert.match(today, /fdBlockCard\([^;]*\{primary:primary\.kind==='block',resume:blockResume\}\)/, 'the block card is primary only when it won, and knows when its question set can be resumed');
  assert.match(today, /fdDueRow\(due,primary\.kind==='due'\)/);
  assert.match(today, /fdResumeCard\(sess,primary\.kind==='resume'\)/);
  assert.match(today, /fdLastReadRow\(lastRead,primary\.kind==='read'\)/);
  assert.match(today, /'<div class="fd-primary">'/);
  assert.match(today, /FD_TODAY_LEAD_END/, 'the marker fd_today.js emits is the splice point');
  assert.match(today, /fdTodayWhy\(\)/);
});

test('an interrupted block session checkpoints its block identity and resumes as a block session', () => {
  const checkpoint = qbank.slice(qbank.indexOf('function checkpointSession('), qbank.indexOf('function tryResumeSession('));
  assert.match(checkpoint, /fromBlock: SESSION\.fromBlock===true/);
  assert.match(checkpoint, /n: SESSION\.queue\.length/);
  assert.match(checkpoint, /cat: SESSION\.cat\|\|null/);
  const resume = qbank.slice(qbank.indexOf('function tryResumeSession('), qbank.indexOf('function showQuestion('));
  assert.match(resume, /SESSION\.fromBlock = cap\.fromBlock===true;/);
  assert.match(resume, /SESSION\.cat = \(typeof cap\.cat==='string'&&CAT_LABELS\[cap\.cat\]\)\?cap\.cat:null;/);
  assert.match(qbank, /SESSION\.cat = _blockCat==='all' \? null : _blockCat;/, 'a block start records its category on the session');
  assert.ok(qbank.indexOf('RESUME_REQUESTED && tryResumeSession()') < qbank.indexOf('if(BLOCK_REQUEST){'),
    'resume is tried before a fresh block start, so ?resume=1&block=1 restores rather than restarts');
});

test('Continue on a live block resumes an interrupted question set instead of starting a fresh one', () => {
  const cont = shell.slice(shell.indexOf('function fdBlockContinue('), shell.indexOf('function fdLiveState('));
  assert.match(cont, /fdBlockResumeSearch\(status\.next, *sess\)/);
  assert.match(cont, /fdOpenRef\(status\.next\.ref, *resume\)/);
  assert.match(cont, /fdOpenBlockStep\(status\.next\)/, 'the fresh-start route remains the fallback');
});
