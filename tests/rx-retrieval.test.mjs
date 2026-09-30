// Contract for the pharmacy retrieval snippet (rx_retrieval.js) and the derived deck it reads.
// The id shape is what a learner's schedule is keyed on in cw_srs_v1, so it is pinned here;
// the deck's governance (only attested text, gated by review hashes) is pinned in Python by
// 13_Faculty_Resources/_automation/pharmacy/test_build_rx_deck.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const src = readFileSync(new URL(`${BUILD}/rx_retrieval.js`, import.meta.url), 'utf8');
const R = new Function(`${src}\nreturn { RX_PREFIX, rxCardId, rxIsCard, rxCardsFor, rxDue };`)();
const deck = JSON.parse(readFileSync(
  new URL('../13_Faculty_Resources/_automation/pharmacy/rx_deck.json', import.meta.url), 'utf8'));

test('card ids join drug and prompt under the RX# namespace', () => {
  assert.equal(R.rxCardId('lithium', 'boxed'), 'RX#lithium#boxed');
  assert.ok(R.rxIsCard('RX#lithium#ask0'));
  for (const other of ['QB#x', 'FAM#a#b', 'RX#only-two', 'RX#a#b#c', null]) {
    assert.equal(R.rxIsCard(other), false, String(other));
  }
});

test('every committed deck card id is a well-formed RX# id and unique', () => {
  const ids = deck.cards.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of deck.cards) {
    assert.ok(R.rxIsCard(c.id), c.id);
    assert.equal(c.id, R.rxCardId(c.drug, c.id.split('#')[2]));
    assert.ok(c.reveal.length > 0 && c.reveal.every((r) => r.lines.length > 0), c.id);
  }
});

const toy = { cards: [
  { id: 'RX#a#one', drug: 'a' }, { id: 'RX#a#two', drug: 'a' }, { id: 'RX#b#one', drug: 'b' },
] };

test('rxCardsFor filters by drug in deck order', () => {
  assert.deepEqual(R.rxCardsFor(toy, 'a').map((c) => c.id), ['RX#a#one', 'RX#a#two']);
  assert.deepEqual(R.rxCardsFor(toy, 'zzz'), []);
});

test('rxDue: due oldest-first, then new cards up to the limit', () => {
  const store = { cards: { 'RX#b#one': { due: 5 }, 'RX#a#two': { due: 1 } } };
  assert.deepEqual(R.rxDue(toy, store, 10, 1).map((c) => c.id),
    ['RX#a#two', 'RX#b#one', 'RX#a#one']);
  assert.deepEqual(R.rxDue(toy, store, 3, 0).map((c) => c.id), ['RX#a#two']);
});

test('a scheduled card withdrawn from the deck is never resurrected', () => {
  const store = { cards: { 'RX#gone#x': { due: 0 } } };
  assert.equal(R.rxDue(toy, store, 10, 0).length, 0);
});
