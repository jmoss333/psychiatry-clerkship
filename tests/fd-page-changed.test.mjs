// "Updated since you last opened it": a one-time notice on a reading the learner marked read whose
// AUTHOR marked a content update after their last visit (frontdoor/fd_page_changed.js). Pins the
// marker parser, the pure store step (including rows from the first, whole-text version), the
// mount's failure modes, and the wiring into the learner reader only. The point of the marker:
// a typo fix, a re-wrap or a citation renumber must never prompt a learner to re-read a page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SITE = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const source = readFileSync(new URL('frontdoor/fd_page_changed.js', SITE), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`${source}
return {fdPageContentVersion,fdPageSeenStep,fdPageChangedHtml,fdMountPageChanged,FD_PAGE_SEEN_KEY,FD_PAGE_SEEN_MAX};`)();

const DAY1 = Date.UTC(2026, 10, 20, 15);
const DAY2 = Date.UTC(2026, 10, 25, 9);
const DAY3 = Date.UTC(2026, 11, 2, 9);

test('the content version is the author\'s marker, and nothing else about the text', () => {
  const page = '# Lithium\n\n<!-- content-updated: 2026-11-24 -->\n\nArrange HD now if the level is above 4.0.\n';
  assert.equal(F.fdPageContentVersion(page), '2026-11-24');
  assert.equal(F.fdPageContentVersion(page.replace('4.0', '5.0')), '2026-11-24', 'an unmarked edit is not an update');
  assert.equal(F.fdPageContentVersion(page.replace('Arrange', 'Arange')), '2026-11-24', 'a typo is not an update');
  assert.equal(F.fdPageContentVersion('<!--content-updated:2026-11-24-->'), '2026-11-24', 'spacing inside the comment is free');
  assert.equal(F.fdPageContentVersion('<!-- Content-Updated: 2026-12-01 -->'), '2026-12-01');
  for (const none of ['no marker', '', null, undefined, '<!-- content-updated: 2026-02-30 -->',
    '<!-- content-updated: 26-11-24 -->', 'content-updated: 2026-11-24', '<!-- content-updated: soon -->']) {
    assert.equal(F.fdPageContentVersion(none), '', String(none));
  }
});

test('a marked update the learner has not seen shows the notice once, with both dates', () => {
  let seen = F.fdPageSeenStep({}, 'cotw.md', '', true, DAY1);
  assert.equal(seen.changed, false, 'the first visit is a baseline, never a notice');
  assert.deepEqual(seen.next['cotw.md'], { v: '', at: '2026-11-20' });
  seen = F.fdPageSeenStep(seen.next, 'cotw.md', '2026-11-24', true, DAY2);
  assert.equal(seen.changed, true);
  assert.equal(seen.lastSeen, '2026-11-20');
  assert.equal(seen.updated, '2026-11-24');
  assert.deepEqual(seen.next['cotw.md'], { v: '2026-11-24', at: '2026-11-25' });
  assert.equal(F.fdPageSeenStep(seen.next, 'cotw.md', '2026-11-24', true, DAY3).changed, false, 'once only');
  assert.equal(F.fdPageSeenStep(seen.next, 'cotw.md', '2026-12-01', true, DAY3).changed, true, 'the next marked update shows again');
});

test('an unmarked edit never shows the notice: the typo-fix case', () => {
  // The text changed between visits (a typo fix), the marker did not: the module never sees text.
  let seen = F.fdPageSeenStep({}, 'cotw.md', '2026-11-24', true, DAY1);
  seen = F.fdPageSeenStep(seen.next, 'cotw.md', '2026-11-24', true, DAY2);
  assert.equal(seen.changed, false);
  seen = F.fdPageSeenStep(seen.next, 'cotw.md', '', true, DAY3);
  assert.equal(seen.changed, false, 'a marker removed is not an update');
});

test('a marker dated before the learner\'s last open stays silent (back-dated, already read)', () => {
  const seen = F.fdPageSeenStep({ 'cotw.md': { v: '', at: '2026-11-25' } }, 'cotw.md', '2026-11-24', true, DAY3);
  assert.equal(seen.changed, false);
  const sameDay = F.fdPageSeenStep({ 'cotw.md': { v: '', at: '2026-11-24' } }, 'cotw.md', '2026-11-24', true, DAY3);
  assert.equal(sameDay.changed, true, 'opened on the day of the update, possibly before it shipped: say so');
});

test('rows from the first version (whole-text fingerprint) migrate as "no marker seen"', () => {
  const legacy = { 'cotw.md': { h: 'aaaaaaaa', at: '2026-11-20' }, 'other.md': { h: 'bbbbbbbb', at: '2026-11-21' } };
  const unmarked = F.fdPageSeenStep(legacy, 'cotw.md', '', true, DAY2);
  assert.equal(unmarked.changed, false, 'a page with no marker never notifies, whatever its old hash');
  assert.deepEqual(unmarked.next['other.md'], { v: '', at: '2026-11-21' });
  assert.equal(F.fdPageSeenStep(legacy, 'cotw.md', '2026-11-24', true, DAY2).changed, true,
    'read on 11-20, marked updated 11-24: notify');
  assert.equal(F.fdPageSeenStep(legacy, 'cotw.md', '2026-11-19', true, DAY2).changed, false,
    'read on 11-20, marked updated 11-19: already read the update');
});

test('a page not marked read records the marker but never shows the notice', () => {
  const first = F.fdPageSeenStep({}, 'x.md', '', false, DAY1);
  const second = F.fdPageSeenStep(first.next, 'x.md', '2026-11-24', false, DAY2);
  assert.equal(second.changed, false);
  assert.equal(second.next['x.md'].v, '2026-11-24');
});

test('junk in the store is dropped, not trusted', () => {
  const step = F.fdPageSeenStep({ 'a.md': { h: 'not-hex' }, 'b.md': 7, 'c.md': { v: '2026-11-01', at: 3 },
    'd.md': { v: 'soon', at: '2026-11-01' } }, 'a.md', '2026-11-24', true, DAY1);
  assert.equal(step.changed, false, 'an invalid stored row is not a prior visit');
  assert.deepEqual(Object.keys(step.next).sort(), ['a.md', 'c.md']);
  assert.equal(step.next['c.md'].at, '');
  assert.equal(F.fdPageSeenStep([], 'a.md', '2026-11-24', true, DAY1).changed, false);
  assert.equal(F.fdPageSeenStep({}, 'a.md', 'soon', true, DAY1).next['a.md'].v, '', 'a malformed version is stored as none');
});

test('the store is capped, dropping the least recently opened page', () => {
  let map = {};
  for (let i = 0; i < F.FD_PAGE_SEEN_MAX + 5; i += 1) {
    map = F.fdPageSeenStep(map, `p${i}.md`, '', false, DAY1).next;
  }
  assert.equal(Object.keys(map).length, F.FD_PAGE_SEEN_MAX);
  assert.ok(!('p0.md' in map) && 'p404.md' in map);
  map = F.fdPageSeenStep(map, 'p5.md', '', false, DAY1).next;
  assert.equal(Object.keys(map).pop(), 'p5.md', 'reopening moves a page to the back of the queue');
});

test('the notice is plain status text with no link, no button and no clinical words', () => {
  assert.equal(F.fdPageChangedHtml('2026-11-20', '2026-11-24'),
    '<p class="fd-page-changed" role="status">This page was updated on 2026-11-24, after you last opened it on 2026-11-20. You marked it read, so skim it again for what changed.</p>');
  assert.equal(F.fdPageChangedHtml('', '2026-11-24'),
    '<p class="fd-page-changed" role="status">This page was updated on 2026-11-24, after you last opened it. You marked it read, so skim it again for what changed.</p>');
  assert.doesNotMatch(F.fdPageChangedHtml('<script>', '<img onerror=x>'), /script|img/);
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
  const typo = fakeBody();
  assert.equal(F.fdMountPageChanged(typo, 'cotw.md', 'old txet', true, { store, now: DAY1 }), false, 'an unmarked edit is silent');
  const second = fakeBody();
  const corrected = 'new text\n<!-- content-updated: 2026-11-24 -->\n';
  assert.equal(F.fdMountPageChanged(second, 'cotw.md', corrected, true, { store, now: DAY2 }), true);
  assert.match(second.h1.html, /updated on 2026-11-24, after you last opened it on 2026-11-20/);
  assert.equal(F.fdMountPageChanged(fakeBody(), 'cotw.md', corrected.replace('new', 'New'), true, { store, now: DAY2 }), false);
});

test('mount: unreadable, junk or full storage never throws and never shows a notice', () => {
  const junk = memoryStore({ [F.FD_PAGE_SEEN_KEY]: '{not json' });
  assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', 't', true, { store: junk, now: DAY1 }), false);
  const full = memoryStore({ [F.FD_PAGE_SEEN_KEY]: JSON.stringify({ 'a.md': { h: '00000000', at: '2026-11-01' } }) },
    { throwOnSet: true });
  assert.equal(F.fdMountPageChanged(fakeBody(), 'a.md', '<!-- content-updated: 2026-11-20 -->', true, { store: full, now: DAY1 }), false,
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
  assert.equal(F.fdMountPageChanged(hostile, 'a.md', '<!-- content-updated: 2026-11-20 -->', true, { store, now: DAY1 }), false);
});
