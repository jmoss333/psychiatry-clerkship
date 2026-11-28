// Simulator red-team CP-2 and DR-1/DR-2/DR-3 (2026-11-25). Faculty ruling (Josh, 2026-11-25):
// an in-attempt rewind or re-click may not erase a miss; keep the first answer, and add a
// "completed after a miss" state that a later clean answer can never overwrite.
//
// CP-2, What Do You Say Next?: re-doing a case overwrote a harmful pick, and harmful picks
//   counted as "practiced". Now the first scored line is kept, a later best adds recoveredAt,
//   and only a best line counts as practiced.
// DR-1/2/3, Diagnostic Reasoning Workbench: re-clicking overwrote rec.steps[stepId] (harmful
//   then best read "3/3 strong"), "completed" counted all-harmful runs, and every re-click
//   re-graded the review card. Now the first choice per step is kept and graded once per
//   attempt, a later best adds afterMiss, and complete / clean / unsafe are separate.
//
// The helpers are evaluated from the tools' own source against stub storage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const COMM = read('02_Clinical_Skills/Communication_Practice/communication-practice.html');
const M_COMM = '/* Function declarations, not var';
const REASON = read('02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html');

function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a > -1 && b > a, `could not slice ${from} .. ${to}`);
  return src.slice(a, b);
}
function memStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// ---- CP-2 ----------------------------------------------------------------------------------
function commApi() {
  const ls = memStorage(), graded = [];
  const body = slice(COMM, '/* Function declarations, not var', 'function tagsFor(');
  const labels = slice(COMM, 'function doneLabel(', 'function defaultRapidDrill(');
  // eslint-disable-next-line no-new-func
  const api = new Function('localStorage', 'graded', `
    var QUALITY={best:true,partial:true,missed:true,harmful:true};
    var state={attempts:{}};
    function commCardId(id){return 'COMM#'+id;}
    function srsGradeForQuality(q){return q;}
    function srsGradeCard(id,g){graded.push([id,g]);}
    ${body}\n${labels}
    return {state:state,saveAttempt:saveAttempt,normalizeAttempts:normalizeAttempts,attemptStatus:attemptStatus,practicedWell:practicedWell};`)(ls, graded);
  return { api, ls, graded };
}
const pick = (id, quality) => ({ id, quality });

test('CP-2: a harmful first line survives a later best one, which is marked recovered', () => {
  const { api, ls } = commApi();
  api.saveAttempt('discharge_demand_elicit_001', pick('a', 'harmful'));
  api.saveAttempt('discharge_demand_elicit_001', pick('b', 'best'));
  const rec = JSON.parse(ls.getItem('cw_comm_v1')).discharge_demand_elicit_001;
  assert.equal(rec.quality, 'harmful', 'the first scored line is kept');
  assert.equal(rec.choiceId, 'a');
  assert.match(rec.recoveredAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(api.attemptStatus(rec), 'Recovered after a miss');
  assert.equal(api.practicedWell(rec), true);
  // a later miss cannot take the recovery away, and a later best cannot clean the record
  api.saveAttempt('discharge_demand_elicit_001', pick('c', 'missed'));
  api.saveAttempt('discharge_demand_elicit_001', pick('b', 'best'));
  const again = JSON.parse(ls.getItem('cw_comm_v1')).discharge_demand_elicit_001;
  assert.deepEqual(again, rec);
});

test('CP-2: only a best line counts as practiced; harmful, missed and partial do not', () => {
  const { api } = commApi();
  for (const [q, label] of [['harmful', 'Retry'], ['missed', 'Review'], ['partial', 'Partly practiced']]) {
    const rec = { choiceId: 'x', quality: q, at: '2026-08-01' };
    assert.equal(api.practicedWell(rec), false, q);
    assert.equal(api.attemptStatus(rec), label);
  }
  assert.equal(api.practicedWell({ choiceId: 'b', quality: 'best', at: '2026-08-01' }), true);
  assert.equal(api.attemptStatus({ choiceId: 'd', quality: 'partial', at: '2026-08-01', recoveredAt: '2026-08-02' }), 'Best on a later try');
  assert.equal(api.attemptStatus(undefined), 'Not practiced');
});

test('CP-2: a clean first rep stores exactly the old shape, and old records read unchanged', () => {
  const { api, ls, graded } = commApi();
  api.saveAttempt('suicide_direct_question_001', pick('b', 'best'));
  const rec = JSON.parse(ls.getItem('cw_comm_v1')).suicide_direct_question_001;
  assert.deepEqual(Object.keys(rec).sort(), ['at', 'choiceId', 'quality']);
  assert.deepEqual(graded, [['COMM#suicide_direct_question_001', 'best']]);
  const norm = api.normalizeAttempts({
    a: { choiceId: 'b', quality: 'best', at: '2026-07-31', recoveredAt: '2026-08-01' }, // best never carries it
    b: { choiceId: 'a', quality: 'harmful', at: '2026-07-31', recoveredAt: 'yesterday' }, // malformed date dropped
    c: { choiceId: 'a', quality: 'harmful', at: '2026-07-31', recoveredAt: '2026-08-01' },
  });
  assert.deepEqual(norm.a, { choiceId: 'b', quality: 'best', at: '2026-07-31' });
  assert.deepEqual(norm.b, { choiceId: 'a', quality: 'harmful', at: '2026-07-31' });
  assert.equal(norm.c.recoveredAt, '2026-08-01');
});

test('CP-2: the case list and domain counts read practice through practicedWell', () => {
  assert.match(COMM, /function practicedCount\(list\)\{return \(list\|\|\[\]\)\.filter\(function\(c\)\{return practicedWell\(state\.attempts\[c\.id\]\);\}\)\.length;\}/);
  assert.match(COMM, /status=attemptStatus\(attempt\)/);
});

// ---- DR-1/2/3 ------------------------------------------------------------------------------
function reasonApi() {
  const ls = memStorage(), graded = [];
  const body = slice(REASON, '/* Function declarations, not var', 'function setCurrentById(');
  // eslint-disable-next-line no-new-func
  const api = new Function('localStorage', 'graded', `
    var state={cases:[],attempts:{}};
    function esc(s){return String(s);}
    function reasonCardId(c,s){return 'REASON#'+c+'#'+s;}
    function srsGradeForQuality(q){return q;}
    function srsGradeCard(id,g){graded.push([id,g]);}
    ${body}
    state.attempts=loadAttempts();
    return {state:state,saveAttempt:saveAttempt,newAttempt:newAttempt,caseStatus:caseStatus,statusBadge:statusBadge,caseComplete:caseComplete,caseClean:caseClean,progressHtml:progressHtml,loadAttempts:loadAttempts};`)(ls, graded);
  return { api, ls, graded };
}
const CASE = { id: 'c1', steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] };

test('DR-1: harmful then best on a step keeps the harmful first choice; "3/3 strong" is not reachable that way', () => {
  const { api, ls } = reasonApi();
  api.state.cases = [CASE];
  api.saveAttempt('c1', 's1', pick('a', 'harmful'));
  api.saveAttempt('c1', 's1', pick('b', 'best')); // re-click
  api.saveAttempt('c1', 's2', pick('b', 'best'));
  api.saveAttempt('c1', 's3', pick('b', 'best'));
  const step = JSON.parse(ls.getItem('cw_reason_v1')).c1.steps.s1;
  assert.equal(step.quality, 'harmful');
  assert.equal(step.choiceId, 'a');
  assert.match(step.afterMiss, /^\d{4}-\d{2}-\d{2}$/, 'completed after a miss');
  const st = api.caseStatus(CASE);
  assert.equal(st.strong, 2);
  assert.match(api.statusBadge(CASE), /2\/3 strong · 1 unsafe pick · after a miss/);
});

test('DR-2: complete, clean and unsafe are separate; an all-harmful run is complete but not clean', () => {
  const { api } = reasonApi();
  const other = { id: 'c2', steps: [{ id: 's1' }] };
  api.state.cases = [CASE, other];
  for (const s of CASE.steps) api.saveAttempt('c1', s.id, pick('a', 'harmful'));
  api.saveAttempt('c2', 's1', pick('b', 'best'));
  assert.equal(api.caseComplete(CASE), true);
  assert.equal(api.caseClean(CASE), false);
  assert.equal(api.caseClean(other), true);
  assert.match(api.statusBadge(CASE), /0\/3 strong · 3 unsafe picks/);
  assert.match(api.progressHtml(), /2 of 2 cases completed/);
  assert.match(api.progressHtml(), /1 clean/);
});

test('DR-3: the review card is graded once per step per attempt, from the first choice', () => {
  const { api, graded } = reasonApi();
  api.state.cases = [CASE];
  api.saveAttempt('c1', 's1', pick('a', 'missed'));
  api.saveAttempt('c1', 's1', pick('b', 'best'));
  api.saveAttempt('c1', 's1', pick('b', 'best'));
  assert.deepEqual(graded, [['REASON#c1#s1', 'missed']]);
});

test('Restart after the case is finished is a new attempt: it starts clean and keeps the last result', () => {
  const { api, ls, graded } = reasonApi();
  api.state.cases = [CASE];
  api.saveAttempt('c1', 's1', pick('a', 'harmful'));
  api.saveAttempt('c1', 's2', pick('b', 'best'));
  api.saveAttempt('c1', 's3', pick('b', 'best'));
  api.newAttempt(CASE);
  const rec = JSON.parse(ls.getItem('cw_reason_v1')).c1;
  assert.deepEqual(rec.steps, {});
  assert.equal(rec.attempt, 2);
  assert.deepEqual({ ...rec.lastCompleted, at: '' }, { strong: 2, total: 3, harmful: 1, afterMiss: 0, at: '' });
  assert.match(api.statusBadge(CASE), /2\/3 strong · 1 unsafe pick/, 'the list still shows the finished attempt');
  api.saveAttempt('c1', 's1', pick('b', 'best'));
  assert.equal(graded.filter(([id]) => id === 'REASON#c1#s1').length, 2, 'a new attempt grades again');
});

test('DR: older cw_reason_v1 records read tolerantly', () => {
  const { api, ls } = reasonApi();
  ls.setItem('cw_reason_v1', JSON.stringify({
    c1: { steps: { s1: { choiceId: 'b', quality: 'best', at: '2026-08-01' }, s2: { choiceId: '', quality: 'best' }, s3: 'junk' }, updatedAt: '2026-08-01' },
    bad: 'x',
  }));
  const a = api.loadAttempts();
  assert.deepEqual(Object.keys(a), ['c1']);
  assert.deepEqual(a.c1.steps, { s1: { choiceId: 'b', quality: 'best', at: '2026-08-01' } });
  assert.equal(a.c1.attempt, 1);
});

test('DR: the click handler records every choice through saveAttempt and Restart opens a new attempt', () => {
  assert.match(REASON, /if\(state\.choice\)saveAttempt\(c\.id,st\.id,state\.choice\)/);
  assert.match(REASON, /data-act'\)==='restart'\)\{newAttempt\(c\);/);
  assert.match(REASON, /function lockNoteHtml\(/);
});

// Load order (CI smoke, 2026-11-26): both tools build `state` with attempts:loadAttempts() near
// the top of the script, before the helper lines run. A helper constant declared with `var`
// below that point is still undefined when history loads, the load throws inside its try, and
// every stored attempt reads as "Not practiced". Evaluate the helpers the way the page does,
// with the load first, and require real history back.
test('stored history loads even though state is built before the helper lines', () => {
  for (const [src, from, to, key, seed, pre] of [
    [COMM, M_COMM, 'function tagsFor(', 'cw_comm_v1',
      { psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
        rupture_limit_setting_001: { choiceId: 'a', quality: 'harmful', at: '2026-07-30', recoveredAt: '2026-07-31' } },
      "var QUALITY={best:true,partial:true,missed:true,harmful:true};"],
    [REASON, M_COMM, 'function setCurrentById(', 'cw_reason_v1',
      { c1: { steps: { s1: { choiceId: 'b', quality: 'best', at: '2026-07-31' } } } },
      "function esc(s){return String(s);}"],
  ]) {
    const ls = memStorage();
    ls.setItem(key, JSON.stringify(seed));
    // eslint-disable-next-line no-new-func
    const attempts = new Function('localStorage', `${pre}
      var state={cases:[],attempts:loadAttempts()};
      ${slice(src, from, to)}
      return state.attempts;`)(ls);
    assert.deepEqual(Object.keys(attempts).sort(), Object.keys(seed).sort(), key);
  }
});
