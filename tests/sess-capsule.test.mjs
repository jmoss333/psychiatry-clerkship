// Behavioural contract for the qbank session-capsule snippet (cw_sess_v1). Evaluates the real
// functions, not their text — a routing/trim regression turns these red even when every future
// consumer stays byte-identical. Harness technique (new Function over the snippet source)
// follows tests/sm2-behavior.test.mjs; the localStorage stub follows the memStorage()
// convention shared by tests/calib-ledger.test.mjs and tests/phase-policy.test.mjs. sessLoad
// takes nowMs as an explicit parameter (fixed epochs below), so no Date.now() monkeypatching
// is needed anywhere here. No consumer wires this snippet yet (Task 7) — these tests cover the
// snippet's own contract only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sess_capsule.js',
  import.meta.url,
), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `
  ${snippet}
  return { sessLoad: sessLoad, sessSave: sessSave, sessClear: sessClear };
`);

const AT = 1_700_000_000_000; // arbitrary fixed reference instant
const DAY_MS = 86400000;

function sampleSession(overrides) {
  return Object.assign({
    at: AT,
    expiresAt: AT + DAY_MS,
    queueIds: ['qb_mood_001', 'qb_mood_002'],
    idx: 1,
    responses: [{ id: 'qb_mood_001', correct: 1, confidence: 'certain' }],
  }, overrides);
}

test('literal key check: cw_sess_v1 appears in the snippet source as a quoted literal', () => {
  assert.ok(
    /(['"])cw_sess_v1\1/.test(snippet),
    'the store key must be a literal string inside the snippet body, not built/concatenated',
  );
});

test('signature pin: sessLoad is the snippet\'s first function line and stays under 60 chars', () => {
  const firstFnLine = snippet.split('\n').map((l) => l.trim()).find((l) => l.startsWith('function '));
  assert.equal(firstFnLine, 'function sessLoad(tool, nowMs){');
  assert.ok(firstFnLine.length < 60, `signature too long: ${firstFnLine.length} chars`);
});

// ---- round-trip --------------------------------------------------------------------

test('sessSave then sessLoad round-trips the exact session shape for a fresh store', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const session = sampleSession();
  sessSave('qbank', session);
  assert.deepEqual(sessLoad('qbank', AT), session);
});

test('sessSave persists under the literal cw_sess_v1 key in the expected {v:1,sessions:{...}} shape', () => {
  const ls = memStorage();
  const { sessSave } = make(ls);
  sessSave('qbank', sampleSession());
  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.v, 1);
  assert.ok(raw.sessions && typeof raw.sessions === 'object');
  assert.deepEqual(raw.sessions.qbank, sampleSession());
});

test('sessLoad returns null when no session exists for the requested tool', () => {
  const ls = memStorage();
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
});

// ---- 24h expiry ---------------------------------------------------------------------

test('sessLoad still returns the session just before expiresAt', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const session = sampleSession();
  sessSave('qbank', session);
  assert.deepEqual(sessLoad('qbank', session.expiresAt - 1), session);
});

test('sessLoad returns null once nowMs passes expiresAt, AND prunes the entry from the store', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const session = sampleSession();
  sessSave('qbank', session);

  const loaded = sessLoad('qbank', session.expiresAt + 1);
  assert.equal(loaded, null);

  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.sessions.qbank, undefined, 'expired entry must be pruned, not merely hidden');
  assert.equal(raw.v, 1, 'the rest of the store survives the prune');
});

test('pruning an expired tool entry does not disturb a different tool\'s live entry', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  const expired = sampleSession({ expiresAt: AT + DAY_MS });
  const live = sampleSession({ queueIds: ['qb_other_001'], expiresAt: AT + 2 * DAY_MS });
  sessSave('qbank', expired);
  sessSave('other-tool', live);

  assert.equal(sessLoad('qbank', expired.expiresAt + 1), null);

  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.sessions.qbank, undefined);
  assert.deepEqual(raw.sessions['other-tool'], live, 'sibling tool entry must survive the prune');
  assert.deepEqual(sessLoad('other-tool', expired.expiresAt + 1), live);
});

test('sessLoad defaults nowMs to Date.now() when the parameter is omitted', () => {
  const ls = memStorage();
  const { sessSave, sessLoad } = make(ls);
  // far-future expiry: stable regardless of the instant this test actually runs
  const session = sampleSession({ at: Date.now(), expiresAt: Date.now() + 100 * DAY_MS });
  sessSave('qbank', session);
  assert.deepEqual(sessLoad('qbank'), session);
});

// ---- corrupt store → null, no throw --------------------------------------------------

test('sessLoad returns null (no throw) when the stored value is corrupt JSON', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', '{not json');
  const { sessLoad } = make(ls);
  let result;
  assert.doesNotThrow(() => { result = sessLoad('qbank', AT); });
  assert.equal(result, null);
});

test('sessLoad returns null when sessions is missing or not an object', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({ v: 1 }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);

  const ls2 = memStorage();
  ls2.setItem('cw_sess_v1', JSON.stringify({ v: 1, sessions: 'nope' }));
  const { sessLoad: sessLoad2 } = make(ls2);
  assert.equal(sessLoad2('qbank', AT), null);
});

test('sessLoad returns null and prunes a per-tool entry that is malformed (missing expiresAt)', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({
    v: 1,
    sessions: { qbank: { at: AT, queueIds: ['a'], idx: 0, responses: [] } },
  }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.sessions.qbank, undefined, 'malformed entry must be pruned like an expired one');
});

test('sessLoad returns null when the per-tool entry itself is not an object', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({ v: 1, sessions: { qbank: 'nope' } }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
});

test('sessLoad silently returns null if localStorage.getItem throws — no throw escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const { sessLoad } = make(throwing);
  let result;
  assert.doesNotThrow(() => { result = sessLoad('qbank', AT); });
  assert.equal(result, null);
});

test('sessSave and sessClear silently no-op if localStorage throws — no throw escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const { sessSave, sessClear } = make(throwing);
  assert.doesNotThrow(() => sessSave('qbank', sampleSession()));
  assert.doesNotThrow(() => sessClear('qbank'));
});

// ---- v-reset ---------------------------------------------------------------------------

test('v-reset: a stored shape with v!==1 is treated as absent by sessLoad', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({
    v: 2,
    sessions: { qbank: sampleSession() },
  }));
  const { sessLoad } = make(ls);
  assert.equal(sessLoad('qbank', AT), null);
});

test('v-reset: sessSave against a v!==1 store discards the stale store and writes v:1 fresh', () => {
  const ls = memStorage();
  ls.setItem('cw_sess_v1', JSON.stringify({
    v: 2,
    sessions: { qbank: sampleSession({ queueIds: ['stale'] }) },
  }));
  const { sessSave, sessLoad } = make(ls);
  const fresh = sampleSession({ queueIds: ['fresh'] });
  sessSave('qbank', fresh);
  const raw = JSON.parse(ls.getItem('cw_sess_v1'));
  assert.equal(raw.v, 1);
  assert.deepEqual(sessLoad('qbank', AT), fresh);
});

// ---- sessClear: per-tool isolation ------------------------------------------------------

test('sessClear removes only its own tool\'s slot, leaving other tools\' sessions intact', () => {
  const ls = memStorage();
  const { sessSave, sessClear, sessLoad } = make(ls);
  const qbankSession = sampleSession();
  const otherSession = sampleSession({ queueIds: ['qb_other_001'] });
  sessSave('qbank', qbankSession);
  sessSave('other-tool', otherSession);

  sessClear('qbank');

  assert.equal(sessLoad('qbank', AT), null, 'cleared tool must be gone');
  assert.deepEqual(sessLoad('other-tool', AT), otherSession, 'sibling tool must be untouched');
});

test('sessClear on a tool with no existing session is a safe no-op', () => {
  const ls = memStorage();
  const { sessSave, sessClear, sessLoad } = make(ls);
  sessSave('other-tool', sampleSession());
  assert.doesNotThrow(() => sessClear('qbank'));
  assert.deepEqual(sessLoad('other-tool', AT), sampleSession());
});

test('sessClear against an absent store is a safe no-op (no throw, no store created)', () => {
  const ls = memStorage();
  const { sessClear } = make(ls);
  assert.doesNotThrow(() => sessClear('qbank'));
  assert.equal(ls.getItem('cw_sess_v1'), null);
});

// =====================================================================================
// Wiring pins — question-bank-practice.html consumer (Task 8). The snippet's own
// behaviour is pinned above by evaluating sess_capsule.js directly; this section pins
// the WIRING at the one consumer that exists today, mirroring the behaviour/wiring
// split tests/phase-policy.test.mjs (behaviour) vs. tests/phase-wiring.test.mjs
// (wiring) already use for the PHASE_POLICY snippet:
//   (a) the /*__SESS_CAPSULE__*/ marker appears exactly once in the tool source;
//   (b) the tool does not reimplement sessLoad/sessSave/sessClear locally — the
//       canonical bodies live in sess_capsule.js only, arriving via marker expansion;
//   (c) the literal 'cw_sess_v1' key never appears hand-typed in the tool's pre-build
//       source (only inside the injected snippet body, verified separately against
//       the BUILT output in build_and_check.sh);
//   (d) THE LOAD-BEARING CHECK: sessSave (the checkpoint write) is called from exactly
//       one place in the whole file — inside advance(), guarded so it never fires on
//       the final question (session completion clears instead of checkpointing);
//   (e) sessClear is called from exactly one place — inside showSummary(), guarded
//       behind the reviewOnly check so a faculty-preview session never writes/clears
//       a capsule slot;
//   (f) expiresAt is computed at the write site as `now + DAY` (the file's existing
//       86400000 constant), not a bare literal that could drift from the snippet's
//       own 24h contract;
//   (g) the resume path (tryResumeSession) rebuilds the queue through activeItems(),
//       so an id dropped by a deploy between checkpoint and resume is filtered out
//       rather than crashing the restore.
const QBANK = '13_Faculty_Resources/_automation/site_build/question-bank-practice.html';
const SESS_MARKER = '/*__SESS_CAPSULE__*/';
const qbankSrc = readFileSync(new URL(`../${QBANK}`, import.meta.url), 'utf8');

// ---- (a) marker present exactly once -----------------------------------------------

test('question-bank-practice.html carries the SESS_CAPSULE marker exactly once', () => {
  const count = qbankSrc.split(SESS_MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${SESS_MARKER} in ${QBANK}, found ${count}`);
});

// ---- (b) no local reimplementation of the canonical functions ----------------------

test('question-bank-practice.html does not reimplement sessLoad/sessSave/sessClear locally', () => {
  assert.doesNotMatch(qbankSrc, /function\s+sessLoad\s*\(/,
    'sessLoad must arrive only via the injected /*__SESS_CAPSULE__*/ marker');
  assert.doesNotMatch(qbankSrc, /function\s+sessSave\s*\(/,
    'sessSave must arrive only via the injected /*__SESS_CAPSULE__*/ marker');
  assert.doesNotMatch(qbankSrc, /function\s+sessClear\s*\(/,
    'sessClear must arrive only via the injected /*__SESS_CAPSULE__*/ marker');
});

// ---- (c) literal cw_sess_v1 absent from the pre-build source -----------------------

test("literal 'cw_sess_v1' is absent from question-bank-practice.html's source (present only after marker expansion)", () => {
  assert.doesNotMatch(qbankSrc, /(['"])cw_sess_v1\1/,
    'the cw_sess_v1 key must reach question-bank-practice.html solely through the injected '
    + 'snippet body, never hand-typed in the consumer source');
});

// ---- (d) THE LOAD-BEARING CHECK: checkpoint write is reachable only from advance() --

function extractFn(src, signature, label) {
  const re = new RegExp(`function ${signature}\\{[\\s\\S]*?\\n\\}`);
  const m = src.match(re);
  assert.ok(m, `${label} function body not found`);
  // Nonzero-extraction guard: everything below is pinned against THIS captured
  // substring, not the whole file — a length floor also catches a regex that matched
  // some degenerate near-empty function body instead of the real one.
  assert.ok(m[0].length > 40, `${label} match is suspiciously short (${m[0].length} chars): ${JSON.stringify(m[0])}`);
  return m[0];
}

test('checkpointSession() is called from exactly one call site in the whole file, inside advance()', () => {
  // Call-site form `checkpointSession();` (trailing semicolon) is distinct from the
  // `function checkpointSession(){` declaration line, which is followed by `{` — both
  // share the substring `checkpointSession()`, so the semicolon anchor is load-bearing
  // for telling a call site apart from the declaration itself.
  const advanceBody = extractFn(qbankSrc, 'advance\\(\\)', 'advance()');
  const callsInAdvance = advanceBody.match(/checkpointSession\(\);/g) || [];
  assert.equal(callsInAdvance.length, 1,
    `expected exactly one checkpointSession() call inside advance(), found ${callsInAdvance.length}`);

  const allCalls = qbankSrc.match(/checkpointSession\(\);/g) || [];
  assert.equal(allCalls.length, 1,
    `checkpointSession() must be called from exactly one site (advance()); found ${allCalls.length} total call sites`);
});

test('checkpointSession() is guarded so it is a no-op for a reviewOnly session', () => {
  const body = extractFn(qbankSrc, 'checkpointSession\\(\\)', 'checkpointSession()');
  assert.match(body, /if\s*\(\s*!SESSION\s*\|\|\s*SESSION\.reviewOnly\s*\)\s*return;/,
    'checkpointSession() must return early for a reviewOnly (faculty-preview) session');
});

test('advance() only checkpoints when there is a next question — never on the final increment', () => {
  const advanceBody = extractFn(qbankSrc, 'advance\\(\\)', 'advance()');
  assert.match(advanceBody, /if\s*\(\s*SESSION\.idx\s*<\s*SESSION\.queue\.length\s*\)\s*checkpointSession\(\);/,
    'the checkpoint write must be conditioned on there being a next question to resume into');
});

// ---- (e) sessClear is called from exactly one place, guarded by reviewOnly ---------

test('sessClear is called from exactly one call site in the whole file, inside showSummary()', () => {
  const summaryBody = extractFn(qbankSrc, 'showSummary\\(\\)', 'showSummary()');
  const callsInSummary = summaryBody.match(/sessClear\('qbank'\)/g) || [];
  assert.equal(callsInSummary.length, 1,
    `expected exactly one sessClear('qbank') call inside showSummary(), found ${callsInSummary.length}`);

  const allCalls = qbankSrc.match(/sessClear\(/g) || [];
  assert.equal(allCalls.length, 1,
    `sessClear must be called from exactly one site (showSummary()); found ${allCalls.length} total call sites`);
});

test('showSummary() guards sessClear behind the reviewOnly check', () => {
  const summaryBody = extractFn(qbankSrc, 'showSummary\\(\\)', 'showSummary()');
  assert.match(summaryBody, /if\s*\(\s*!\s*\(\s*SESSION\s*&&\s*SESSION\.reviewOnly\s*\)\s*\)\s*sessClear\('qbank'\);/,
    "showSummary() must gate sessClear('qbank') behind a check that the session is not reviewOnly");
});

// ---- (f) expiresAt computed at the write site as now + DAY -------------------------

test('checkpointSession() computes expiresAt as now + DAY at the write site (not a bare literal)', () => {
  const body = extractFn(qbankSrc, 'checkpointSession\\(\\)', 'checkpointSession()');
  assert.match(body, /expiresAt:\s*now\s*\+\s*DAY/,
    'expiresAt must be computed as now + DAY at the write site — the snippet itself does not '
    + 'stamp it (sessLoad/sessSave take the caller-provided session as-is)');
  // DAY must be the file's existing 86400000 constant, not a second one that could drift.
  assert.match(qbankSrc, /var DAY\s*=\s*86400000;/,
    'checkpointSession() must reuse the file\'s single existing DAY constant');
});

test('checkpointSession() writes exactly one sessSave call in the whole file', () => {
  const allCalls = qbankSrc.match(/sessSave\(/g) || [];
  assert.equal(allCalls.length, 1,
    `sessSave must be called from exactly one site (checkpointSession()); found ${allCalls.length} total call sites`);
});

test('checkpointSession() never persists item/key/twoTierResult grading fields — only id/correct/confidence per response', () => {
  const body = extractFn(qbankSrc, 'checkpointSession\\(\\)', 'checkpointSession()');
  const respMap = body.match(/responses:\s*SESSION\.responses\.map\(function\(r\)\{[\s\S]*?\}\)/);
  assert.ok(respMap, 'responses mapping not found inside checkpointSession()');
  assert.match(respMap[0], /\{\s*id:\s*r\.item\.id,\s*correct:\s*r\.correct,\s*confidence:\s*r\.confidence\s*\}/,
    'each checkpointed response must carry only {id, correct, confidence} — grading state '
    + '(key, tier2Key, twoTierResult, the full item) already persists per-interaction via '
    + 'qbRecord()/srsUpdate() and must never be duplicated into the capsule');
});

// ---- (g) resume path filters the rebuilt queue through activeItems() ---------------

test('tryResumeSession() calls sessLoad exactly once and is the only sessLoad call site', () => {
  const allCalls = qbankSrc.match(/sessLoad\(/g) || [];
  assert.equal(allCalls.length, 1,
    `sessLoad must be called from exactly one site (tryResumeSession()); found ${allCalls.length} total call sites`);
  const body = extractFn(qbankSrc, 'tryResumeSession\\(\\)', 'tryResumeSession()');
  const callsInBody = body.match(/sessLoad\(/g) || [];
  assert.equal(callsInBody.length, 1, "sessLoad must be called inside tryResumeSession()'s own body");
});

test('tryResumeSession() rebuilds the queue by mapping queueIds through an activeItems()-sourced lookup, dropping unmapped ids', () => {
  const body = extractFn(qbankSrc, 'tryResumeSession\\(\\)', 'tryResumeSession()');
  assert.match(body, /activeItems\(\)\.forEach\(/,
    'the id lookup table must be built from activeItems(), not the raw unfiltered BANK.items — '
    + 'a retired item must not be resumable into the queue');
  assert.match(body, /cap\.queueIds\.map\(function\(id\)\{\s*return idMap\[id\];\s*\}\)\.filter\(Boolean\)/,
    'queueIds must be mapped through the activeItems()-sourced idMap and filtered for missing '
    + 'entries — an id removed or retired by a deploy between checkpoint and resume must be '
    + 'dropped, not crash the restore');
});

test('tryResumeSession() bails out (returns false) before mutating SESSION when the capsule is absent/expired or the queue is empty', () => {
  const body = extractFn(qbankSrc, 'tryResumeSession\\(\\)', 'tryResumeSession()');
  assert.match(body, /if\s*\(\s*!cap\s*\|\|\s*!cap\.queueIds\s*\|\|\s*!cap\.queueIds\.length\s*\)\s*return false;/,
    'an absent/expired capsule (sessLoad returns null) must fall through to a normal start, not throw');
  assert.match(body, /if\s*\(\s*!queue\.length\s*\)\s*return false;/,
    'a queue that filters down to empty (every id dropped) must also fall through to a normal start');
});

test('resume boot path is gated on RESUME_REQUESTED and only consulted after the faculty-preview review-context branch', () => {
  const reviewIdx = qbankSrc.indexOf('showReviewItem(reviewItem);');
  const resumeIdx = qbankSrc.indexOf('if(RESUME_REQUESTED && tryResumeSession()) return;');
  assert.ok(reviewIdx >= 0, 'review-context branch not found in init()');
  assert.ok(resumeIdx >= 0, 'RESUME_REQUESTED boot check not found in init()');
  assert.ok(resumeIdx > reviewIdx,
    'the resume check must come after the review-context branch — a faculty-preview request '
    + 'must never be diverted into a resumed practice session');
});
