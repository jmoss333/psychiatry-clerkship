// Contract for the shared family-retrieval snippet (fam_retrieval.js): the one definition of
// what a FAM# card asks and what it reveals, injected into both family-systems-practice.html
// (which authors and grades the cards) and review.html (which serves the due ones). Pure —
// evaluated straight, with no DOM, storage or clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const src = readFileSync(new URL(`${BUILD}/fam_retrieval.js`, import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`${src}\nreturn { FAM_DEFAULT_RETRIEVAL, famCardId, famRevealContent, famRetrievalFor };`)();

const scenario = (over) => Object.assign({
  id: 'collateral_001', title: 'Collateral Call',
  opening: 'I am calling from the treatment team.',
  sections: { prepare: ['p'], ask: ['a1', 'a2'], say: ['s'], avoid: ['v'], handoff: ['h'], safety: ['sf'] },
}, over);

test('the card id joins scenario and prompt under the FAM# namespace', () => {
  assert.equal(F.famCardId('collateral_001', 'opening'), 'FAM#collateral_001#opening');
  // srsBucket in the shell reads the FAM# prefix to bucket the due count — it must survive.
  assert.ok(F.famCardId('x', 'y').indexOf('FAM#') === 0);
});

test('the default prompt list is the authored five, in order, each naming what it reveals', () => {
  assert.deepEqual(F.FAM_DEFAULT_RETRIEVAL.map((p) => p.id),
    ['opening', 'ask', 'avoid', 'handoff', 'safety']);
  for (const p of F.FAM_DEFAULT_RETRIEVAL) {
    assert.match(p.prompt, /\S/);
    assert.match(p.revealFrom, /\S/);
  }
});

test('reveal content is the scenario opening for the opening prompt, else the named section', () => {
  const it = scenario();
  assert.equal(F.famRevealContent(it, { revealFrom: 'opening' }), 'I am calling from the treatment team.');
  assert.deepEqual(F.famRevealContent(it, { revealFrom: 'ask' }), ['a1', 'a2']);
  assert.equal(F.famRevealContent(it, { revealFrom: 'nothere' }), null);
  assert.equal(F.famRevealContent(null, { revealFrom: 'ask' }), null);
  assert.equal(F.famRevealContent(it, null), null);
});

test('an explicit revealText wins over the section lookup', () => {
  assert.equal(F.famRevealContent(scenario(), { revealFrom: 'ask', revealText: 'say this' }), 'say this');
});

test('a prompt the scenario cannot answer is dropped rather than shown empty', () => {
  const thin = scenario({ opening: '', sections: { ask: ['a'] } });
  assert.deepEqual(F.famRetrievalFor(thin).map((p) => p.id), ['ask']);
  assert.deepEqual(F.famRetrievalFor(scenario()).map((p) => p.id),
    ['opening', 'ask', 'avoid', 'handoff', 'safety']);
  assert.deepEqual(F.famRetrievalFor({ id: 'x' }), []);
  assert.deepEqual(F.famRetrievalFor(null), []);
});

test('a scenario may override the whole prompt list with its own retrieval array', () => {
  const own = [{ id: 'custom', prompt: 'Say the one thing.', revealText: 'this thing' }];
  assert.deepEqual(F.famRetrievalFor(scenario({ retrieval: own })), own);
  // An empty or malformed override falls back to the defaults rather than emptying the tool.
  assert.equal(F.famRetrievalFor(scenario({ retrieval: [] })).length, 5);
  assert.equal(F.famRetrievalFor(scenario({ retrieval: 'nope' })).length, 5);
});

test('the snippet stays pure: no DOM, storage, clock, or escaping of its own', () => {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(body, /document\.|localStorage|Date\.now\(|new Date\(|innerHTML|function esc\(/);
});
