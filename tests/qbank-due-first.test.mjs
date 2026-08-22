// Behavioral contract for due-first practice serving (the "make resurfacing real"
// follow-up to #344's honesty fixes). The tool has written QB# cards to cw_srs_v1
// since SRS seeding landed, but nothing ever read the schedule — Daily Review serves
// TOPIC# only. dueQbItems() + the startSession merge make the schedule real: due
// cards return at the FRONT of the next session, most-overdue first, within the
// session's own filters and size limit, and a retired item can never resurface.
//
// Method: extract the REAL function sources from question-bank-practice.html and
// execute them under stubs (same idiom as mastery-weakflag / calib-ledger suites).
// The shell-side parity pins at the bottom guard the RETIRED_QB_IDS plumbing that
// check-static-site.mjs §6c enforces on built output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = '13_Faculty_Resources/_automation/site_build/question-bank-practice.html';
const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const toolSrc = fs.readFileSync(path.join(repo, TOOL), 'utf8');
const spaSrc = fs.readFileSync(path.join(repo, SPA), 'utf8');

function extract(re, label) {
  const m = toolSrc.match(re);
  assert.ok(m, `${label} not found in ${TOOL}`);
  return m[0];
}

const srsLoadSrc = extract(/function srsLoad\(\)\{[\s\S]*?\n\}/, 'srsLoad()');
const includeDraftsSrc = extract(/function includeDrafts\(\)\{[\s\S]*?\}/, 'includeDrafts()');
const activeItemsSrc = extract(/function activeItems\(\)\{[\s\S]*?\n\}/, 'activeItems()');
const dueQbItemsSrc = extract(/function dueQbItems\(\)\{[\s\S]*?\n\}/, 'dueQbItems()');
const buildQueueSrc = extract(/function buildQueue\([\s\S]*?\n\}/, 'buildQueue()');
const startSessionSrc = extract(/function startSession\(catFilter[\s\S]*?\n\}/, 'startSession()');

function item(id, category, difficulty, retired = false, status = 'attested') {
  const it = { id, category, difficulty, stem: `stem ${id}`, options: [], status };
  if (retired) it.retired = true;
  return it;
}

// Runs the real sources. srsCards: {'QB#<id>': {due:<ms>}}. Returns the queue that
// beginSession received. shuffle is stubbed to identity so order is assertable.
// draftsOn seeds the cw_qb_drafts_v1 opt-in that includeDrafts() reads (WP-37:
// attested-only by default), routed through the same lsGet stub as the SRS state.
function run(bankItems, srsCards, [cat, diff, size], draftsOn = false) {
  const harness = new Function('BANK', 'srsRaw', 'NOW', 'cat', 'diff', 'size', 'draftsOn', `
    var captured = null;
    function lsGet(k){ if (k === 'cw_qb_drafts_v1') return draftsOn === true; return srsRaw; }
    function shuffle(a){ return a.slice(); }
    function beginSession(queue){ captured = queue; }
    var _realNow = Date.now; Date.now = function(){ return NOW; };
    ${srsLoadSrc}
    ${includeDraftsSrc}
    ${activeItemsSrc}
    ${dueQbItemsSrc}
    ${buildQueueSrc}
    ${startSessionSrc}
    try { startSession(cat, diff, size); } finally { Date.now = _realNow; }
    return captured;
  `);
  return harness({ items: bankItems }, { v: 1, cards: srsCards }, 1_000_000, cat, diff, size, draftsOn);
}

const BANK = [
  item('qb_a', 'mood', 2),
  item('qb_b', 'mood', 2),
  item('qb_c', 'psychosis', 2),
  item('qb_d', 'mood', 1),
  item('qb_e', 'mood', 2, /* retired */ true),
  item('qb_f', 'mood', 2),
  item('qb_g', 'mood', 2, false, /* draft */ 'draft'),
];

test('due cards serve first, most-overdue first, then the fresh selection', () => {
  const queue = run(BANK, {
    'QB#qb_b': { due: 900_000 },   // overdue by more
    'QB#qb_a': { due: 990_000 },   // overdue by less
  }, ['all', 'all', 'all']);
  assert.deepEqual(queue.slice(0, 2).map(it => it.id), ['qb_b', 'qb_a']);
  const rest = queue.slice(2).map(it => it.id);
  assert.ok(!rest.includes('qb_a') && !rest.includes('qb_b'), 'due items must not repeat');
  assert.ok(!queue.some(it => it.id === 'qb_e'), 'retired items never serve');
});

test('a card that is not yet due is not promoted to the front', () => {
  // qb_c sits third in the bank; with shuffle stubbed to identity, promotion would put
  // it first and no promotion leaves the natural order intact.
  const queue = run(BANK, {
    'QB#qb_c': { due: 2_000_000 }, // future
  }, ['all', 'all', 'all']);
  assert.equal(queue[0].id, 'qb_a', 'no due items => natural (identity-shuffled) order holds');
  assert.notEqual(queue[0].id, 'qb_c');
  assert.ok(queue.some(it => it.id === 'qb_c'), 'not-due items remain servable normally');
});

test('due-first respects the session filters', () => {
  const queue = run(BANK, {
    'QB#qb_c': { due: 900_000 },   // psychosis — filtered out
    'QB#qb_d': { due: 950_000 },   // mood but difficulty 1 — filtered out
    'QB#qb_a': { due: 990_000 },   // mood, difficulty 2 — qualifies
  }, ['mood', '2', 'all']);
  assert.equal(queue[0].id, 'qb_a');
  assert.ok(!queue.some(it => it.id === 'qb_c'), 'category filter applies to due cards');
  assert.ok(!queue.some(it => it.id === 'qb_d'), 'difficulty filter applies to due cards');
});

test('the size limit caps due items plus remainder together', () => {
  const queue = run(BANK, {
    'QB#qb_a': { due: 900_000 },
    'QB#qb_b': { due: 910_000 },
    'QB#qb_f': { due: 920_000 },
  }, ['all', 'all', '2']);
  assert.equal(queue.length, 2);
  assert.deepEqual(queue.map(it => it.id), ['qb_a', 'qb_b']);
});

test('a due card for a RETIRED item never resurfaces even with valid schedule state', () => {
  const queue = run(BANK, {
    'QB#qb_e': { due: 1 }, // maximally overdue, but the item is retired
  }, ['all', 'all', 'all']);
  assert.ok(!queue.some(it => it.id === 'qb_e'));
});

test('empty or malformed schedule state degrades to the normal shuffled session', () => {
  const queue = run(BANK, {}, ['all', 'all', 'all']);
  assert.equal(queue.length,
    BANK.filter(it => !it.retired && it.status === 'attested').length,
    'the default session is the attested-only pool');
});

test('a due card for a DRAFT item does not resurface by default (WP-37 attested-only pool)', () => {
  const queue = run(BANK, {
    'QB#qb_g': { due: 1 }, // maximally overdue, but the item is an un-attested draft
  }, ['all', 'all', 'all']);
  assert.ok(!queue.some(it => it.id === 'qb_g'),
    'a draft card must not resurface while the learner has not opted in');
  assert.ok(!queue.some(it => it.id === 'qb_e'), 'retired stays excluded too');
});

test('with the draft opt-in set, a due draft card resurfaces first again', () => {
  const queue = run(BANK, {
    'QB#qb_g': { due: 1 },
  }, ['all', 'all', 'all'], /* draftsOn */ true);
  assert.equal(queue[0].id, 'qb_g', 'opted-in learners get the full due-first behaviour');
  assert.ok(!queue.some(it => it.id === 'qb_e'),
    'the opt-in widens the pool to drafts only — never to retired items');
});

// ---- shell parity plumbing (RETIRED_QB_IDS / DRAFT_QB_IDS) -------------------------

test('the shell carries exactly one empty needle of each kind for the build to fill', () => {
  for (const needle of ['var RETIRED_QB_IDS=[];', 'var DRAFT_QB_IDS=[];']) {
    assert.equal(spaSrc.split(needle).length - 1, 1,
      `build_deploy.py verified-replaces ${needle}; zero or two copies breaks the injection`);
  }
});

test('both shell calibration counters count only servable records (not retired; drafts only when opted in)', () => {
  const summary = spaSrc.match(/function calibrationSummary\(\)\{[\s\S]*?\n  \}/);
  assert.ok(summary, 'calibrationSummary not found');
  assert.match(summary[0], /qbRecordServable\(id\)/,
    'calibrationSummary must apply the shared servability rule');
  const panel = spaSrc.match(/function renderCalibPanel\(\)\{[\s\S]*?\n  \}/);
  assert.ok(panel, 'renderCalibPanel not found');
  assert.match(panel[0], /qbRecordServable\(id\)/,
    'renderCalibPanel certWrong count must apply the shared servability rule');
});
