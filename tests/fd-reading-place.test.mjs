import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_reading_place.js', import.meta.url,
), 'utf8');
// eslint-disable-next-line no-new-func
const make = new Function(`${SOURCE}\nreturn {
  fdReadingPlaces: fdReadingPlaces,
  fdReadingPlaceUpdate: fdReadingPlaceUpdate,
  fdReadingPlaceDrop: fdReadingPlaceDrop,
  fdReadingHeadingIds: fdReadingHeadingIds,
  fdReadingResume: fdReadingResume
};`);

test('sanitizing keeps valid own records and ignores inherited and prototype-like keys', () => {
  const inherited = Object.create({ 'inherited.md': { heading: 'h', offset: 1, updatedAt: 2 } });
  inherited['valid.md'] = { heading: 'h-1', offset: 3, updatedAt: 4 };
  Object.defineProperty(inherited, '__proto__', {
    value: { heading: 'bad', offset: 4, updatedAt: 5 }, enumerable: true,
  });
  inherited.constructor = { heading: 'bad', offset: 4, updatedAt: 5 };
  assert.deepEqual(make().fdReadingPlaces(inherited), {
    'valid.md': { heading: 'h-1', offset: 3, updatedAt: 4 },
  });
});

test('sanitizing rejects malformed records, refs, headings, and non-finite values', () => {
  const places = make().fdReadingPlaces({
    'bad.md': { heading: '', offset: -1, updatedAt: 'x' },
    '../escape.md': { heading: 'h', offset: 1, updatedAt: 2 },
    '/root.md': { heading: 'h', offset: 1, updatedAt: 2 },
    'unsafe name.md': { heading: 'h', offset: 1, updatedAt: 2 },
    'nan.md': { heading: 'h', offset: NaN, updatedAt: 2 },
    'infinite.md': { heading: 'h', offset: Infinity, updatedAt: 2 },
    'bad-time.md': { heading: 'h', offset: 1, updatedAt: Infinity },
    'array.md': [{ heading: 'h', offset: 1, updatedAt: 2 }],
  });
  assert.deepEqual(places, {});
});

test('updates clamp offsets, require valid values, clone input, and leave it unchanged', () => {
  const original = { 'keep.md': { heading: 'section-1', offset: 7, updatedAt: 8 } };
  const F = make();
  const high = F.fdReadingPlaceUpdate(original, 'new.md', 'fd-reading-next', 200000, 9000);
  assert.deepEqual(high['new.md'], { heading: 'fd-reading-next', offset: 100000, updatedAt: 9000 });
  assert.deepEqual(original, { 'keep.md': { heading: 'section-1', offset: 7, updatedAt: 8 } });
  assert.notEqual(high, original);
  const low = F.fdReadingPlaceUpdate(original, 'low.md', 'fd-reading-low', -8, 10);
  assert.equal(low['low.md'].offset, 0);
  assert.equal(F.fdReadingPlaceUpdate(original, '../bad.md', 'h', 1, 2)['../bad.md'], undefined);
  assert.equal(F.fdReadingPlaceUpdate(original, 'bad.md', '', 1, 2)['bad.md'], undefined);
  assert.equal(F.fdReadingPlaceUpdate(original, 'bad.md', 'ok', NaN, 2)['bad.md'], undefined);
  assert.equal(F.fdReadingPlaceUpdate(original, 'bad.md', 'ok', 1, Infinity)['bad.md'], undefined);
});

test('keeps at most fifty places and evicts the oldest timestamp first', () => {
  const F = make();
  let places = {};
  for (let i = 0; i < 51; i += 1) {
    places = F.fdReadingPlaceUpdate(places, `p-${i}.md`, `h-${i}`, i, 1000 + i);
  }
  assert.equal(Object.keys(places).length, 50);
  assert.equal(places['p-0.md'], undefined);
  assert.equal(places['p-50.md'].updatedAt, 1050);
});

test('breaks tied eviction timestamps by ref deterministically', () => {
  const F = make();
  let places = {};
  for (let i = 50; i >= 0; i -= 1) {
    places = F.fdReadingPlaceUpdate(places, `p-${String(i).padStart(2, '0')}.md`, `h-${i}`, i, 7);
  }
  assert.equal(Object.keys(places).length, 50);
  assert.equal(places['p-00.md'], undefined);
  assert.ok(places['p-01.md']);
});

test('heading ids normalize punctuation, handle empty labels, and resolve collisions in order', () => {
  const F = make();
  assert.deepEqual(F.fdReadingHeadingIds([
    'Thought Process', 'Thought Process', '...', '!!!', 'A & B', 'A B', 'café', 'Café',
    'Earlier', 'section 11', '???',
  ]), [
    'fd-reading-thought-process', 'fd-reading-thought-process-2',
    'fd-reading-section-3', 'fd-reading-section-4', 'fd-reading-a-b', 'fd-reading-a-b-2',
    'fd-reading-caf', 'fd-reading-caf-2', 'fd-reading-earlier',
    'fd-reading-section-11', 'fd-reading-section-11-2',
  ]);
  assert.deepEqual(F.fdReadingHeadingIds(['', null, 42]), [
    'fd-reading-section-1', 'fd-reading-section-2', 'fd-reading-section-3',
  ]);
});

test('resume returns a valid place only while its heading id is still available', () => {
  const F = make();
  const place = { heading: 'fd-reading-current', offset: 20, updatedAt: 30 };
  assert.deepEqual(F.fdReadingResume(place, ['fd-reading-old', 'fd-reading-current']), place);
  assert.equal(F.fdReadingResume(place, ['fd-reading-new']), null);
  assert.equal(F.fdReadingResume({ heading: 'old', offset: Infinity, updatedAt: 30 }, ['old']), null);
  assert.equal(F.fdReadingResume(place, Object.assign([], { extra: 'fd-reading-current' })), null);
});

test('dropping a page clones and preserves every other valid page', () => {
  const F = make();
  const original = {
    'a.md': { heading: 'a', offset: 1, updatedAt: 1 },
    'b.md': { heading: 'b', offset: 2, updatedAt: 2 },
  };
  const dropped = F.fdReadingPlaceDrop(original, 'a.md');
  assert.deepEqual(dropped, { 'b.md': { heading: 'b', offset: 2, updatedAt: 2 } });
  assert.deepEqual(Object.keys(original), ['a.md', 'b.md']);
  assert.notEqual(dropped, original);
});
