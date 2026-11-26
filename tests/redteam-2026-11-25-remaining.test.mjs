// Simulator red-team 2026-11-25: pins for the tool fixes drafted in the follow-up to #1314.
//
//   DA-1  Decision Aids, "Hyperthermia + rigidity": the first move names it a medical
//         emergency (rapid response / ICU) and gives a first move for every listed cause,
//         and cyproheptadine is framed as an adjunct (consistency audit C14).
//   CJ-1  Case Journeys, Jordan week 1: a safety and medical screen is on the checklist and
//         in the rounds handoff, and the chapter has a commonMisstep.
//   MS-1  MSE builder: "Copy as prose" never drops SI/HI silently.
//   FMS-1 Family simulator: Josh ruled (2026-11-25 20:45) that a mid-run "Start this
//         scenario over" is a new attempt. Pin the behaviour so a later edit can't change it
//         without a test failing: both restart buttons call open(), which resets the attempt.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('DA-1 hyperthermia + rigidity escalates first and covers every listed cause', () => {
  const html = read('04_Acute_and_Safety/Decision_Aids/decision-aids.html');
  const m = html.match(/\{id:"hyperthermia"[\s\S]*?rounds:/);
  assert.ok(m, 'hyperthermia node not found');
  const node = m[0];
  assert.match(node, /medical:"Medical emergency: call a rapid response/);
  assert.match(node, /ICU/);
  for (const cause of ['serotonin syndrome', 'NMS', 'delirium tremens', 'sympathomimetic', 'anticholinergic', 'malignant hyperthermia']) {
    assert.match(node.split('firstMove:')[1], new RegExp(cause, 'i'), `first move for ${cause}`);
  }
  assert.match(node, /cyproheptadine only as an adjunct/);
  assert.doesNotMatch(node, /\d+\s?mg/, 'no dose literal');
});

test('CJ-1 Jordan week 1 screens safety and medical status on day one', () => {
  const c = JSON.parse(read('longitudinal_case.json'));
  const w = c.weeks.find((x) => x.id === 'week1');
  assert.ok(w.checklist.some((i) => /safety and medical screen/.test(i.prompt)));
  assert.match(w.handoff, /safety or medical finding/);
  assert.ok(typeof w.commonMisstep === 'string' && /suicide/.test(w.commonMisstep));
});

function mse() {
  const source = read('02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html');
  const start = source.indexOf('var DOMAINS = [');
  const end = source.indexOf('\nfunction App(){', start);
  // eslint-disable-next-line no-new-func
  return { source, F: new Function(`${source.slice(start, end)}\nreturn {mseSafetyStated, MSE_SAFETY_MISSING_PROSE};`)() };
}

test('MS-1 SI/HI is either stated or flagged as not documented', () => {
  const { source, F } = mse();
  assert.equal(F.mseSafetyStated({}), false);
  assert.equal(F.mseSafetyStated({ thoughtContent: ['paranoid delusions'] }), false);
  for (const o of ['no SI/HI', 'passive SI', 'active SI', 'homicidal ideation']) {
    assert.equal(F.mseSafetyStated({ thoughtContent: [o] }), true, o);
  }
  assert.match(F.MSE_SAFETY_MISSING_PROSE, /not documented/);
  assert.match(source, /if\(out\.length && !mseSafetyStated\(sel\)\) out\.push\(MSE_SAFETY_MISSING_PROSE\)/,
    'the copied prose appends the missing-SI/HI line');
});

test('FMS-1 both restart buttons start a new attempt (ruled 2026-11-25)', () => {
  const html = read('08_Cases_and_Simulation/family-meeting-sim/family-meeting-sim.html');
  assert.match(html, /data-act="restart">Start this scenario over</);
  assert.match(html, /data-act="restart">Play this scenario again</);
  assert.match(html, /if \(act === 'restart'\) \{ open\(state\.sc\.id\); return; \}/);
});
