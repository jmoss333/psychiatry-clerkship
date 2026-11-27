import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const json = p => JSON.parse(read(p));
const catalog = read('07_Evidence_and_Reading/Book_Summaries/ms3_book_catalog.md');
const original = read('07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md');
const listing = json('13_Faculty_Resources/_automation/site_build/shipped_pages.json');
const ledger = json('13_Faculty_Resources/reviewed.json');
test('new catalog contains 66 unique titles and ten navigable themes without copied curated prose', () => {
  const titles = [...catalog.matchAll(/^- \*\*(.+?)\*\* — /gm)].map(m => m[1]);
  assert.equal(titles.length, 66);
  assert.equal(new Set(titles).size, 66);
  assert.equal((catalog.match(/<a id="catalog-theme-\d+"><\/a>/g) || []).length, 10);
  assert.equal((catalog.match(/data-media-anchor="(?!our-place)/g) || []).length, 10);
  assert.ok(catalog.includes('](?page=book_library.md)'));
  assert.doesNotMatch(catalog, /ISBN|Amazon|\$\d|order quantity|in stock|translation|working draft|libfile_/i);
  assert.match(catalog, /does not confirm physical copies/);
  assert.doesNotMatch(original, /OUR Place book catalog|catalog-theme/);
});
test('new identity is MS3 only and has its own independently governed review row', () => {
  const page = listing.pages.find(p => p.slug === 'ms3_book_catalog.md');
  assert.deepEqual(page.sites, ['ms3']);
  assert.equal(page.source, '07_Evidence_and_Reading/Book_Summaries/ms3_book_catalog.md');
  const originalPage = listing.pages.find(p => p.slug === 'book_library.md');
  assert.deepEqual(originalPage.sites, ['ms3', 'res']);
  assert.equal(originalPage.extraSources, undefined);
  const row = ledger['ms3_book_catalog.md'];
  assert.notEqual(row, ledger['book_library.md']);
  assert.ok(['pending', 'reviewed'].includes(row.status));
  if(row.status === 'pending') {
    assert.equal(row.by, 'Pending faculty review');
    assert.ok(row.reason);
  }
});
test('MS3 navigation exposes both new catalog and old route', () => {
  const builder = read('13_Faculty_Resources/_automation/site_build/build_deploy.py');
  assert.match(builder, /_md\("OUR Place Book Catalog \(66 titles\)","ms3_book_catalog.md"\)/);
  assert.match(builder, /_md\("MS3 Book Library","book_library.md"\)/);
});
