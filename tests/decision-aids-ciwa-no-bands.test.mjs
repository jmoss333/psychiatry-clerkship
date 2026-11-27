// Decision Aids, CIWA-Ar view: no score cut-offs (Josh, 2026-11-27, "Remove the bands").
//
// The CIWA-Ar is retired in instrument_rights.json (2026-08-28): the library teaches when and how
// to use it and points to the unit's approved form, and the form's scoring belongs to that form
// and to the unit's protocol. The Decision Aids page used to print three score bands with a
// treatment line for each. Red-team DA-3 (2026-11-25) also found the lowest band read as
// "PRN only" with no warning that a prior withdrawal seizure or DTs means treating early, and
// that the alcohol card's link was labelled COWS (the opioid scale).

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, '04_Acute_and_Safety/Decision_Aids/decision-aids.html'), 'utf8');
const view = (() => {
  const start = html.indexOf('if(view==="ciwa")');
  assert.ok(start >= 0, 'the CIWA-Ar view is still on the page');
  return html.slice(start, html.indexOf('\n    );', start));
})();

test('no CIWA-Ar score cut-offs anywhere on the page', () => {
  for (const cut of [/≤\s?8\b/, /\b9\s?[–-]\s?19\b/, /≥\s?20\b/]) {
    assert.doesNotMatch(html, cut, `a CIWA-Ar cut-off returned: ${cut}`);
  }
  assert.doesNotMatch(html, /score bands/i);
  assert.doesNotMatch(view, /className:"meter"/, 'no score meter in the CIWA-Ar view');
});

test('the prior-seizure / DTs caveat is on the view', () => {
  assert.match(view, /prior withdrawal seizure or delirium tremens is a reason to treat proactively/);
});

test('the view points to the unit form and the withdrawal card, labelled for the CIWA-Ar', () => {
  assert.match(view, /approved CIWA-Ar form/);
  assert.match(view, /href:"\.\/withdrawal\.html"/);
  assert.match(view, /CIWA-Ar and COWS card/);
  assert.doesNotMatch(view, /recognition card \(COWS\)/, 'the alcohol link must not be labelled COWS alone');
});

test('Library search no longer offers "score bands" for Decision Aids', () => {
  const common = readFileSync(path.join(ROOT, '13_Faculty_Resources/_automation/site_build/common.py'), 'utf8');
  const rows = common.split('\n').filter((l) => l.includes('"decision-aids.html":'));
  assert.ok(rows.length > 0, 'the Decision Aids search keywords are still in common.py');
  for (const row of rows) assert.doesNotMatch(row, /score bands/i, row.trim());
});
