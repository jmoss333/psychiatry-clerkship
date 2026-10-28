// Behavioural contract for outcome_tally.js (L8 outcomes design, DRAFT) and its nesting in
// calib_log.js. Evaluates the real snippet bodies, the way tests/calib-ledger.test.mjs does.
//
// What this pins:
//   (a) OFF is total: with no CW_OUTCOMES stamp, or with no cwAnalytics emitter, calibLog()
//       records nothing, whatever it is fed;
//   (b) ON sends only fixed keys at fixed thresholds, each one on the metrics allowlist;
//   (c) every record() argument in the snippet is a single string literal;
//   (d) the tally never changes what calibLog writes to cw_calib_v1.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dir = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const calib = readFileSync(new URL('calib_log.js', dir), 'utf8');
const tally = readFileSync(new URL('outcome_tally.js', dir), 'utf8');
const allowlist = JSON.parse(readFileSync(new URL('../metrics/allowlist.json', import.meta.url), 'utf8'));

// The build replaces the nested marker exactly like this (common.inject_shared_snippets).
const injected = calib.replace('/*__OUTCOME_TALLY__*/', tally);

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function load(win, source = injected) {
  const ls = memStorage();
  // eslint-disable-next-line no-new-func
  const make = new Function('window', 'localStorage', `${source}\nreturn { calibLog };`);
  return { ...make(win, ls), ls };
}

function emitter() {
  const sent = [];
  return { sent, cwAnalytics: { record: (k, ...rest) => { assert.equal(rest.length, 0); sent.push(k); } } };
}

const qb = (a) => ({ s: 'qb', id: 'qb_mood_001', pages: [], p: 'likely', a, ts: 1 });
const rev = () => ({ s: 'rev', id: 'CONCEPT#x', p: 'Good', a: 1, ts: 1 });

test('the build marker is present in calib_log.js exactly once', () => {
  assert.equal(calib.split('/*__OUTCOME_TALLY__*/').length - 1, 1);
});

test('OFF: no CW_OUTCOMES stamp means nothing is recorded', () => {
  const e = emitter();
  const { calibLog } = load({ cwAnalytics: e.cwAnalytics });
  for (let i = 0; i < 30; i++) { calibLog(qb(1)); calibLog(rev()); }
  assert.deepEqual(e.sent, []);
});

test('OFF: a stamp without the emitter records nothing and does not throw', () => {
  const { calibLog } = load({ CW_OUTCOMES: 1 });
  for (let i = 0; i < 30; i++) { calibLog(qb(0)); calibLog(rev()); }
});

test('OFF: only the exact value 1 arms it', () => {
  for (const v of ['1', true, 2, 'on']) {
    const e = emitter();
    const { calibLog } = load({ CW_OUTCOMES: v, cwAnalytics: e.cwAnalytics });
    for (let i = 0; i < 12; i++) calibLog(qb(1));
    assert.deepEqual(e.sent, [], `CW_OUTCOMES=${String(v)}`);
  }
});

test('ON: question-bank thresholds and the first-ten accuracy band', () => {
  const cases = [[4, 'tool:qbank:first10-lt50'], [5, 'tool:qbank:first10-50to79'],
    [7, 'tool:qbank:first10-50to79'], [8, 'tool:qbank:first10-80up'], [10, 'tool:qbank:first10-80up']];
  for (const [correct, band] of cases) {
    const e = emitter();
    const { calibLog } = load({ CW_OUTCOMES: 1, cwAnalytics: e.cwAnalytics });
    for (let i = 0; i < 20; i++) calibLog(qb(i < correct ? 1 : 0));
    assert.deepEqual(e.sent, ['tool:qbank:answered-5', 'tool:qbank:answered-10', band,
      'tool:qbank:answered-20'], `${correct}/10 correct`);
  }
});

test('ON: Daily Review thresholds', () => {
  const e = emitter();
  const { calibLog } = load({ CW_OUTCOMES: 1, cwAnalytics: e.cwAnalytics });
  for (let i = 0; i < 40; i++) calibLog(rev());
  assert.deepEqual(e.sent, ['tool:daily-review:graded-1', 'tool:daily-review:graded-10',
    'tool:daily-review:graded-25']);
});

test('ON: an event calibLog rejects is not tallied', () => {
  const e = emitter();
  const { calibLog } = load({ CW_OUTCOMES: 1, cwAnalytics: e.cwAnalytics });
  calibLog({ s: 'rev', p: 'free text', a: 1 });
  calibLog({ s: 'other', p: 'Good' });
  assert.deepEqual(e.sent, []);
});

test('ON: a throwing emitter never reaches the tool', () => {
  const { calibLog, ls } = load({ CW_OUTCOMES: 1, cwAnalytics: { record() { throw new Error('x'); } } });
  for (let i = 0; i < 12; i++) calibLog(qb(1));
  assert.equal(JSON.parse(ls.getItem('cw_calib_v1')).qb.length, 12);
});

test('the ledger is byte-identical with the tally armed or not', () => {
  const a = load({});
  const e = emitter();
  const b = load({ CW_OUTCOMES: 1, cwAnalytics: e.cwAnalytics });
  for (let i = 0; i < 15; i++) { a.calibLog(qb(i % 2)); b.calibLog(qb(i % 2)); a.calibLog(rev()); b.calibLog(rev()); }
  assert.deepEqual(a.ls.dump(), b.ls.dump());
});

test('every record() call is one string literal, and every key is allowlisted for both sites', () => {
  const calls = [...tally.matchAll(/cwAnalytics\.record\(([^)]*)\)/g)].map((m) => m[1].trim());
  // Includes any comment text: check-static-site.mjs scans the whole page, comments too.
  assert.equal(calls.length, 9);
  for (const arg of calls) {
    assert.match(arg, /^'[a-z0-9:-]+'$/, `non-literal record() argument: ${arg}`);
    const key = arg.slice(1, -1);
    for (const site of ['ms3', 'res']) assert.ok(allowlist.keys[site].includes(key), `${key} not allowlisted for ${site}`);
  }
});
