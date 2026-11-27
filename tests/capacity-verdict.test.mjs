// WP-01 — the capacity module must not launder "Not assessed" into a determination, and must not
// export a note off-page from an unfinished assessment.
//
// The original defect: the UI writes rate[key]='na' for "Not assessed", 'na' is truthy, and the
// gate was `ABIL.every(a => rate[a.key])` — so four "Not assessed" clicks satisfied every-rated,
// found no 'impaired', and fell through to "Pattern consistent with INTACT capacity."
//
// verdict() is extracted and executed rather than string-matched, so these are behavioural
// assertions about the real branch order, not a grep over source that a refactor would fool.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', '04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html');
const html = readFileSync(FILE, 'utf8');

// Lift verdict() out of the component and bind the two names it closes over (ABIL, rate).
//
// new Function() over file content is a code-injection shape, so the trust boundary is worth
// stating: the only interpolated value is source read from a git-tracked file in this repo, and
// the alternative — asserting on the source text — would pass against a refactor that broke the
// behaviour. Same trust model as parity.test.mjs, which eval()s the client script for the same
// reason. Never widen this to a path or a fixture supplied from outside the repo.
function makeVerdict(rate, decision = 'refusal of a recommended procedure') {
  const src = html.match(/function verdict\(\)\{[\s\S]*?\n  \}/);
  assert.ok(src, 'verdict() not found — locate it by string, not by line (handoff amendment A1)');
  const ABIL = [{ key: 'understand' }, { key: 'appreciate' }, { key: 'reason' }, { key: 'express' }];
  const ctx = { decision, risk: 'moderate' };
  // eslint-disable-next-line no-new-func
  return new Function('ABIL', 'rate', 'ctx', `${src[0]}; return verdict();`).bind(null, ABIL, rate, ctx);
}
const V = (rate, decision) => makeVerdict(rate, decision)();
const ALL = (v) => ({ understand: v, appreciate: v, reason: v, express: v });

test('four "Not assessed" never yields INTACT — the original laundering bug', () => {
  const v = V(ALL('na'));
  assert.notEqual(v.cls, 'ok', 'an entirely unassessed patient must not read as INTACT');
  assert.doesNotMatch(v.txt, /INTACT/, v.txt);
  assert.equal(v.cls, 'part');
});

test('mixed intact + not-assessed cannot produce a determination', () => {
  const v = V({ understand: 'intact', appreciate: 'intact', reason: 'na', express: 'na' });
  assert.equal(v.cls, 'part', 'two unassessed abilities leave the question open');
  assert.doesNotMatch(v.txt, /INTACT/);
});

test('nothing rated at all is incomplete, not a determination', () => {
  const v = V({});
  assert.equal(v.cls, 'part');
});

test('all four intact still yields the INTACT determination', () => {
  const v = V(ALL('intact'));
  assert.equal(v.cls, 'ok');
  assert.match(v.txt, /INTACT/);
});

test('all four rated with an impairment still yields LACKS', () => {
  const v = V({ understand: 'intact', appreciate: 'impaired', reason: 'intact', express: 'intact' });
  assert.equal(v.cls, 'no');
  assert.match(v.txt, /LACKS/);
});

// DC-1 (red-team 2026-11-25): capacity is decision-specific, so a verdict with no decision named
// is a global capacity verdict. No determination is drawn until the decision is named.
test('no decision named: no determination, whatever the ratings', () => {
  for (const decision of ['', '   ', null]) {
    for (const rate of [ALL('intact'), { understand: 'intact', appreciate: 'impaired', reason: 'intact', express: 'intact' }]) {
      const v = V(rate, decision);
      assert.equal(v.cls, 'part', 'a blank decision must not yield INTACT or LACKS');
      assert.doesNotMatch(v.txt, /INTACT|LACKS/, v.txt);
      assert.match(v.txt, /specific decision/i);
    }
  }
});

test('a named decision with all four assessed still yields a determination', () => {
  assert.equal(V(ALL('intact'), 'refusal of dialysis').cls, 'ok');
  assert.equal(V({ understand: 'impaired', appreciate: 'intact', reason: 'intact', express: 'intact' }, 'refusal of dialysis').cls, 'no');
});

// DC-3 (Josh, 2026-11-26: practice only). The write-up stays on the page; nothing copies it out to
// a chart or a handoff, and the tool does not ask the learner to quote a real patient.
test('practice only: no copy or clipboard export of the write-up', () => {
  assert.doesNotMatch(html, /navigator\.clipboard/, 'the write-up must not be copied off the page');
  assert.doesNotMatch(html, /copyNote/, 'no export handler');
  assert.doesNotMatch(html, />?Copy note/, 'no "Copy note" control');
});

test('practice only: the tab and the write-up are framed for fictional cases', () => {
  assert.match(html, /'2 · Practice assessment'/);
  assert.doesNotMatch(html, /'2 · Bedside assessment'/);
  assert.match(html, /PRACTICE WRITE-UP \(fictional case\)/);
  assert.doesNotMatch(html, /quote the patient/i, 'must not prompt for real patient quotes');
  assert.doesNotMatch(html, /findings verified and note reviewed with the supervising clinician/,
    'the write-up must not assert a supervisor review that has not happened');
});
