// "Updated since you last opened it": a one-time notice on a reading the learner marked read whose
// text changed after their last visit (frontdoor/fd_page_changed.js). Pins the fingerprint, the
// pure store step, the mount's failure modes, and the wiring into the learner reader only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SITE = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const source = readFileSync(new URL('frontdoor/fd_page_changed.js', SITE), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`${source}
return {fdPageFingerprint,fdPageSeenStep,fdPageChangedHtml,fdMountPageChanged,FD_PAGE_SEEN_KEY,FD_PAGE_SEEN_MAX};`)();

const DAY1 = Date.UTC(2026, 10, 20, 15);
const DAY2 = Date.UTC(2026, 10, 25, 9);

test('the fingerprint ignores re-wrapping and trailing space, and sees a one-word correction', () => {
  const a = F.fdPageFingerprint('Arrange HD now if the level\nis above 4.0.\n');
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(F.fdPageFingerprint('Arrange HD now if the level is above 4.0.'), a);
  assert.notEqual(F.fdPageFingerprint('Arrange HD now if the level is above 5.0.'), a);
  assert.equal(F.fdPageFingerprint(''), F.fdPageFingerprint(null));
});

test('a changed page the learner marked read shows the notice once, with the day they last opened it', () => {
  let seen = F.fdPageSeenStep({}, 'cotw.md', 'aaaaaaaa', true, DAY1);
  assert.equal(seen.changed, false, 'the first visit is a baseline, never a notice');
  seen = F.fdPageSeenStep(seen.next, 'cotw.md', 'bbbbbbbb', true, DAY2);
  assert.equal(seen.changed, true);
  assert.equal(seen.lastSeen, '2026-11-20');
  assert.deepEqual(seen.next['cotw.md'], { h: 'bbbbbbbb', at: '2026-11-25' });
  assert.equal(F.fdPageSeenStep(seen.next, 'cotw.md', 'bbbbbbbb', true, DAY2).changed, false, 'once only');
});

test('a page not marked read records its fingerprint but never shows the notice', () => {
  const first = F.fdPageSeenStep({}, 'x.md', 'aaaaaaaa', false, DAY1);
  const second = F.fdPageSeenStep(first.next, 'x.md', 'bbbbbbbb', false, DAY2);
  assert.equal(second.changed, false);
  assert.equal(second.next['x.md'].h, 'bbbbbbbb');
});

test('junk in the store is dropped, not trusted', () => {
  const step = F.fdPageSeenStep({ 'a.md': { h: 'not-hex' }, 'b.md': 7, 'c.md': { h: 'cccccccc', at: 3 } },
    'a.md', 'aaaaaaaa', true, DAY1);
  assert.equal(step.changed, false, 'an invalid stored fingerprint is not a change');
  assert.deepEqual(Object.keys(step.next).sort(), ['a.md', 'c.md']);
  assert.equal(step.next['c.md'].at, '');
  assert.equal(F.fdPageSeenStep([], 'a.md', 'aaaaaaaa', true, DAY1).changed, false);
});

test('the store is capped, dropping the least recently opened page', () => {
  let map = {};
  for (let i = 0; i < F.FD_PAGE_SEEN_MAX + 5; i += 1) {
    map = F.fdPageSeenStep(map, `p${i}.md`, 'aaaaaaaa', false, DAY1).next;
  }
  assert.equal(Object.keys(map).length, F.FD_PAGE_SEEN_MAX);
  assert.ok(!('p0.md' in map) && 'p404.md' in map);
  map = F.fdPageSeenStep(map, 'p5.md', 'aaaaaaaa', false, DAY1).next;
  assert.equal(Object.keys(map).pop(), 'p5.md', 'reopening moves a page to the back of the queue');
});

test('the notice is plain status text with no link, no button and no clinical words', () => {
  const html = F.fdPageChangedHtml('2026-11-20');
  assert.equal(html, '<p class="fd-page-changed" role="status">This page was updated after you last opened it on 2026-11-20. You marked it read, so skim it again for what changed.</p>');
  assert.doesNotMatch(F.fdPageChangedHtml('<script>'), /script/);
});

function memoryStore(initial = {}, { throwOnSet = false } = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { if (throwOnSet) throw new Error('quota'); data[k] = String(v); } };
}
function fakeBody() {
  const h1 = { html: '', insertAdjacentHTML(where, html) { assert.equal(where, 'afterend'); h1.html += html; } };
  return { h1, querySelector: (sel) => (sel === 'h1' ? h1 : (sel === '.fd-page-changed' && h1.html ? {} : null)) };
}

test('mount: baseline, then the notice after the title, then silence', () => {
  const store = memoryStore();
  const first = fakeBody();
  assert.equal(F.fdMountPageChanged(first, 'cotw.md', 'old text', true, { store, now: DAY1 }), false);
  assert.ok(JSON.parse(store.data[F.FD_PAGE_SEEN_KEY])['cotw.md']);
  const second = fakeBody();
  assert.equal(F.fdMountPageChanged(second, 'cotw.md', 'new text', true, { store, now: DAY2 }), true);
  assert.match(second.h1.html, /updated after you last opened it on 2026-11-20/);
  assert.equal(F.fdMountPageChanged(fakeBody(), 'cotw.md', 'new text', true, { store, now: DAY2 }), false);
});

test('mount: unreadable, junk or full storage never throws and never shows a notice', () => {
  const junk = memoryStore({ [F.FD_PAGE_SEEN_KEY]: '{not json' });
  assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', 't', true, { store: junk, now: DAY1 }), false);
  const full = memoryStore({ [F.FD_PAGE_SEEN_KEY]: JSON.stringify({ 'a.md': { h: '00000000', at: '2026-11-01' } }) },
    { throwOnSet: true });
  assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', 'changed', true, { store: full, now: DAY1 }), false,
    'a fingerprint that cannot be saved would repeat the notice forever, so none is shown');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', 't', true, { store: throwing, now: DAY1 }), false);
  assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', null, true, { store: memoryStore(), now: DAY1 }), false);
});

test('the learner reader mounts it on readings only, never in the faculty preview', () => {
  const spa = readFileSync(new URL('spa_index.html', SITE), 'utf8');
  const calls = spa.match(/fdMountPageChanged\([^;]*\);/g) || [];
  assert.equal(calls.length, 1);
  assert.match(spa, /if\(!facultyPreviewRequest&&item\.kind==='read'\)\{ var _seenProg=progLoad\(\); fdMountPageChanged\(body,ref,renderedMarkdown,/);
  assert.match(spa, /renderedMarkdown=markdown;/);
  assert.equal(spa.split('/*__FD_PAGE_CHANGED__*/').length - 1, 1);
  assert.match(source, /'cw_page_seen_v1'/, 'a cw_ key, so Erase everything clears it');
  assert.doesNotMatch(source, /cw_progress_v1'\s*,|setItem\('cw_progress/, 'never writes canonical progress');
});

test('blocked site storage: reading the localStorage property itself throws, and the mount still returns false', () => {
  // Chrome and Firefox throw a SecurityError from the localStorage GETTER (typeof included) when
  // the user blocks site data; the earlier test only covered methods that throw on a store in hand.
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    get() { throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' }); } });
  try {
    assert.doesNotThrow(() => F.fdMountPageChanged(fakeBody(), 'a.md', 'text', true, { now: DAY1 }));
    assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', 'text', true, { now: DAY1 }), false);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete globalThis.localStorage;
  }
});

test('a body that throws mid-mount never escapes into the reader', () => {
  const store = memoryStore({ [F.FD_PAGE_SEEN_KEY]: JSON.stringify({ 'a.md': { h: '00000000', at: '2026-11-01' } }) });
  const hostile = { querySelector() { throw new Error('detached'); } };
  assert.equal(F.fdMountPageChanged(hostile, 'a.md', 'changed', true, { store, now: DAY1 }), false);
});
