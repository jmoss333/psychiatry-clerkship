import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/', import.meta.url);
const src = ['fd_data.js', 'fd_search.js'].map(file => readFileSync(new URL(file, base), 'utf8')).join('\n');
const F = new Function('governanceBadge', `${src}\nreturn {fdSearchWithExcerpts,fdSearchResultRow,fdSearchMatches};`)(() => '');
const item = { ref: 'notes.md', title: 'Study notes', kind: 'page' };
const makeIndex = passages => ({ docs: [{ f: item.ref, passages }], postings: {}, n: 1 });
const row = { item, kind: 'item', body: true };
const explain = (query, passages) => F.fdSearchWithExcerpts([{ ...row }], query, { bodyIndex: makeIndex(passages) })[0];

test('excerpt finds a complete late sentence and preserves negation and punctuation', () => {
  const text = 'Do not confuse akathisia with agitation; ask about inner restlessness.';
  const result = explain('akathisia', ['An introductory paragraph without the target.', `A different opening sentence. ${text} Follow-up comes later.`]);
  assert.equal(result.excerpt.text, text);
  assert.match(F.fdSearchResultRow(result), /Do not confuse <mark>akathisia<\/mark> with agitation;/);
});

test('excerpt covers multiple query words and highlights case-insensitive whole words', () => {
  const result = explain('QTc monitoring', ['QTc may be discussed in a later section.', 'QTc monitoring is part of the review; reconsider monitoring at follow-up.']);
  assert.equal(result.excerpt.text, 'QTc monitoring is part of the review; reconsider monitoring at follow-up.');
  const html = F.fdSearchResultRow(result);
  assert.match(html, /<mark>QTc<\/mark> <mark>monitoring<\/mark>/);
  assert.equal((html.match(/<mark>/g) || []).length, 3);
  assert.equal(explain('cat', ['Education about catatonia is available in the guide.']).excerpt, undefined);
  assert.match(F.fdSearchResultRow(explain('catatoni', ['Education about catatonia is available in the guide.'])), /<mark>catatonia<\/mark>/);
});

test('source markup and query punctuation cannot become executable markup or a regex', () => {
  const result = explain('QTc [.*]', ['QTc <script>alert("test")</script> & other text stays literal.']);
  const html = F.fdSearchResultRow(result);
  assert.match(html, /<mark>QTc<\/mark> &lt;script&gt;/);
  assert.match(html, /&amp; other text/);
  assert.doesNotMatch(html, /<script>/);
});

test('long sentences are omitted rather than losing their qualifying beginning', () => {
  const long = `Do not ${'use this disconnected phrase '.repeat(12)}as a description of akathisia.`;
  assert.equal(explain('akathisia', [long]).excerpt, undefined);
  assert.equal(explain('akathisia', ['Short unrelated source passage.']).excerpt, undefined);
  assert.equal(explain('', ['Akathisia can be discussed with the team.']).excerpt, undefined);
});

test('old indexes work and adding excerpts does not alter result identities or order', () => {
  const rows = [{ ...row }, { item: { ref: 'next.md', title: 'Next' }, kind: 'protocol' }];
  assert.equal(F.fdSearchWithExcerpts(rows, 'akathisia', {}), rows);
  const si = makeIndex(undefined);
  assert.equal(F.fdSearchWithExcerpts(rows, 'akathisia', { bodyIndex: si }), rows);
  si.docs[0].passages = ['Akathisia can be discussed with the team.'];
  const result = F.fdSearchWithExcerpts(rows, 'akathisia', { bodyIndex: si });
  assert.deepEqual(result.map(r => [r.kind, r.item.ref]), [['item', 'notes.md'], ['protocol', 'next.md']]);
  assert.ok(result[0].excerpt);
});

test('restored search keeps its exact excerpts when the live text index changes', () => {
  const matches = [explain('akathisia', ['Akathisia can be discussed with the team.'])];
  const state = { searchRestored: true, searchReturn: { query: 'akathisia', matches }, bodyIndex: makeIndex(['A replacement akathisia sentence must not move the saved list.']) };
  assert.equal(F.fdSearchMatches({}, 'akathisia', {}, state), matches);
  assert.equal(matches[0].excerpt.text, 'Akathisia can be discussed with the team.');
});
