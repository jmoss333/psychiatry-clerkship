// Behavioural tests for the home SRS counters and the phantom-TOPIC# guard.
// Pattern follows tests/qbank-draft-visibility.test.mjs: slice the real functions
// out of the shipped single-file source and execute them — text-only assertions
// are exactly how "Due today counts cards nothing can serve" survived.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');
const lpSource = readFileSync(new URL(
  '../01_Six_Week_Curriculum/learning-path.html',
  import.meta.url,
), 'utf8');

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

const seedCode = slice(source, 'function topicHasQuiz(', '/* ---- end srs seed + phantom migration ----');
const dueCode = slice(source, 'function srsState(', '/* ---- end due breakdown ----');

// eslint-disable-next-line no-new-func
const makeSrs = new Function('localStorage', 'TOPIC_META', 'document', `
  var window = {};
  ${seedCode}
  ${dueCode}
  return { topicHasQuiz: topicHasQuiz, seedSRS: seedSRS,
    srsDropPhantomTopics: srsDropPhantomTopics, srsBucket: srsBucket,
    dueBreakdown: dueBreakdown, dueCount: dueCount };
`);

const docStub = { getElementById: () => null };
const QUIZ_META = { 'mse.md': { quiz: { q: 'Q?', o: [{ t: 'A', c: true }] } }, 'week1.md': {} };

test('seedSRS refuses to seed a TOPIC# card for a page with no servable quiz', () => {
  const ls = memStorage();
  const srs = makeSrs(ls, QUIZ_META, docStub);
  srs.seedSRS('week1.md');
  assert.equal(ls.getItem('cw_srs_v1'), null, 'quizless page must not create a card');
  srs.seedSRS('mse.md');
  const s = JSON.parse(ls.getItem('cw_srs_v1'));
  assert.ok(s.cards['TOPIC#mse.md'], 'quiz-backed page seeds normally');
});

test('srsDropPhantomTopics removes only never-graded quizless TOPIC# cards', () => {
  const ls = memStorage();
  const now = Date.now();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'TOPIC#week1.md': { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: now, last: 0 },
    'TOPIC#mse.md': { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: now, last: 0 },
    'TOPIC#gone.md': { ease: 2.5, ivl: 3, reps: 2, lapses: 0, due: now, last: 0 },
    'QB#qb_moo_001': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: now, last: 0 },
  } }));
  const srs = makeSrs(ls, QUIZ_META, docStub);
  srs.srsDropPhantomTopics();
  const s = JSON.parse(ls.getItem('cw_srs_v1'));
  assert.equal(s.cards['TOPIC#week1.md'], undefined, 'phantom (reps 0, no quiz) dropped');
  assert.ok(s.cards['TOPIC#mse.md'], 'quiz-backed card kept');
  assert.ok(s.cards['TOPIC#gone.md'], 'graded card kept even without a quiz');
  assert.ok(s.cards['QB#qb_moo_001'], 'non-TOPIC cards untouched');
});

test('empty TOPIC_META (fetch failed) never triggers the migration', () => {
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'TOPIC#week1.md': { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: 1, last: 0 },
  } }));
  const srs = makeSrs(ls, {}, docStub);
  srs.srsDropPhantomTopics();
  assert.ok(JSON.parse(ls.getItem('cw_srs_v1')).cards['TOPIC#week1.md'],
    'no metadata means no evidence a card is phantom — leave the store alone');
});

test('dueBreakdown buckets by prefix; dueCount reports Daily-Review-servable only', () => {
  const ls = memStorage();
  const past = Date.now() - 60000;
  const twoDaysAgo = Date.now() - 86400000 * 2;
  const future = Date.now() + 86400000;
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'deck#0#1': { due: past },
    'TOPIC#mse.md': { due: twoDaysAgo },
    'QB#qb_moo_001': { due: past },
    'QB#qb_moo_002': { due: future },
    'FAM#collateral_baseline_safety_001#opening': { due: past },
    'REAS#case#step': { due: past },
  } }));
  const srs = makeSrs(ls, QUIZ_META, docStub);
  const b = srs.dueBreakdown();
  assert.equal(b.daily.due, 2);
  assert.equal(b.daily.overdue, 1);
  assert.equal(b.qb.due, 1);
  assert.equal(b.fam.due, 1);
  assert.equal(b.other.due, 1);
  assert.deepEqual(srs.dueCount(), { due: 2, overdue: 1 });
});

test('learning-path srsDue counts only Daily-Review-servable prefixes', () => {
  const lpCode = slice(lpSource, 'function srsDue(', 'function srsLabel(');
  // eslint-disable-next-line no-new-func
  const srsDue = new Function('localStorage', `${lpCode} return srsDue();`);
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'deck#0#1': { due: Date.now() - 1000 },
    'QB#qb_moo_001': { due: Date.now() - 1000 },
    'FAM#x#y': { due: Date.now() - 1000 },
  } }));
  assert.deepEqual(srsDue(ls), { due: 1, started: true });
});
