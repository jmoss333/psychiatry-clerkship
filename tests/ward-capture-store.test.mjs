// Behavioural tests for the ward question-capture store (cw_capture_v1).
// Pattern follows tests/srs-home-counters.test.mjs: slice the real functions out of the
// shipped single-file source and execute them. Runs BEFORE the build in build_and_check.sh,
// so everything here reads source — never _build/ — and never touches a browser API.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');
const phi = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/phi_heuristic.js',
  import.meta.url,
), 'utf8');
const due = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js',
  import.meta.url,
), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

function memStorage(throwOnWrite = false) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (throwOnWrite) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
}

const storeCode = slice(shell, 'var CAP_MAX=', '/* ---- end ward capture store ---- */');
const captureUiCode = slice(shell, 'function capAttr(', 'function capOpen(');

function makeCaptureUi(items, match = null) {
  // These renderers are the real shell functions; only the device store and search result are inputs.
  // eslint-disable-next-line no-new-func
  return new Function('capRead', 'esc', 'window', `${captureUiCode}\nreturn {
    capListHtml:capListHtml, capNextHtml:capNextHtml,
    capRouteHtml:typeof capRouteHtml==='function'?capRouteHtml:null,
  };`)(() => ({ v: 2, items }), (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;'), { fdCaptureMatchForQuestion: () => match });
}

function makeStore({ throwOnWrite = false, currentItem = { k: 'page', f: 't_mood.md' }, storage = null,
  now = null, random = null } = {}) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'currentItem', 'Date', 'Math', `
    ${phi}
    ${storeCode}
    return { capRead: capRead, capWrite: capWrite, capAdd: capAdd, capRemove: capRemove,
      capEraseAll: capEraseAll, capRisky: capRisky,
      capSetRoute: typeof capSetRoute==='function'?capSetRoute:null,
      capOldestUnrouted: typeof capOldestUnrouted==='function'?capOldestUnrouted:null,
      capClipboardText: capClipboardText, capCtx: capCtx, CAP_MAX: CAP_MAX, CAP_LIMIT: CAP_LIMIT };
  `);
  const fixedDate = now === null ? Date : { now: () => now };
  const fixedMath = random === null ? Math : Object.assign(Object.create(Math), { random });
  return factory(storage || memStorage(throwOnWrite), currentItem, fixedDate, fixedMath);
}

test('T4a: text is hard-capped at 280 characters on write', () => {
  const s = makeStore();
  s.capAdd('x'.repeat(400));
  const items = s.capRead().items;
  assert.equal(items.length, 1);
  assert.equal(items[0].text.length, 280);
});

test('T4b: text is re-clamped on read, so a hand-edited store cannot widen the cap', () => {
  const ls = memStorage();
  ls.setItem('cw_capture_v1', JSON.stringify({
    v: 1, items: [{ id: 'c_x', text: 'y'.repeat(900), at: 1, ctx: null, triaged: false }],
  }));
  // eslint-disable-next-line no-new-func
  const s = new Function('localStorage', 'currentItem', `${phi}\n${storeCode}\nreturn {capRead:capRead};`)(ls, null);
  assert.equal(s.capRead().items[0].text.length, 280);
});

test('T4c: the store caps at 50 items and evicts routed entries first', () => {
  const s = makeStore();
  for (let i = 0; i < 50; i += 1) s.capAdd(`question ${i}`);
  // Route an early question; it must be evicted before an older unrouted question.
  const early = s.capRead().items[3];
  s.capSetRoute(early.id, 'rounds');
  s.capAdd('the fifty-first question');
  const items = s.capRead().items;
  assert.equal(items.length, 50, 'FIFO cap holds at CAP_LIMIT');
  assert.ok(!items.some((it) => it.id === early.id), 'the routed item was evicted first');
  assert.ok(items.some((it) => it.text === 'question 0'), 'the oldest unrouted item survived');
  assert.ok(items.some((it) => it.text === 'the fifty-first question'));
});

test('T4d: a corrupt or non-object store resets instead of throwing past the reader', () => {
  for (const bad of ['not json at all', '{"v":1}', '[]', 'null', '{"v":1,"items":"nope"}']) {
    const ls = memStorage();
    ls.setItem('cw_capture_v1', bad);
    // eslint-disable-next-line no-new-func
    const s = new Function('localStorage', 'currentItem', `${phi}\n${storeCode}\nreturn {capRead:capRead};`)(ls, null);
    assert.deepEqual(s.capRead(), { v: 2, items: [] }, `reset on: ${bad}`);
  }
});

test('T4e: a failed write reports false rather than dropping the capture silently', () => {
  const s = makeStore({ throwOnWrite: true });
  assert.equal(s.capAdd('why clozapine here'), false);
});

test('deleting a retained question returns false when the remaining inbox cannot be written', () => {
  const storage = memStorage();
  const s = makeStore({ storage });
  const first = s.capAdd('first question');
  s.capAdd('second question');
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(s.capRemove(first), false);
  assert.deepEqual(s.capRead().items.map((item) => item.text), ['first question', 'second question']);
});

test('deleting the last question and Erase all return false when removal fails', () => {
  const storage = memStorage();
  const s = makeStore({ storage });
  const id = s.capAdd('only question');
  storage.removeItem = () => { throw new Error('Storage blocked'); };
  assert.equal(s.capRemove(id), false);
  assert.equal(s.capEraseAll(), false);
  assert.deepEqual(s.capRead().items.map((item) => item.text), ['only question']);
});

test('T4f: ctx is null on special routes, never a stale cw_last slug', () => {
  assert.equal(makeStore({ currentItem: { k: 'special', f: '__home__' } }).capCtx(), null);
  assert.equal(makeStore({ currentItem: null }).capCtx(), null);
  assert.equal(makeStore({ currentItem: { k: 'page', f: 't_mood.md' } }).capCtx(), 't_mood.md');
});

test('T4g: capRisky adds ward-local location detection on top of the shared heuristic', () => {
  const s = makeStore();
  // shared PHI_PATTERNS still apply
  assert.equal(s.capRisky('MRN 4482913'), true);
  assert.equal(s.capRisky('dob 3/14/1990'), true);
  // capture-local rule the shared file deliberately does not carry
  assert.equal(s.capRisky('the guy in room 302'), true);
  assert.equal(s.capRisky('bed 4 is refusing meds'), true);
  assert.equal(s.capRisky('rm7 patient'), true);
  // legitimate clinical questions full of numbers must NOT trip it
  assert.equal(s.capRisky('why do we stop at QTc over 500'), false);
  assert.equal(s.capRisky('lithium level 1.2 — is that toxic'), false);
  assert.equal(s.capRisky('why clozapine and not another antipsychotic'), false);
});

test('T4h: every clipboard payload carries the supervised-draft stamp', () => {
  const s = makeStore();
  s.capAdd('why clozapine here');
  const out = s.capClipboardText();
  assert.match(out, /^Questions from the unit, brought to supervision\./);
  assert.match(out, /contains no patient information\./);
  assert.match(out, /- why clozapine here/);
});

test('T4i: the clipboard payload includes every retained open route', () => {
  const s = makeStore();
  s.capAdd('first question');
  s.capAdd('second question');
  s.capSetRoute(s.capRead().items[0].id, 'later');
  const out = s.capClipboardText();
  assert.ok(out.includes('first question'));
  assert.ok(out.includes('second question'));
});

test('Done removes an unrouted question without assigning a route', () => {
  const s = makeStore();
  const id = s.capAdd('A safe question');
  assert.equal(s.capRead().items[0].route, null);
  s.capRemove(id);
  assert.deepEqual(s.capRead().items, []);
});

test('saved confirmation precedes optional route choices and Done, including with a resource match', () => {
  const ui = makeCaptureUi([{ id: 'c1', text: 'Question?', at: 1, route: null, state: 'open' }],
    { ref: 'topic.md', title: 'Topic', hasQuiz: true });
  assert.equal(typeof ui.capRouteHtml, 'function');
  const html = ui.capNextHtml('c1', 'Question?');
  const saved = html.indexOf('Saved on this device');
  const rounds = html.indexOf('Ask on rounds');
  const supervision = html.indexOf('Discuss in supervision');
  const later = html.indexOf('Look up later');
  assert.ok(saved >= 0 && saved < rounds && rounds < supervision && supervision < later);
  assert.match(html, /data-cap-route="rounds" data-cap-id="c1"/);
  assert.match(html, /data-cap-route="supervision" data-cap-id="c1"/);
  assert.match(html, /data-cap-route="later" data-cap-id="c1"/);
  assert.match(html, /data-cap-drop="c1"[^>]*>Done</);
  assert.match(html, /data-cap-open="c1"/);
  assert.match(html, /data-cap-review="c1"[^>]*>Schedule review</);
});

test('full Capture inbox retains routed questions and escapes learner text', () => {
  const html = makeCaptureUi([
    { id: 'one', text: '<img src=x onerror=alert(1)>', at: 1, route: null, state: 'open' },
    { id: 'two', text: 'Second question', at: 2, route: 'rounds', state: 'open' },
    { id: 'three', text: 'Third question', at: 3, route: 'supervision', state: 'open' },
    { id: 'four', text: 'Fourth question', at: 4, route: 'later', state: 'open' },
  ]).capListHtml();
  for (const label of ['Unrouted', 'Ask on rounds', 'Discuss in supervision', 'Look up later'])
    assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, /&lt;img/);
  assert.match(html, /data-cap-del="four"/);
  assert.match(html, /data-cap-copy="1"[^>]*>Copy questions</);
  assert.match(html, /Erase all captures/);
});

test('email selection is explicit, limited to open questions, and escaped in the full inbox', () => {
  const html = makeCaptureUi([
    { id: 'one', text: '<img src=x onerror=alert(1)>', at: 1, route: null, state: 'open' },
    { id: 'two', text: 'Already done', at: 2, route: 'later', state: 'done' },
  ]).capListHtml();
  assert.match(html, /type="checkbox"[^>]*data-cap-email-id="one"/);
  assert.doesNotMatch(html, /data-cap-email-id="two"/);
  assert.doesNotMatch(html, /\bchecked\b/);
  assert.match(html, /id="capEmailSelect"[^>]*disabled[^>]*>Email selected questions</);
  assert.match(html, /Select question for email: &lt;img/);
  assert.doesNotMatch(html, /<img\b/);
});

function makeCaptureAction({ scheduleSucceeds = true, preview = false, dialog = false,
  storage = memStorage() } = {}) {
  const opened = [], events = [], focus = { activeElement: null };
  const editor = { focus() { focus.activeElement = this; events.push('focus editor'); } };
  const actionCode = slice(shell, 'function fdCaptureAction(', 'function fdRefreshLocalCompletion(');
  const focusCode = shell.includes('function capFocusEditor(')
    ? slice(shell, 'function capFocusEditor(', 'function capOpen(') : '';
  // The real action function and store operate on the same in-memory device store. The only
  // external dependency is whether the SRS write succeeded, which this action must honor.
  // eslint-disable-next-line no-new-func
  const action = new Function('localStorage', 'opened', 'events', 'focus', 'editor', 'dialog',
    'scheduleSucceeds', 'facultyPreviewRequest', `
    ${phi}
    var currentItem=null, capSheet=dialog?{
      querySelector:function(selector){ return selector==='#capText'?editor:null; },
      querySelectorAll:function(){ return []; }
    }:null;
    ${storeCode}
    function capRouteLabel(v){ return v; }
    function capRenderBody(){ events.push('render'); }
    function capRefreshNext(){ events.push('refresh'); focus.activeElement=null; }
    function specialRefresh(){ events.push('today'); }
    function capAnnounce(message){ events.push(message); }
    function capRemainingText(){ return ''; }
    function capClose(){} function showFacultyPreviewLockNotice(){}
    function fdOpenRef(ref){ opened.push(ref); }
    function seedSRS(){ return scheduleSucceeds; }
    ${focusCode}
    ${actionCode}
    return {capAdd:capAdd,capRead:capRead,fdCaptureAction:fdCaptureAction};
  `)(storage, opened, events, focus, editor, dialog, scheduleSucceeds, preview);
  const el = (attrs) => ({
    getAttribute: (key) => attrs[key] ?? null,
    hasAttribute: (key) => Object.hasOwn(attrs, key),
    focus() { focus.activeElement = this; },
  });
  return { ...action, storage, opened, events, focus, editor, el };
}

test('Open now leaves the route untouched while Schedule review assigns later only after SRS success', () => {
  const failed = makeCaptureAction({ scheduleSucceeds: false });
  const id = failed.capAdd('Question?');
  failed.fdCaptureAction(failed.el({ 'data-cap-open': id, 'data-cap-ref': 'topic.md' }));
  assert.deepEqual(failed.opened, ['topic.md']);
  assert.equal(failed.capRead().items[0].route, null);
  failed.fdCaptureAction(failed.el({ 'data-cap-review': id, 'data-cap-ref': 'topic.md' }));
  assert.equal(failed.capRead().items[0].route, null);

  const succeeded = makeCaptureAction();
  const id2 = succeeded.capAdd('Question?');
  succeeded.fdCaptureAction(succeeded.el({ 'data-cap-review': id2, 'data-cap-ref': 'topic.md' }));
  assert.equal(succeeded.capRead().items[0].route, 'later');
});

test('Done removes an unrouted question and faculty preview does not mutate a route', () => {
  const normal = makeCaptureAction();
  const id = normal.capAdd('Question?');
  normal.fdCaptureAction(normal.el({ 'data-cap-drop': id }));
  assert.deepEqual(normal.capRead().items, []);

  const preview = makeCaptureAction({ preview: true });
  const id2 = preview.capAdd('Question?');
  preview.fdCaptureAction(preview.el({ 'data-cap-route': 'rounds', 'data-cap-id': id2 }));
  assert.equal(preview.capRead().items[0].route, null);
});

test('Schedule review and Done restore focus inside the open Capture dialog after replacing saved actions', () => {
  const h = makeCaptureAction({ dialog: true });
  const id = h.capAdd('Question?');
  const schedule = h.el({ 'data-cap-review': id, 'data-cap-ref': 'topic.md' });
  schedule.focus();
  h.fdCaptureAction(schedule);
  assert.equal(h.focus.activeElement, h.editor);
  assert.equal(h.capRead().items[0].route, 'later');

  const done = h.el({ 'data-cap-drop': id });
  done.focus();
  h.fdCaptureAction(done);
  assert.equal(h.focus.activeElement, h.editor);
  assert.deepEqual(h.capRead().items, []);
});

test('failed Done or route write keeps the dialog unchanged and announces the failure', () => {
  const storage = memStorage();
  const h = makeCaptureAction({ dialog: true, storage });
  const id = h.capAdd('Question?');
  storage.removeItem = () => { throw new Error('Storage blocked'); };
  const done = h.el({ 'data-cap-drop': id });
  done.focus();
  h.fdCaptureAction(done);
  assert.equal(h.focus.activeElement, done);
  assert.deepEqual(h.capRead().items.map((item) => item.text), ['Question?']);
  assert.equal(h.events.includes('render'), false);
  assert.equal(h.events.includes('today'), false);
  assert.ok(h.events.some((event) => /could not.*done|could not.*finish/i.test(event)));

  storage.setItem = () => { throw new Error('Storage blocked'); };
  const route = h.el({ 'data-cap-route': 'rounds', 'data-cap-id': id });
  h.fdCaptureAction(route);
  assert.equal(h.capRead().items[0].route, null);
  assert.ok(h.events.some((event) => /could not.*route/i.test(event)));
});

test('SRS seeding reports write failure so a Capture route cannot imply scheduling', () => {
  const code = shell.match(/function seedSRS\(file\)\{[^\n]+\}/)?.[0];
  assert.ok(code, 'seedSRS source missing');
  // eslint-disable-next-line no-new-func
  const seed = new Function('localStorage', 'topicHasQuiz', `${code};return seedSRS;`)(
    memStorage(true), () => true);
  assert.equal(seed('topic.md'), false);
});

test('v1 statuses migrate to v2 routes without inventing a destination', () => {
  const ls = memStorage();
  ls.setItem('cw_capture_v1', JSON.stringify({ v: 1, items: [
    { id: 'a', text: 'one', status: 'new', at: 11, ctx: 't_mood.md' },
    { id: 'b', text: 'two', status: 'supervision', at: 12, ctx: null },
    { id: 'c', text: 'three', status: 'scheduled', at: 13, ctx: 'pg_interview.md' },
    { id: 'd', text: 'four', status: 'triaged', at: 14, ctx: null },
  ] }));
  const items = makeStore({ storage: ls }).capRead().items;
  assert.deepEqual(items.map((x) => [x.route, x.state]), [
    [null, 'open'], ['supervision', 'open'], ['later', 'open'], [null, 'open'],
  ]);
  assert.deepEqual(items.map((x) => [x.id, x.text, x.at, x.ctx]), [
    ['a', 'one', 11, 't_mood.md'], ['b', 'two', 12, null],
    ['c', 'three', 13, 'pg_interview.md'], ['d', 'four', 14, null],
  ]);
  assert.equal(makeStore({ storage: ls }).capRead().v, 2);
});

test('a legacy scheduled capture leaves existing SRS bytes untouched through migration and first write', () => {
  const ls = memStorage();
  const srs = '{"v":1,"cards":{"t_mood.md":{"due":123,"box":2}}}';
  ls.setItem('cw_srs_v1', srs);
  ls.setItem('cw_capture_v1', JSON.stringify({ v: 1, items: [
    { id: 'scheduled', text: 'Which source next?', status: 'scheduled', at: 77, ctx: 't_mood.md' },
  ] }));
  const legacyBytes = ls.getItem('cw_capture_v1');
  const s = makeStore({ storage: ls });
  assert.equal(s.capRead().items[0].route, 'later');
  assert.equal(ls.getItem('cw_capture_v1'), legacyBytes, 'read-only migration leaves the old bytes intact');
  assert.equal(ls.getItem('cw_srs_v1'), srs);
  assert.equal(s.capSetRoute('scheduled', 'supervision'), true);
  assert.equal(JSON.parse(ls.getItem('cw_capture_v1')).v, 2);
  assert.equal(ls.getItem('cw_srs_v1'), srs);
  assert.deepEqual(s.capRead().items.map((x) => [x.route, x.at, x.ctx]), [
    ['supervision', 77, 't_mood.md'],
  ]);
});

test('save writes an unrouted open v2 question before any route mutation', () => {
  const ls = memStorage();
  const s = makeStore({ storage: ls });
  const id = s.capAdd('How should I organize this learning question?');
  const raw = JSON.parse(ls.getItem('cw_capture_v1'));
  assert.equal(raw.v, 2);
  assert.deepEqual(raw.items.map((x) => [x.id, x.route, x.state]), [[id, null, 'open']]);
  assert.equal(Object.hasOwn(raw.items[0], 'status'), false);
  assert.equal(Object.hasOwn(raw.items[0], 'triaged'), false);
  assert.equal(s.capSetRoute(id, 'rounds'), true);
  assert.equal(s.capRead().items[0].route, 'rounds');
});

test('two captures with identical clock and random values get distinct retained ids', () => {
  const ls = memStorage();
  const s = makeStore({ storage: ls, now: 1000, random: () => 0.25 });
  const first = s.capAdd('first question');
  const second = s.capAdd('second question');
  assert.equal(typeof first, 'string');
  assert.equal(typeof second, 'string');
  assert.notEqual(second, first);
  assert.deepEqual(s.capRead().items.map((x) => [x.id, x.text]), [
    [first, 'first question'], [second, 'second question'],
  ]);
  assert.equal(s.capSetRoute(second, 'rounds'), true);
  assert.deepEqual(s.capRead().items.map((x) => x.route), [null, 'rounds']);
});

test('an unusable id generator reports failure without changing stored captures', () => {
  const ls = memStorage();
  const s = makeStore({ storage: ls, now: 1000, random: () => { throw new Error('unavailable'); } });
  assert.equal(s.capAdd('a safe question'), false);
  assert.equal(ls.getItem('cw_capture_v1'), null);
});

test('a full inbox keeps the newly saved question if the device clock moved backward', () => {
  const ls = memStorage();
  ls.setItem('cw_capture_v1', JSON.stringify({ v: 2, items: Array.from({ length: 50 }, (_, i) => ({
    id: `u${i}`, text: `older capture ${i}`, at: 5000 + i, ctx: null, route: null, state: 'open',
  })) }));
  const s = makeStore({ storage: ls, now: 1000, random: () => 0.25 });
  const saved = s.capAdd('new question after clock reset');
  assert.equal(typeof saved, 'string');
  assert.equal(s.capRead().items.length, 50);
  assert.ok(s.capRead().items.some((x) => x.id === saved && x.text === 'new question after clock reset'));
  assert.ok(!s.capRead().items.some((x) => x.id === 'u0'));
});

test('route changes accept only the three destinations or explicit null', () => {
  const s = makeStore();
  const id = s.capAdd('A safe question');
  for (const bad of ['scheduled', 'triaged', '', 'RoundS', '__proto__', undefined, {}, ['rounds']]) {
    assert.equal(s.capSetRoute(id, bad), false, String(bad));
    assert.equal(s.capRead().items[0].route, null);
  }
  assert.equal(s.capSetRoute('missing', 'rounds'), false);
  for (const good of ['rounds', 'supervision', 'later', null]) {
    assert.equal(s.capSetRoute(id, good), true, String(good));
    assert.equal(s.capRead().items[0].route, good);
  }
});

test('malformed versions and prototype-like rows cannot become saved captures', () => {
  const ls = memStorage();
  const s = makeStore({ storage: ls });
  for (const v of [0, 3, '1', '2', null]) {
    ls.setItem('cw_capture_v1', JSON.stringify({ v, items: [{ id: 'good', text: 'question' }] }));
    assert.deepEqual(s.capRead(), { v: 2, items: [] }, String(v));
  }
  ls.setItem('cw_capture_v1', JSON.stringify({ v: 2, items: [
    { id: '__proto__', text: 'must not survive' },
    { id: 'constructor', text: 'must not survive' },
    { text: 'missing id' },
    JSON.parse('{"id":"good","text":"kept","route":"rounds","state":"done","at":21,"ctx":"t_mood.md","__proto__":{"hacked":true}}'),
    { id: 'good', text: 'duplicate id' },
    { id: 'blank', text: '   ' },
    { id: 'object', text: { toString: 'trap' } },
  ] }));
  const items = s.capRead().items;
  assert.deepEqual(items.map((x) => [x.id, x.text, x.route, x.state, x.at, x.ctx]), [
    ['good', 'kept', 'rounds', 'done', 21, 't_mood.md'],
  ]);
  assert.equal({}.hacked, undefined);
});

test('v2 read normalizes invalid routes, states, timestamps, and context without throwing', () => {
  const ls = memStorage();
  ls.setItem('cw_capture_v1', JSON.stringify({ v: 2, items: [
    { id: 'a', text: 'x'.repeat(400), route: '__proto__', state: 'bogus', at: 'not a date', ctx: { ref: 't_mood.md' } },
    { id: 'b', text: 'second', route: { toString: 'trap' }, state: {}, at: -4, ctx: 't_mood.md' },
  ] }));
  const items = makeStore({ storage: ls }).capRead().items;
  assert.deepEqual(items.map((x) => [x.id, x.route, x.state, x.at, x.ctx]), [
    ['a', null, 'open', 0, null], ['b', null, 'open', 0, 't_mood.md'],
  ]);
  assert.equal(items[0].text.length, 280);
});

test('oldest unrouted selection ignores routed and done captures with timestamp and id tie-breaking', () => {
  const s = makeStore();
  assert.equal(typeof s.capOldestUnrouted, 'function');
  const rows = [
    { id: 'newer', route: null, state: 'open', at: 30 },
    { id: 'routed', route: 'later', state: 'open', at: 1 },
    { id: 'b', route: null, state: 'open', at: 10 },
    { id: 'done', route: null, state: 'done', at: 1 },
    { id: 'a', route: null, state: 'open', at: 10 },
  ];
  assert.equal(s.capOldestUnrouted(rows).id, 'a');
  assert.equal(s.capOldestUnrouted(rows.filter((x) => x.route || x.state === 'done')), null);
});

test('over-limit read and a new save evict the oldest routed item by timestamp then id', () => {
  const ls = memStorage();
  const items = Array.from({ length: 48 }, (_, i) => ({
    id: `u${i}`, text: `unrouted ${i}`, at: i + 1, route: null, state: 'open', ctx: null,
  }));
  items.push(
    { id: 'r_b', text: 'routed b', at: 5, route: 'later', state: 'open', ctx: null },
    { id: 'r_a', text: 'routed a', at: 5, route: 'rounds', state: 'open', ctx: null },
  );
  ls.setItem('cw_capture_v1', JSON.stringify({ v: 2, items: [
    ...items, { id: 'r_old', text: 'older routed', at: 2, route: 'supervision', state: 'open' },
  ] }));
  const s = makeStore({ storage: ls });
  assert.equal(s.capRead().items.length, 50);
  assert.ok(!s.capRead().items.some((x) => x.id === 'r_old'));
  s.capAdd('fifty-first');
  assert.ok(!s.capRead().items.some((x) => x.id === 'r_a'));
  assert.ok(s.capRead().items.some((x) => x.id === 'r_b'));
  s.capAdd('fifty-second');
  assert.ok(!s.capRead().items.some((x) => x.id === 'r_b'));
  assert.ok(s.capRead().items.some((x) => x.id === 'u0'));
  s.capAdd('fifty-third');
  assert.ok(!s.capRead().items.some((x) => x.id === 'u0'));
});

test('T5: the study export allow-list does not carry the capture key', () => {
  // Static assertion over the payload literal — exportStudy needs Blob/URL/document, none of
  // which exist under bare `node --test`, and this suite runs before the build anyway.
  const payload = slice(shell, 'var payload={ study_id:studyId()', '};');
  assert.match(payload, /schema:'clerkship-study-v2'/, 'anchor still points at the export payload');
  assert.ok(!payload.includes('cw_capture_v1'),
    'captures are free text and must never enter the study export');
});

test('T11: the point-of-entry warning ships the approved copy', () => {
  assert.ok(shell.includes('<strong>The question, not the patient.</strong>'));
  assert.ok(shell.includes('No names, initials, room or bed numbers, dates, or MRNs'));
  assert.ok(shell.includes('Saved on this device. Nothing leaves unless you choose Copy or Email. No patient details.'));
  assert.ok(shell.includes('<b>This may contain patient details.</b>'));
  assert.ok(shell.includes('No patient details — save'));
  assert.match(shell, /aria-label="Your question, no patient identifiers"/);
});

test('T11b: focus return is guarded on the recorded invoker still being connected and visible', () => {
  const close = slice(shell, 'function capClose(', 'function capListHtml(');
  assert.match(close, /inv\s*&&\s*inv\.isConnected\s*&&\s*inv\.offsetParent!==null/,
    'two mount points + a viewport that can cross 820px mid-dialog means the invoker may be gone');
  assert.match(close, /contentEl\.focus\(\{preventScroll:true\}\)/,
    'falls back to #content rather than leaving focus on <body>');
  assert.match(close, /aria-expanded','false'/, 'both invokers are reset on close');
});

test('T12a: Schedule review is offered only for a quiz-bearing matched page', () => {
  const items = [{ id: 'c1', text: 'Question?', at: 1, route: null, state: 'open' }];
  const quiz = makeCaptureUi(items, { ref: 'topic.md', title: 'Topic', hasQuiz: true }).capNextHtml('c1', 'Question?');
  const noQuiz = makeCaptureUi(items, { ref: 'page.md', title: 'Page', hasQuiz: false }).capNextHtml('c1', 'Question?');
  assert.match(quiz, /data-cap-review="c1"[^>]*>Schedule review</);
  assert.doesNotMatch(noQuiz, /data-cap-review=/);
  assert.match(noQuiz, /data-cap-open="c1"/);
});

// A capture exists to be reviewed later, and topicHasQuiz gates the whole "Review this topic"
// action (fd_due.js). Case-of-the-Week pages are NOT in TOPIC_META, so a case page named for the
// same topic outranks the topic page in search and the affordance vanishes without a word — seen
// live on 2026-09-07 when "first-episode psychosis" displaced t_psychosis.md for a "psychosis"
// capture. Executes the real fdCaptureRows against a stubbed index rather than pinning its text.
function makeCaptureMatch(results, quizzed) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('items', 'results', 'quizzed', `
    var SI = true;
    function runSearch(){ return results; }
    function topicHasQuiz(f){ return quizzed.indexOf(f) >= 0; }
    ${slice(shell, 'function fdCaptureMatch(', 'function fdTodayLive(')}
    return fdCaptureMatch('psychosis');
  `);
  return factory([], results, quizzed);
}

test('T12c: the capture match prefers a reviewable hit over a better-ranked quizless one', () => {
  const match = makeCaptureMatch(
    [{ d: { f: 'cotw_20260907_fep_ms3.md', t: 'First-episode psychosis' } },
      { d: { f: 't_psychosis.md', t: 'Psychosis' } }],
    ['t_psychosis.md'],
  );
  assert.equal(match.ref, 't_psychosis.md',
    'a quizless Case-of-the-Week page outranking the topic page must not steal the capture');
  assert.equal(match.hasQuiz, true, 'the Schedule review action must survive the collision');
});

test('T12d: it still routes somewhere when nothing in the results has a quiz', () => {
  const match = makeCaptureMatch(
    [{ d: { f: 'cotw_20260907_fep_ms3.md', t: 'First-episode psychosis' } },
      { d: { f: 'pg_suicide.md', t: 'Suicide' } }],
    [],
  );
  assert.equal(match.ref, 'cotw_20260907_fep_ms3.md',
    'with no reviewable hit the top result still wins — a capture must never lose its match');
  assert.equal(match.hasQuiz, false);
});

test('T12b: unavailable matching preserves captures and safe actions', () => {
  const html = makeCaptureUi([{ id: 'c1', text: 'Question?', at: 1, route: null, state: 'open' }])
    .capNextHtml('c1', 'Question?');
  assert.match(html, /Your question remains in Capture/);
  assert.match(html, /data-cap-drop="c1"/);
  assert.match(html, /data-cap-route="supervision"/);
});

test('the search-index fetch re-renders home, so the degraded state cannot stick', () => {
  const fetchLine = shell.split('\n').find((l) => l.includes("fetch('search-index.json')"));
  assert.ok(fetchLine, 'search-index fetch still present');
  // specialRefresh() is the dual-root successor of capHomeRefresh() (Today/Progress split) —
  // same contract: re-render the live special view so the degraded triage state corrects.
  assert.match(fetchLine, /specialRefresh\(\)/,
    'SI===null also means "not yet resolved" — without this the triage card paints its degraded '
    + 'state on every cold load and never corrects');
});

test('the capture key is a string literal at every call site', () => {
  // The QA gate classifies non-literal keys as computed-key and hard-fails when the count exceeds
  // qa-baseline.json. Literals also let the namespace scan verify cw_* statically.
  const calls = [...shell.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^)]*)/g)]
    .map((m) => m[1].trim())
    .filter((arg) => arg.includes('cw_capture_v1'));
  assert.equal(calls.length, 4, 'read, write, erase, and read-back confirmation — and no others');
  for (const arg of calls) assert.match(arg, /^'cw_capture_v1'/);
});

test('the capture mounts are removed entirely in a faculty preview', () => {
  const today = slice(shell, 'function fdTodayLive(', 'function fdProgressMarkup(');
  assert.match(today, /if\(!facultyPreviewRequest\)/,
    'preview is a reviewer surface, not a learner session — it must not offer to write learner state');
  assert.match(today, /data-capture-open/,
    'the guarded branch must own the capture launcher itself, leaving no focusable preview control');
});

// ---- #426 / #428: every retained capture stays visible and deletable -------------------------

test('T4j: deleting the last capture removes the storage key rather than leaving an empty record', () => {
  const ls = memStorage();
  // eslint-disable-next-line no-new-func
  const s = new Function('localStorage', 'currentItem', `${phi}\n${storeCode}\nreturn {capAdd:capAdd,capRead:capRead,capRemove:capRemove,capSetRoute:capSetRoute};`)(ls, null);
  s.capAdd('first');
  s.capAdd('second');
  const [a, b] = s.capRead().items;
  s.capSetRoute(b.id, 'later');
  s.capRemove(a.id);
  assert.equal(s.capRead().items.length, 1, 'a routed item is still a retained record');
  assert.notEqual(ls.getItem('cw_capture_v1'), null);
  s.capRemove(b.id);
  assert.equal(ls.getItem('cw_capture_v1'), null, 'no records left: the key is gone, not an empty shell');
});

const listCode = slice(shell, '  /* Attribute-context escape for learner text', '  function capRenderBody(){');
function makeList(items, version = 1) {
  const ls = memStorage();
  if (items) ls.setItem('cw_capture_v1', JSON.stringify({ v: version, items }));
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', 'currentItem', `
    ${phi}
    ${storeCode}
    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    ${listCode}
    return { capListHtml: capListHtml, capDeleteLabel: capDeleteLabel };
  `)(ls, null);
}

test('T13a: routed captures remain visible with their route label', () => {
  const html = makeList([
    { id: 'c_old', text: 'first question', at: 1, ctx: null, route: 'later', state: 'open' },
    { id: 'c_new', text: 'second question', at: 2, ctx: null, route: null, state: 'open' },
  ], 2).capListHtml();
  assert.match(html, /first question[\s\S]*cap-list__status">Look up later</);
  assert.match(html, /second question[\s\S]*cap-list__status">Unrouted</);
  assert.equal((html.match(/data-cap-del="/g) || []).length, 2, 'every retained record has its own delete control');
});

test('T13b: Erase all is offered whenever any record remains, triaged included', () => {
  const only = makeList([{ id: 'c_t', text: 'triaged only', at: 1, ctx: null, triaged: true }]).capListHtml();
  assert.match(only, /id="capEraseAll"/);
  assert.equal(makeList([]).capListHtml(), '');
  assert.equal(makeList(null).capListHtml(), '');
});

test('T13c: each delete control carries the question in its accessible name, attribute-safe', () => {
  const s = makeList([
    { id: 'c_1', text: 'is "QTc > 500" the number?', at: 1, ctx: null, triaged: false },
    { id: 'c_2', text: 'x'.repeat(90), at: 2, ctx: null, triaged: false },
  ]);
  const html = s.capListHtml();
  const labels = [...html.matchAll(/aria-label="(Delete question:[^"]*)"/g)].map((m) => m[1]);
  assert.equal(labels.length, 2);
  assert.notEqual(labels[0], labels[1], 'no two controls share a name');
  assert.equal(labels[0], 'Delete question: is &quot;QTc &gt; 500&quot; the number?');
  assert.equal(s.capDeleteLabel('x'.repeat(90)), 'Delete question: ' + 'x'.repeat(57) + '…', 'long text is cut to 57 chars plus an ellipsis');
  assert.ok(!/aria-label="Delete this question"/.test(html), 'the generic repeated name is gone');
});

test('T14: the sheet owns a stable live-status region and announces mutations from it', () => {
  assert.match(shell, /id="capStatus" class="vh-live" aria-live="polite" aria-atomic="true"/);
  for (const needle of [
    "capAnnounce('Question deleted. '+capRemainingText())",
    "capAnnounce('All saved questions erased.')",
    "capAnnounce('Saved on this device. '+capRemainingText())",
  ]) assert.ok(shell.includes(needle), `missing announcement: ${needle}`);
});

test('T15: delete controls meet the 44px target and the skip link stops animating under reduced motion', () => {
  const rule = shell.match(/\.cap-list \.x\{[^}]*\}/)?.[0] || '';
  // The design system's touch token is 44px (clinical-warm.css --fd-target-touch); the rule must
  // use the token, not a raw px value, or the design-drift ratchet refuses the push.
  assert.match(rule, /min-width:var\(--fd-target-touch\)/);
  assert.match(rule, /min-height:var\(--fd-target-touch\)/);
  const reduced = shell.match(/@media\(prefers-reduced-motion:reduce\)\{\.skip-link[^}]*\}\}/)?.[0] || '';
  assert.match(reduced, /transition:none/);
});
