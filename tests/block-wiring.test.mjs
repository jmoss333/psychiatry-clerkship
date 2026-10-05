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

test('the shell picks exactly one primary and hands the faces to the renderer on state, never by splicing', () => {
  const today = shell.slice(shell.indexOf('function fdTodayLive('), shell.indexOf('function fdCapsuleShare('));
  assert.equal(today.split('fdTodayPrimary(').length - 1, 1, 'one picker call');
  assert.match(today, /live\.primaryKind=primary\.kind;/, 'the pure renderer is told who won before it renders');
  assert.match(today, /fdBlockCard\([^;]*\{primary:primary\.kind==='block',resume:blockResume\}\)/, 'the block card is primary only when it won, and knows when its question set can be resumed');
  assert.match(today, /var dueRow=fdDueRow\(due,primary\.kind==='due'\);/);
  // The transient concept-count status never becomes an empty marked row: with a due row it rides
  // inside that face; without one it is a bare status line (state.statusHtml), so the DOM is
  // byte-identical across the fetch window apart from that one <p>.
  assert.match(today, /due:dueRow\?dueRow\+conceptStatus:'',/);
  assert.match(today, /live\.statusHtml=dueRow\?'':conceptStatus;/);
  assert.match(today, /fdResumeCard\(sess,primary\.kind==='resume',blockStatus\)/, 'the Resume card learns where the block stands');
  assert.match(today, /fdLastReadRow\(lastRead,primary\.kind==='read'\)/);
  // 2026-10-04 (one-thread, Phase 1): the shell no longer string-splices at an HTML-comment marker
  // or writes the "Also today" heading itself. The winning face goes in as state.nowHtml, the rest
  // as state.alsoRows with their status marks, and fd_today.js composes the page (and owns the
  // heading). The old marker and the bare .fd-primary wrapper must not come back.
  assert.doesNotMatch(today.replace(/\/\*[\s\S]*?\*\//g, ''), /FD_TODAY_LEAD_END|fd-lead-end|'<div class="fd-primary">'|Also today|\.replace\(/);
  assert.match(today, /if\(kind===primary\.kind\) live\.nowHtml=faces\[kind\];/);
  assert.match(today, /live\.alsoRows=rows;/);
  assert.match(today, /live\.purposeHtml=facultyPreviewRequest\?'':fdTodayPurpose\(FD_INDEX,fdTodayPurposeId,fdTodayPurposeOpen\);/);
  assert.match(today, /live\.caseWeek=fdWeekCaseStep\(FD_INDEX,FD_CASE_ARC,weekN\);/);
  // The case arc is build-injected (build_deploy.py replaces this exact needle), never fetched at
  // runtime: a fetch made Today's DOM churn after boot and two loads disagree on their render signature.
  once(shell, 'var FD_CASE_ARC=null;', 'spa_index.html');
  assert.doesNotMatch(shell, /fetch\(['"]longitudinal_case\.json/, 'no runtime fetch of the case arc');
  const build = read(`${BUILD}/build_deploy.py`);
  assert.match(build, /_case_needle="var FD_CASE_ARC=null;"/);
  assert.match(build, /frontdoor_catalog\._inline_json\(_case_arc\)/);
  assert.match(today.replace(/\/\*[\s\S]*?\*\//g, ''), /return fdToday\(FD_INDEX,live\);\s*\}\s*$/, 'one render call, nothing patched after it');
  for (const kind of ['block', 'due', 'resume', 'read']) assert.match(today, new RegExp(`${kind}:\\{mark:`), `${kind} carries a status mark`);
  assert.match(today, /mark:'plus',count:captureSummary\?captureSummary\.total:undefined/);
  // 2026-10-01: the "First things first" explanation line is retired (owner-directed design pass).
  assert.doesNotMatch(today, /fdTodayWhy\(\)/);
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


test('timed Daily Review block selects All due before limiting',()=>{
  assert.match(review,/if\(q\.get\('block'\)==='1'\|\|q\.get\('lane'\)==='all'\)return 'all'/);
  assert.match(review,/reviewLaneAllows\(c,lane,st,now\)/);
  assert.match(review,/q=q\.slice\(0,limit\)/);
});

test('real block start serves scheduled due cards only, then applies its limit',()=>{
  const start=review.slice(review.indexOf('  function start(ahead){'),review.indexOf('  function choose(i)'));
  const helpers=read(`${BUILD}/concept_recall.js`);
  const lanes=review.slice(review.indexOf('/* ---------- review lanes ---------- */'),review.indexOf('/* ---------- end review lanes ---------- */'));
  const run=new Function('limit',helpers+lanes+`;var DAY=86400000,gradedThisSession={},blockLimit={current:limit},weekRefs=[],conceptFilter='week',lane='all';
    var cards=[{id:'CONCEPT#due:1@1',page:'outside.md'},{id:'AR-24#5'},{id:'CONCEPT#new:1@1',page:'outside.md'},{id:'CONCEPT#future:1@1',page:'outside.md'}];
    var state={cards:{'CONCEPT#due:1@1':{due:0,ivl:1},'AR-24#5':{due:0,ivl:1},'CONCEPT#future:1@1':{due:Date.now()+86400000,ivl:1}},day:{newToday:0}},result;
    function loadS(){return state;} function rollDay(s){return s;} function queueable(){return true;}
    function shuffle(s){return s;} function effectiveNewPerDay(){return 12;} function setSess(s){result=s;}
    function saveS(){} function setStore(){};`+start+';start(false);return result;');
  assert.deepEqual(run(null).queue.map(c=>c.id),['CONCEPT#due:1@1','AR-24#5']);
  const block=run(1);
  assert.equal(block.queue.length,1);
  assert.equal(block.queue[0].id,'CONCEPT#due:1@1');
  assert.equal(block.fromBlock,true);
});

test('actual preparation message branch rejects origin, frame, resource and payload mismatches',()=>{
 const start=shell.indexOf('  function fdAuxMessage(event){'), end=shell.indexOf('\n\n  /* The root state',start);
 assert.ok(start>=0&&end>start,'actual shell handler exists');
 const handler=shell.slice(start,end);
 const selection=new Function(read(`${BUILD}/frontdoor/fd_wire.js`)+';return fdPrepareSelection;')();
 const frame={contentWindow:{}}, valid={type:'prepare-selection',task:'note',minutes:15};
 for(const change of [{},{origin:'https://other.test'},{source:{}},{frame:null},{item:'oral.html'},{openId:'oral.html'},{preview:{}},{data:{...valid,answer:'private'}},{data:{...valid,minutes:'15'}},{data:{...valid,task:'other'}}]) {
   const calls=[], contentEl={querySelector:()=>Object.hasOwn(change,'frame')?change.frame:frame}, fdController={getState:()=>({openId:change.openId||'prepare-for-tomorrow.html'}),replacePrepareSelection:v=>calls.push(v)};
   const fn=new Function('contentEl','fdController','facultyPreviewRequest','currentItem','location','fdPrepareSelection',handler+';return fdAuxMessage;')(contentEl,fdController,change.preview||null,{f:change.item||'prepare-for-tomorrow.html'},{origin:'https://example.test'},selection);
   fn({origin:change.origin||'https://example.test',source:change.source||frame.contentWindow,data:change.data||valid});
   assert.deepEqual(calls,Object.keys(change).length?[]:[{task:'note',minutes:15}]);
 }
});
