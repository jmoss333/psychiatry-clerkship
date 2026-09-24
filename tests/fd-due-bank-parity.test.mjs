// Today's practice-bank due count must be the number the practice bank itself serves.
//
// Today's due row now sends the bank's share of what is due to the bank (fdDueRow, fd_due.js):
// "Practice bank · N due for review", or the row's own control when only bank cards are due.
// The learner lands on the bank's setup screen, whose "Due for review (N)" button is built by
// dueQbItems(). If those two N's disagree the row is making the promise the fix exists to stop
// making -- a count that the place it opens cannot clear. The rules live in two files (the
// shell's dueBreakdown + qbRecordServable, and the tool's dueQbItems + activeItems), so this
// runs the REAL functions from both on ONE store and asserts they agree, across the three
// servability cases (attested, draft with and without the opt-in, retired).
//
// The shell's retired/draft id lists are build-injected (build_deploy.py derives them from
// question_bank.json); the derivation is reproduced here from the same file, so a change to
// either rule turns this red rather than drifting.
//
// Not covered, deliberately: a QB# card whose item was DELETED from question_bank.json rather
// than retired. The shell is only told the retired and draft ids, so it would still count that
// card while the bank drops it. Items are retired, not deleted (retired near-duplicates stay in
// the file with `retired: true`), so the fixture uses real, present ids only; the last test
// pins that gap by name so it cannot pass silently for a reason nobody wrote down.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
const tool = readFileSync(new URL(`${BUILD}/question-bank-practice.html`, import.meta.url), 'utf8');
const BANK = JSON.parse(readFileSync(new URL('../question_bank.json', import.meta.url), 'utf8'));

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// build_deploy.py's derivation, verbatim in intent.
const items = BANK.items || [];
const RETIRED = items.filter((i) => i.retired).map((i) => i.id).sort();
const DRAFT = items.filter((i) => !i.retired && i.status !== 'attested').map((i) => i.id).sort();

// eslint-disable-next-line no-new-func
const shellDue = new Function('localStorage', 'RETIRED_IDS', 'DRAFT_IDS', `
  ${slice(shell, '/* ---- qb servability (shell parity) ----', '/* ---- end qb servability ----')}
  ${slice(shell, 'function srsState(', '/* ---- end due breakdown ----')}
  RETIRED_QB_IDS = RETIRED_IDS; DRAFT_QB_IDS = DRAFT_IDS;
  return dueBreakdown().qb.due;
`);

// eslint-disable-next-line no-new-func
const bankDue = new Function('BANK', 'localStorage', `
  ${slice(tool, 'function lsGet(', 'function qbRecord(')}
  ${slice(tool, 'function srsLoad(', 'function srsSave(')}
  ${slice(tool, 'function includeDrafts(', '/* ---- rendering helpers')}
  return dueQbItems().length;
`);

const past = Date.now() - 2 * 86400000;
const future = Date.now() + 2 * 86400000;
const pick = (pred, what) => {
  const it = items.find(pred);
  assert.ok(it, `question_bank.json has no ${what} item to build the fixture from`);
  return it.id;
};
const ATTESTED = pick((i) => !i.retired && i.status === 'attested', 'attested');
const ATTESTED_2 = pick((i) => !i.retired && i.status === 'attested' && i.id !== ATTESTED, 'second attested');
const DRAFT_ID = pick((i) => !i.retired && i.status !== 'attested', 'draft');
const RETIRED_ID = pick((i) => i.retired, 'retired');

function store(optIn) {
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    [`QB#${ATTESTED}`]: { due: past },
    [`QB#${ATTESTED_2}`]: { due: future }, // scheduled, not due: neither side may count it
    [`QB#${DRAFT_ID}`]: { due: past },
    [`QB#${RETIRED_ID}`]: { due: past },
    'AR-50#0': { due: past }, // a Daily Review card: in the store, never the bank's business
  } }));
  // setIncludeDrafts() persists through lsSet (JSON), so the stored opt-in string is 'true'.
  if (optIn) ls.setItem('cw_qb_drafts_v1', 'true');
  return ls;
}

test('Today and the practice bank count the same due cards: attested only by default', () => {
  const ls = store(false);
  assert.equal(bankDue(BANK, ls), 1);
  assert.equal(shellDue(ls, RETIRED, DRAFT), bankDue(BANK, ls));
});

test('the draft opt-in moves both counts together', () => {
  const ls = store(true);
  assert.equal(bankDue(BANK, ls), 2);
  assert.equal(shellDue(ls, RETIRED, DRAFT), bankDue(BANK, ls));
});

test('a retired item is never due on either surface', () => {
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: { [`QB#${RETIRED_ID}`]: { due: past } } }));
  ls.setItem('cw_qb_drafts_v1', 'true');
  assert.equal(bankDue(BANK, ls), 0);
  assert.equal(shellDue(ls, RETIRED, DRAFT), 0);
});

test('the one known gap is still the only one: a deleted item counts on Today, not in the bank', () => {
  // If this starts failing because the shell learned the full id list, the gap is closed:
  // delete this test and the paragraph at the top of the file that describes it.
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: { 'QB#qb_deleted_999': { due: past } } }));
  assert.ok(!items.some((i) => i.id === 'qb_deleted_999'), 'the fixture id must not exist in the bank');
  assert.equal(bankDue(BANK, ls), 0);
  assert.equal(shellDue(ls, RETIRED, DRAFT), 1);
});
