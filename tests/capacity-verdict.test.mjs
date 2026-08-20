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
function makeVerdict(rate) {
  const src = html.match(/function verdict\(\)\{[\s\S]*?\n  \}/);
  assert.ok(src, 'verdict() not found — locate it by string, not by line (handoff amendment A1)');
  const ABIL = [{ key: 'understand' }, { key: 'appreciate' }, { key: 'reason' }, { key: 'express' }];
  // eslint-disable-next-line no-new-func
  return new Function('ABIL', 'rate', `${src[0]}; return verdict();`).bind(null, ABIL, rate);
}
const V = (rate) => makeVerdict(rate)();
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

// The export gate. `part` is the single signal the button keys off, so any incomplete state
// disables it — this is what stops an unfinished "CAPACITY ASSESSMENT" reaching a chart.
test('Copy note is disabled for every incomplete state', () => {
  assert.match(html, /disabled:incomplete/, 'the export button must bind disabled to the verdict');
  assert.match(html, /var incomplete=\(v\.cls==='part'\)/,
    "incompleteness must be derived from verdict(), not from a separate ad-hoc check");
  assert.match(html, /if\(!incomplete\) copyNote\(\)/,
    'the click handler must also guard — disabled alone is bypassable');
  for (const rate of [ALL('na'), {}, { understand: 'intact', appreciate: 'na', reason: 'na', express: 'na' }]) {
    assert.equal(V(rate).cls, 'part', 'each of these must disable export');
  }
});

test('Copy note is enabled once all four are assessed', () => {
  for (const rate of [ALL('intact'), { understand: 'intact', appreciate: 'impaired', reason: 'intact', express: 'intact' }]) {
    assert.notEqual(V(rate).cls, 'part', 'a complete assessment must be exportable');
  }
});

test('a disabled export is visibly disabled', () => {
  assert.match(html, /\.btn:disabled/, 'a control that looks pressable but is not reads as a broken tool');
  assert.match(html, /cursor:not-allowed/);
});
