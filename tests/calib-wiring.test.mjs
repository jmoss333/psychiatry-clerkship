// Wiring contract for the calibration-ledger snippet (cw_calib_v1) at its qbank and
// review (Daily Review / SRS) consumers. The BEHAVIOUR of calibLog/calibRead itself
// (routing, ring trim, enum rejection, v-reset) is pinned separately in
// tests/calib-ledger.test.mjs by evaluating the snippet body via `new Function`. This
// file only pins the WIRING — mirrors the behaviour/wiring split tests/sm2-behavior.test.mjs
// (behaviour) vs tests/family-srs-parity.test.mjs (wiring) already use for the SM-2
// grader snippet:
//   (a) the /*__CALIB_LOG__*/ marker appears exactly once in each consumer's tool source;
//   (b) no consumer reimplements `function calibLog(` locally (the canonical body lives
//       in calib_log.js only — a hand-synced copy is exactly the drift the marker system
//       replaced for SM-2, per common.py's SNIPPET_MARKERS comment);
//   (c) no consumer hardcodes the literal 'cw_calib_v1' key (only calib_log.js may);
//   (d) the qbank call site actually forwards t2: and re: (not just calls calibLog at all);
//   (e) the review.html call site forwards sug: and rq:, and the 'sug' suggested-grade
//       variable is computed exactly once and shared — via closure, not duplicated
//       logic — between the grade-button className and the calibLog event (single
//       source of truth: task-12 brief).
//
// (b)/(c) scan every file `git ls-files` tracks as source — not a hand-walked directory
// tree — because this repo checkout carries a 19GB `.claude/worktrees/` sibling-worktree
// stash (gitignored) that a naive recursive walk would wander into and read.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '/*__CALIB_LOG__*/';
const QBANK = '13_Faculty_Resources/_automation/site_build/question-bank-practice.html';
const REVIEW = '07_Evidence_and_Reading/Landmark_Trials/review.html';
const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const SNIPPET_SOURCE = '13_Faculty_Resources/_automation/site_build/calib_log.js';

const qbankSrc = fs.readFileSync(path.join(repo, QBANK), 'utf8');
const reviewSrc = fs.readFileSync(path.join(repo, REVIEW), 'utf8');
const spaSrc = fs.readFileSync(path.join(repo, SPA), 'utf8');

test('question-bank-practice.html carries the CALIB_LOG marker exactly once', () => {
  const count = qbankSrc.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${QBANK}, found ${count}`);
});

test('question-bank-practice.html qbRecord call site forwards t2: and re: to calibLog', () => {
  const callMatch = qbankSrc.match(/calibLog\(\{[^}]*\}\)/);
  assert.ok(callMatch, `calibLog({...}) call site not found in ${QBANK}`);
  const call = callMatch[0];

  // Nonzero-extraction guard: pin the field assertions below against THIS captured
  // substring, not the whole file — otherwise a stray `t2:` or `re:` anywhere else in
  // the tool would let the pins pass even if the real call site were broken or deleted.
  // The floor also catches a regex that matched some degenerate near-empty call
  // (e.g. `calibLog({})`, 14 chars) instead of the real ~120-char object literal.
  assert.ok(
    call.length > 80,
    `calibLog call-site match is suspiciously short (${call.length} chars): ${JSON.stringify(call)}`,
  );

  assert.match(call, /\bs\s*:\s*'qb'/, "calibLog call site missing s:'qb'");
  assert.match(call, /\bid\s*:\s*item\.id\b/, 'calibLog call site missing id: item.id');
  assert.match(call, /\bp\s*:\s*confidence\b/, 'calibLog call site missing p: confidence');
  assert.match(call, /\ba\s*:\s*correct\s*\?\s*1\s*:\s*0\b/, 'calibLog call site missing a: correct?1:0');
  assert.match(call, /\bt2\s*:\s*twoTierResult\b/, 'calibLog call site missing t2: twoTierResult');
  assert.match(call, /\bre\s*:\s*re\b/, 'calibLog call site missing re: re');
});

test('qbRecord computes the re-attempt flag from the prior same-day record', () => {
  const fnMatch = qbankSrc.match(/function qbRecord\([^)]*\)\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'qbRecord() function body not found');
  const body = fnMatch[0];
  assert.ok(body.length > 200, `qbRecord() match is suspiciously short: ${body.length} chars`);

  // prev must be captured BEFORE data[item.id] is overwritten with the new record.
  const prevIdx = body.indexOf('var prev');
  const overwriteIdx = body.indexOf('data[item.id] = rec');
  assert.ok(prevIdx >= 0, 'qbRecord() does not capture var prev');
  assert.ok(overwriteIdx >= 0, 'qbRecord() does not overwrite data[item.id] = rec');
  assert.ok(prevIdx < overwriteIdx, 'prev must be captured before data[item.id] is overwritten');

  assert.match(body, /toDateString\(\)\s*===\s*\(new Date\(\)\)\.toDateString\(\)/,
    'qbRecord() re flag must compare prev.ts and now via toDateString()');
});

test('review.html carries the CALIB_LOG marker exactly once', () => {
  const count = reviewSrc.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${REVIEW}, found ${count}`);
});

test('review.html grade() call site forwards sug: and rq: to calibLog', () => {
  const callMatch = reviewSrc.match(/calibLog\(\{[^}]*\}\)/);
  assert.ok(callMatch, `calibLog({...}) call site not found in ${REVIEW}`);
  const call = callMatch[0];

  // Nonzero-extraction guard, same rationale as the qbank pin above: a regex that
  // matched some degenerate near-empty call (e.g. `calibLog({})`) must not pass.
  assert.ok(
    call.length > 80,
    `calibLog call-site match is suspiciously short (${call.length} chars): ${JSON.stringify(call)}`,
  );

  assert.match(call, /\bs\s*:\s*'rev'/, "calibLog call site missing s:'rev'");
  assert.match(call, /\bid\s*:\s*card\.id\b/, 'calibLog call site missing id: card.id');
  assert.match(call, /\bp\s*:\s*GRADE_NAMES\[g\]/, 'calibLog call site missing p: GRADE_NAMES[g]');
  assert.match(call, /\bsug\s*:\s*sug\b/, 'calibLog call site missing sug: sug');
  assert.match(call, /\ba\s*:\s*gotIt\s*\?\s*1\s*:\s*0\b/, 'calibLog call site missing a: gotIt?1:0');
  assert.match(call, /\brq\s*:\s*rq\b/, 'calibLog call site missing rq: rq');
});

test("review.html computes 'sug' exactly once and shares it between the className and the calibLog event", () => {
  // (1) Exactly one `var sug=` declaration in the whole file — the brief's "compute
  // ONCE" requirement. If a second declaration crept in (e.g. grade() re-deriving its
  // own local sug instead of closing over the render's), this test methodology
  // (regex over source, not an AST) would otherwise be blind to the duplication.
  const sugDeclarations = reviewSrc.match(/\bvar\s+sug\s*=/g) || [];
  assert.equal(
    sugDeclarations.length, 1,
    `expected exactly one 'var sug=' declaration, found ${sugDeclarations.length}`,
  );
  assert.match(reviewSrc, /var\s+sug\s*=\s*gotIt\s*\?\s*'Good'\s*:\s*'Again'/,
    "the single 'sug' declaration must be gotIt?'Good':'Again'");

  // (2) The grade-button className region (captured independently of the calibLog
  // call site below) must reference 'sug', not a re-derived gotIt/!gotIt ternary —
  // nonzero-extraction guard on the captured block itself.
  const gradesBlockMatch = reviewSrc.match(/className:"grades"\}[\s\S]*?"Easy"/);
  assert.ok(gradesBlockMatch, 'grade-button "grades" block not found');
  const gradesBlock = gradesBlockMatch[0];
  assert.ok(
    gradesBlock.length > 200,
    `grades-block match is suspiciously short (${gradesBlock.length} chars): ${JSON.stringify(gradesBlock)}`,
  );
  assert.match(gradesBlock, /className:"gr again"\+\(sug===['"]Again['"]/,
    "Again button className must branch on sug==='Again'");
  assert.match(gradesBlock, /className:"gr good"\+\(sug===['"]Good['"]/,
    "Good button className must branch on sug==='Good'");

  // (3) grade()'s own function body must NOT redeclare 'sug' — it has to reach the
  // render-scope variable via closure. A local `var sug=` inside grade() would still
  // pass test (1)'s file-wide count of 1 only if the render-scope declaration were
  // deleted, so this guards the "shared, not duplicated" half of the contract directly.
  const gradeFnMatch = reviewSrc.match(/function grade\(g\)\{[\s\S]*?\n  \}/);
  assert.ok(gradeFnMatch, 'grade(g) function body not found');
  const gradeFn = gradeFnMatch[0];
  assert.ok(gradeFn.length > 200, `grade() match is suspiciously short: ${gradeFn.length} chars`);
  assert.doesNotMatch(gradeFn, /\bvar\s+sug\s*=/,
    'grade() must not redeclare sug locally — it must close over the render-scope sug');
  assert.match(gradeFn, /\bsug\s*:\s*sug\b/, 'grade() must forward the closed-over sug to calibLog');
});

test('review.html grade() tracks session-local requeues via gradedThisSession', () => {
  const gradeFnMatch = reviewSrc.match(/function grade\(g\)\{[\s\S]*?\n  \}/);
  assert.ok(gradeFnMatch, 'grade(g) function body not found');
  const gradeFn = gradeFnMatch[0];

  const rqIdx = gradeFn.indexOf('var rq=gradedThisSession[card.id]');
  const markIdx = gradeFn.indexOf('gradedThisSession[card.id]=1');
  const calibIdx = gradeFn.indexOf('calibLog(');
  assert.ok(rqIdx >= 0, 'grade() does not read gradedThisSession[card.id] into rq');
  assert.ok(markIdx >= 0, 'grade() does not set gradedThisSession[card.id]=1');
  assert.ok(rqIdx < markIdx, 'rq must be read BEFORE gradedThisSession[card.id] is marked graded');
  assert.ok(markIdx < calibIdx, 'gradedThisSession must be marked before the calibLog call reads rq');

  assert.match(reviewSrc, /\bvar gradedThisSession=\{\}/,
    'gradedThisSession must be declared once, outside App(), so it survives re-renders');
  assert.match(reviewSrc, /function start\(ahead\)\{[\s\S]*?gradedThisSession=\{\};[\s\S]*?setSess\(\{queue:q,pos:0/,
    'start() must reset gradedThisSession={} before beginning a new session');
});

test('review.html resetAll clears the calibration ledger via calibClear(), not a literal key', () => {
  const fnMatch = reviewSrc.match(/function resetAll\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'resetAll() function not found');
  const body = fnMatch[0];
  assert.match(body, /This also clears your calibration history\./,
    'resetAll confirm text must disclose that calibration history is also cleared');
  assert.match(body, /\bcalibClear\(\)/, 'resetAll must call calibClear()');
  assert.doesNotMatch(body, /removeItem\(\s*(['"])cw_calib_v1\1/,
    'resetAll must not remove cw_calib_v1 by a literal key — that belongs to calibClear() in calib_log.js only');
});

test('spa_index.html carries the CALIB_LOG marker exactly once', () => {
  const count = spaSrc.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${SPA}, found ${count}`);
});

test('spa_index.html exportStudy forwards the calibration ledger via calibRead(), not a literal key', () => {
  const fnMatch = spaSrc.match(/window\.exportStudy=function\(\)\{[\s\S]*?\n  \};/);
  assert.ok(fnMatch, 'window.exportStudy function not found');
  const body = fnMatch[0];
  assert.match(body, /schema:\s*'clerkship-study-v2'/, 'exportStudy schema must be bumped to clerkship-study-v2');
  assert.match(body, /\bcalib\s*:\s*\(function\(\)\{try\{return calibRead\(\);/,
    'exportStudy must source the calib field from calibRead(), not localStorage/safeLS by literal key');
  assert.doesNotMatch(body, /(['"])cw_calib_v1\1/,
    'exportStudy must not reference the cw_calib_v1 literal directly — only calibRead() may');
});

test('spa_index.html renderProgress swaps in renderCalibPanel() and falls back to calibrationSummary() only when it is empty', () => {
  const startMarker = '/* ---- calib panel ---- */';
  const endMarker = '/* ---- end calib panel ---- */';
  assert.ok(spaSrc.includes(startMarker) && spaSrc.includes(endMarker),
    'calib-panel slice markers must both be present');
  // The calibration card lives on the Progress view since the Today/Progress split —
  // renderHome must NOT carry it (Today is the action half; analytics render on Progress).
  const renderProgressMatch = spaSrc.match(/window\.renderProgress=function\(\)\{[\s\S]*?\n  \};/);
  assert.ok(renderProgressMatch, 'window.renderProgress function not found');
  const body = renderProgressMatch[0];
  assert.match(body, /var calPanel=\(typeof renderCalibPanel==='function'\)\?renderCalibPanel\(\):''/,
    'renderProgress must call renderCalibPanel() defensively (typeof guard)');
  assert.match(body, /if\(calPanel\)\{ h\+=calPanel; \}/,
    'renderProgress must use the panel output when non-empty');
  assert.match(body, /else\{ var cal=calibrationSummary\(\);/,
    'renderProgress must fall back to the legacy calibrationSummary() card when the panel is empty');
  const renderHomeMatch = spaSrc.match(/window\.renderHome=function\(\)\{[\s\S]*?\n  \};/);
  assert.ok(renderHomeMatch, 'window.renderHome function not found');
  // Pin the swap-in CALL (var calPanel=...), not the bare identifier — a renderHome comment
  // legitimately cites renderCalibPanel()'s docs and must not trip this.
  assert.doesNotMatch(renderHomeMatch[0], /var calPanel=/,
    'renderHome must not render the calibration panel — it moved to renderProgress');
});

// Every file this repo's build treats as shipped source (git-tracked .html/.js). Untracked
// build output (_build/) and the sibling worktree stash are excluded by construction, not
// by an exclude list that could silently rot.
function trackedSources() {
  const out = execFileSync('git', ['ls-files', '--', '*.html', '*.js'], {
    cwd: repo,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

test('no consumer reimplements calibLog locally', () => {
  const offenders = [];
  for (const rel of trackedSources()) {
    if (rel === SNIPPET_SOURCE) continue;
    const src = fs.readFileSync(path.join(repo, rel), 'utf8');
    if (/function\s+calibLog\s*\(/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    `local calibLog() reimplementation found outside ${SNIPPET_SOURCE}: ${offenders.join(', ')}`);
});

test("literal 'cw_calib_v1' is absent from every consumer source except calib_log.js", () => {
  const offenders = [];
  for (const rel of trackedSources()) {
    if (rel === SNIPPET_SOURCE) continue;
    const src = fs.readFileSync(path.join(repo, rel), 'utf8');
    if (/(['"])cw_calib_v1\1/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    `cw_calib_v1 literal found outside ${SNIPPET_SOURCE}: ${offenders.join(', ')}`);
});

// RED-teeth check performed manually during authoring (not re-run automatically here,
// since it requires mutating the source file): temporarily pasting a second
// /*__CALIB_LOG__*/ marker into question-bank-practice.html turned the first test in this
// file red (count 2 !== 1) before the duplicate was reverted. See task-11-report.md.
