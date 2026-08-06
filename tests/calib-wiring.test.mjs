// Wiring contract for the calibration-ledger snippet (cw_calib_v1) at its qbank consumer.
// The BEHAVIOUR of calibLog/calibRead itself (routing, ring trim, enum rejection, v-reset)
// is pinned separately in tests/calib-ledger.test.mjs by evaluating the snippet body via
// `new Function`. This file only pins the WIRING — mirrors the behaviour/wiring split
// tests/sm2-behavior.test.mjs (behaviour) vs tests/family-srs-parity.test.mjs (wiring)
// already use for the SM-2 grader snippet:
//   (a) the /*__CALIB_LOG__*/ marker appears exactly once in the qbank tool source;
//   (b) no consumer reimplements `function calibLog(` locally (the canonical body lives
//       in calib_log.js only — a hand-synced copy is exactly the drift the marker system
//       replaced for SM-2, per common.py's SNIPPET_MARKERS comment);
//   (c) no consumer hardcodes the literal 'cw_calib_v1' key (only calib_log.js may);
//   (d) the qbank call site actually forwards t2: and re: (not just calls calibLog at all).
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
const SNIPPET_SOURCE = '13_Faculty_Resources/_automation/site_build/calib_log.js';

const qbankSrc = fs.readFileSync(path.join(repo, QBANK), 'utf8');

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
