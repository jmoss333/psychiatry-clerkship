// Screeners — measurement-based-care card (enhancement A, owner request 2026-10-31).
//
// What this pins, and why each pin exists:
//
//   · the readout's arithmetic: change, percent fall, the 5-point PHQ-9 threshold for one
//     person's change, response (a fall of at least half), remission (under 5), and the
//     baselines from which response is undefined;
//   · the two claims about papers are bound in evidence_annotations.json and the registry row,
//     and the page carries their PMIDs — every other number on the card is a stated working
//     definition, not a finding;
//   · item 9 is never cleared by a falling total, and the GAD-7 gets no change threshold;
//   · the card stores nothing (the page's own no-PHI promise, also enforced by the smoke
//     contract), adds no free-text field, and leaves every pinned constant alone.
//
// Trust model: the helpers block is executed straight out of the tracked html between its
// sentinels, the same way tests/cows-series.test.mjs executes the COWS helpers.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, '02_Clinical_Skills/Screeners/screeners.html'), 'utf8');

function bands() {
  const phq = html.match(/function phqBand\(s\)\{[^\n]*\}/);
  const gad = html.match(/function gadBand\(s\)\{[^\n]*\}/);
  assert.ok(phq && gad, 'band functions not found');
  // eslint-disable-next-line no-new-func
  return new Function(`${phq[0]}\n${gad[0]}\nreturn { phqBand, gadBand };`)();
}

function MBC() {
  const m = html.match(/\/\* MBC_HELPERS_BEGIN[\s\S]*?\*\/\n([\s\S]*?)\/\* MBC_HELPERS_END \*\//);
  assert.ok(m, 'MBC helpers block not found — locate it by its sentinels, not by line');
  // eslint-disable-next-line no-new-func
  return new Function(`${m[1]}\nreturn MBC;`)();
}

const { phqBand, gadBand } = bands();

test('the PHQ-9 readout: change, percent, the 5-point threshold, response and remission', () => {
  const M = MBC();
  // The card's own opening example: a change that counts but is not yet a response.
  const r = M.read('PHQ-9', 18, 11, phqBand);
  assert.deepEqual(
    { change: r.change, pct: r.pct, meaningful: r.meaningful, response: r.response, remission: r.remission },
    { change: -7, pct: 39, meaningful: true, response: false, remission: false },
  );
  assert.equal(r.bandFrom, 'Moderately severe');
  assert.equal(r.bandTo, 'Moderate');
  const lines = M.lines(r);
  assert.equal(lines[0], 'Then 18 (Moderately severe) → now 11 (Moderate): down 7 points — a 39% fall from baseline.');
  assert.match(lines[1], /^A fall of 7 points meets the 5-point threshold for one person’s change/);
  assert.equal(lines[2], 'Response (a fall of at least half from baseline): not met.');
  assert.equal(lines[3], 'Remission (total under 5): not met.');

  // Exactly half is a response; one point short is not.
  assert.equal(M.read('PHQ-9', 18, 9, phqBand).response, true);
  assert.equal(M.read('PHQ-9', 18, 10, phqBand).response, false);
  // Remission is a total under 5, whatever the baseline.
  assert.equal(M.read('PHQ-9', 18, 4, phqBand).remission, true);
  assert.equal(M.read('PHQ-9', 18, 5, phqBand).remission, false);
  // From a baseline already under 5 there is nothing to respond from.
  const low = M.read('PHQ-9', 4, 2, phqBand);
  assert.equal(low.response, null);
  assert.ok(M.lines(low).includes('Response is not defined from a baseline already under 5.'));
});

test('a change under 5 points is noise for one person, in either direction; 5 counts', () => {
  const M = MBC();
  const small = M.read('PHQ-9', 14, 10, phqBand);
  assert.equal(small.meaningful, false);
  assert.match(M.lines(small)[1], /under 5 — inside the noise for one person’s score/);
  assert.equal(M.read('PHQ-9', 14, 9, phqBand).meaningful, true, 'exactly 5 meets the threshold');
  const worse = M.read('PHQ-9', 8, 14, phqBand);
  assert.equal(worse.meaningful, true);
  assert.match(M.lines(worse)[1], /^A rise of 6 points .* a worsening that counts; find out why\.$/);
  const same = M.read('PHQ-9', 12, 12, phqBand);
  assert.match(M.lines(same)[0], /: unchanged\.$/);
  assert.match(M.lines(same)[1], /^No change\./);
  assert.equal(M.read('PHQ-9', 0, 3, phqBand).pct, null, 'no percent from a zero baseline');
});

test('item 9 is never cleared by a falling total', () => {
  const M = MBC();
  for (const [base, now] of [[22, 3], [18, 11], [9, 9], [6, 14]]) {
    const lines = M.lines(M.read('PHQ-9', base, now, phqBand));
    assert.equal(lines[lines.length - 1], 'Item 9 is read on its own at every administration — a falling total never clears it.');
  }
});

test('the GAD-7 gets the movement and its band, and no change threshold', () => {
  const M = MBC();
  const r = M.read('GAD-7', 15, 9, gadBand);
  assert.deepEqual({ meaningful: r.meaningful, response: r.response, remission: r.remission }, { meaningful: null, response: null, remission: null });
  const lines = M.lines(r);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Then 15 (Severe) → now 9 (Mild): down 6 points — a 40% fall from baseline.');
  assert.match(lines[1], /^No individual-change threshold is taught here for the GAD-7/);
  assert.equal(M.SCALES['GAD-7'].max, 21);
  assert.equal(M.SCALES['PHQ-9'].max, 27);
});

test('the two paper claims carry their PMIDs on the page and are bound in the evidence files', () => {
  assert.match(html, /Löwe et al\., Med Care 2004, PMID 15550799/);
  assert.match(html, /Kroenke et al\., Gen Hosp Psychiatry 2010, PMID 20633738/);
  assert.match(html, /Kroenke et al\., J Gen Intern Med 2001, PMID 11556941/);
  assert.match(html, /emerging albeit not yet definitive for the GAD-7/);
  assert.match(html, /common working definitions in measurement-based care/);

  const ann = JSON.parse(readFileSync(path.join(ROOT, 'evidence_annotations.json'), 'utf8'));
  const claim = (sourceId, claimId) => ann.annotations.find((a) => a.sourceId === sourceId)
    ?.claims.find((c) => c.claimId === claimId);
  const pins = [
    ['lowe-2004-phq9-monitoring', 'phq9-mcid-5-points', '15550799', 'was 5 points on the 0 to 27 point PHQ-9 scale'],
    ['kroenke-2010-phq-gad-review', 'gad7-sensitivity-to-change-emerging', '20633738', 'emerging albeit not yet definitive for the GAD-7'],
  ];
  const cache = JSON.parse(readFileSync(path.join(ROOT, '13_Faculty_Resources/_automation/span_audit/abstract_cache.json'), 'utf8'));
  const reg = JSON.parse(readFileSync(path.join(ROOT, 'evidence_registry.json'), 'utf8'));
  for (const [sourceId, claimId, pmid, term] of pins) {
    const c = claim(sourceId, claimId);
    assert.ok(c, `${sourceId}/${claimId} exists`);
    assert.ok(c.usedBy.includes('screeners.html'));
    assert.ok(c.claimTerms.includes(term));
    const row = ann.annotations.find((a) => a.sourceId === sourceId);
    assert.equal(row.verifiedAgainst.pmid, pmid);
    assert.ok(row.verifiedAgainst.sourceSpan.length >= 80);
    assert.ok(cache[pmid]?.includes(row.verifiedAgainst.sourceSpan.split('. ')[0]), 'the span audit can find the span');
    assert.equal(reg.sources.find((s) => s.id === sourceId)?.citation.pmid, pmid);
  }
  assert.ok(claim('kroenke-2001-phq9', 'phq9-severity-bands').usedBy.includes('screeners.html'));

  const tools = JSON.parse(readFileSync(path.join(ROOT, 'tool_registry.json'), 'utf8')).tools;
  assert.deepEqual(tools.find((t) => t.file === 'screeners.html').evidenceIds,
    ['kroenke-2001-phq9', 'lowe-2004-phq9-monitoring', 'kroenke-2010-phq-gad-review']);
});

test('the card stores nothing, adds no text field, and leaves the pinned constants alone', () => {
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(html, /<textarea|<input\b|contentEditable/i);
  assert.doesNotMatch(html, /e\(\s*['"](?:textarea|input)['"]/);
  assert.match(html, /nothing is saved/);
  // The card sits after the instrument and before the official-form route.
  const card = html.indexOf('e(MbcCard,');
  assert.ok(card > html.indexOf('e(Scale,{key:"gad"') && card < html.indexOf('e("div",{className:"route"}'));
  // The item-9 route is still the first link inside the instrument.
  assert.match(html, /e\("a",\{href:"cssrs\.html"/);
  // check-static-site.mjs §5 dose regex.
  assert.doesNotMatch(html, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i);
  assert.equal((html.match(/\[CLERKSHIP-META v1\]/g) || []).length, 1);
});
