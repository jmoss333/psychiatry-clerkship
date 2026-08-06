// Behavioural contract for the home metacognition panel (renderCalibPanel), sliced out of
// spa_index.html between its deliberate markers and evaluated for real — a threshold, gating,
// or population regression turns these red even when the wrapping renderHome() logic stays
// byte-identical. Slicing technique follows tests/srs-home-counters.test.mjs; the memStorage()
// convention follows tests/calib-ledger.test.mjs / tests/qbank-draft-visibility.test.mjs.
//
// renderCalibPanel() takes no arguments — it reaches out to two ambient things: the injected
// calibRead() (stubbed here, since the real /*__CALIB_LOG__*/ body is a separate snippet file
// already pinned by tests/calib-ledger.test.mjs) and localStorage's 'cw_qb_v1' (stubbed via
// memStorage()). Both are passed into the `new Function` harness so the sliced source runs
// unmodified.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

const panelCode = slice(source, '/* ---- calib panel ---- */', '/* ---- end calib panel ---- */');

test('the calib panel marker pair appears exactly once in spa_index.html', () => {
  const startCount = source.split('/* ---- calib panel ---- */').length - 1;
  const endCount = source.split('/* ---- end calib panel ---- */').length - 1;
  assert.equal(startCount, 1, 'expected exactly one calib-panel start marker');
  assert.equal(endCount, 1, 'expected exactly one calib-panel end marker');
});

function memStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const build = new Function('localStorage', 'calibRead', `
  ${panelCode}
  return renderCalibPanel;
`);

function makePanel(qb, rev, qbv1) {
  const ls = memStorage(qbv1 ? { cw_qb_v1: JSON.stringify(qbv1) } : {});
  const calibRead = () => ({ v: 1, qb: qb || [], rev: rev || [] });
  return build(ls, calibRead);
}

function qbEvent(p, a, re) {
  return { s: 'qb', id: 'q_x', pages: [], p, a, re, ts: Date.now() };
}

function twentyFillerEvents(n) {
  // Generic re===0 'guess' events, used purely to clear the >=20 whole-panel gate without
  // affecting the bin under test in a given scenario.
  const out = [];
  for (let i = 0; i < n; i++) out.push(qbEvent('guess', i % 2, 0));
  return out;
}

test('empty-below-threshold: fewer than 20 qb ledger events falls back (returns "")', () => {
  const renderCalibPanel = makePanel(twentyFillerEvents(19), []);
  assert.equal(renderCalibPanel(), '');
});

test('at exactly 20 qb ledger events the panel renders (non-empty)', () => {
  const renderCalibPanel = makePanel(twentyFillerEvents(20), []);
  assert.notEqual(renderCalibPanel(), '');
});

test('bin n>=5 gating: a confidence bin only renders its bar once it has >=5 (re===0) events', () => {
  const qb = []
    .concat(Array.from({ length: 10 }, () => qbEvent('certain', 1, 0))) // n=10 -> renders
    .concat(Array.from({ length: 4 }, () => qbEvent('likely', 1, 0)))   // n=4  -> does NOT render
    .concat(Array.from({ length: 11 }, () => qbEvent('guess', 0, 0)));  // n=11 -> renders
  const renderCalibPanel = makePanel(qb, []);
  const out = renderCalibPanel();
  assert.notEqual(out, '');
  const rowCount = (out.match(/class="brow"/g) || []).length;
  assert.equal(rowCount, 2, `expected exactly 2 rendered confidence bars, got ${rowCount}`);
  assert.match(out, /<span class="lab">Certain<\/span>/);
  assert.match(out, /<span class="lab">Guess<\/span>/);
  assert.doesNotMatch(out, /<span class="lab">Likely<\/span>/);
});

test('re===1 events are excluded from bin accuracy and from the n>=5 gate', () => {
  // 'certain' has 8 events total, but 5 of them are same-day re-attempts (re===1) — only 3
  // qualify (re===0), which is under the n>=5 floor, so the bin must NOT render even though
  // the raw event count for that p-value is 8.
  const qb = []
    .concat(Array.from({ length: 5 }, () => qbEvent('certain', 1, 1))) // re-attempts, excluded
    .concat(Array.from({ length: 3 }, () => qbEvent('certain', 1, 0))) // n=3 (re===0) -> under floor
    .concat(Array.from({ length: 12 }, () => qbEvent('guess', 1, 0))); // n=12 -> renders, pads total to 20
  const renderCalibPanel = makePanel(qb, []);
  const out = renderCalibPanel();
  assert.notEqual(out, '');
  assert.doesNotMatch(out, /<span class="lab">Certain<\/span>/,
    'certain bin must stay hidden: only 3 of its 8 events have re===0, under the n>=5 floor');
  assert.match(out, /<span class="lab">Guess<\/span>/);
});

test('re===1 events do not skew a bin\'s accuracy math once it does qualify', () => {
  // 'certain': 5 wrong re===1 events (would drag accuracy to 0% if counted) + 5 correct
  // re===0 events. If re===1 events leaked into the bin, accuracy would read 50%; excluding
  // them correctly, all 5 counted events are correct -> 100%.
  const qb = []
    .concat(Array.from({ length: 5 }, () => qbEvent('certain', 0, 1))) // wrong, re-attempt, excluded
    .concat(Array.from({ length: 5 }, () => qbEvent('certain', 1, 0))) // correct, counted
    .concat(Array.from({ length: 10 }, () => qbEvent('guess', 1, 0)));
  const renderCalibPanel = makePanel(qb, []);
  const out = renderCalibPanel();
  assert.match(out, /<span class="pc">100% · 5<\/span>/, 'certain bin must read 100% from the 5 re===0 events only');
});

test('confidently-wrong count is sourced from cw_qb_v1 certWrong records, not the ledger', () => {
  const qbv1 = {
    a: { correct: false, confidence: 'certain', certWrong: true },
    b: { correct: false, confidence: 'certain', certWrong: true },
    c: { correct: true, confidence: 'certain' }, // not certWrong
  };
  const ledgerA = twentyFillerEvents(20);
  const renderA = makePanel(ledgerA, [], qbv1);
  const outA = renderA();
  assert.match(outA, /confidently wrong<\/strong> on 2 items/);

  // Swap in a very different ledger (more events, different composition, including several
  // 'certain'+wrong re===0 events that would inflate a ledger-derived count) while keeping
  // cw_qb_v1 identical — the confidently-wrong count must not move, proving it is NOT derived
  // from calibRead().qb.
  const ledgerB = twentyFillerEvents(20).concat(
    Array.from({ length: 6 }, () => qbEvent('certain', 0, 0)), // would read as 6 "wrong+certain" in the ledger
  );
  const renderB = makePanel(ledgerB, [], qbv1);
  const outB = renderB();
  assert.match(outB, /confidently wrong<\/strong> on 2 items/,
    'confidently-wrong count must stay 2 (from cw_qb_v1) even though the ledger fixture changed');
});

test('confidently-wrong count and its practice link are omitted entirely when zero', () => {
  const renderCalibPanel = makePanel(twentyFillerEvents(20), [], { a: { correct: true, confidence: 'certain' } });
  const out = renderCalibPanel();
  assert.doesNotMatch(out, /confidently wrong/);
  assert.doesNotMatch(out, /data-f="question-bank-practice\.html"/);
});

function revEvent(id, p, sug, tsDate) {
  return { s: 'rev', id, p, sug, a: p === 'Again' ? 0 : 1, rq: 0, ts: tsDate.getTime() };
}

test('review-divergence dedups by unique card id per local day: same card twice same day counts once', () => {
  const day1 = new Date(2026, 6, 1, 9, 0, 0);
  const day1Later = new Date(2026, 6, 1, 20, 0, 0); // same calendar day, different time
  const rev = [
    revEvent('card_1', 'Hard', 'Again', day1),
    revEvent('card_1', 'Good', 'Again', day1Later), // same id, same local day -> not a second count
  ];
  const renderCalibPanel = makePanel(twentyFillerEvents(20), rev);
  const out = renderCalibPanel();
  assert.match(out, /higher than the app suggested on 1 card/);
});

test('review-divergence counts the same card again on a different local day', () => {
  const day1 = new Date(2026, 6, 1, 9, 0, 0);
  const day2 = new Date(2026, 6, 2, 9, 0, 0);
  const rev = [
    revEvent('card_1', 'Hard', 'Again', day1),
    revEvent('card_1', 'Hard', 'Again', day2),
  ];
  const renderCalibPanel = makePanel(twentyFillerEvents(20), rev);
  const out = renderCalibPanel();
  assert.match(out, /higher than the app suggested on 2 cards/);
});

test('review-divergence only counts sug===\'Again\' && p!==\'Again\' events', () => {
  const day = new Date(2026, 6, 1, 9, 0, 0);
  const rev = [
    revEvent('card_1', 'Again', 'Again', day),  // agreed with the suggestion -> not a divergence
    revEvent('card_2', 'Good', 'Good', day),    // suggestion wasn't 'Again' at all -> not a divergence
    revEvent('card_3', 'Easy', 'Again', day),   // diverged -> counts
  ];
  const renderCalibPanel = makePanel(twentyFillerEvents(20), rev);
  const out = renderCalibPanel();
  assert.match(out, /higher than the app suggested on 1 card\b/);
});

test('review-divergence line is omitted entirely when zero', () => {
  const renderCalibPanel = makePanel(twentyFillerEvents(20), []);
  const out = renderCalibPanel();
  assert.doesNotMatch(out, /higher than the app suggested/);
});
