// Supervisor feedback notes ("Log what they said", 2026-09-26): the store in fd_state.js, the
// callout in fd_path.js and the pure dispatch in fd_wire.js. Evaluates the real snippet bodies via
// new Function, concatenated in the order the built page injects them (tests/fd-wire.test.mjs).
// The notes are the learner's private record on this device: never progress, never exported,
// never an assessment. These tests pin the limits that make that true.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const readRoot = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SOURCES = [
  'phase_policy.js', 'frontdoor/fd_state.js', 'frontdoor/fd_reading_place.js', 'frontdoor/fd_data.js',
  'frontdoor/fd_care_navigator.js', 'frontdoor/fd_offline.js', 'frontdoor/fd_edition_student.js',
  'frontdoor/fd_today.js', 'frontdoor/fd_block.js', 'frontdoor/fd_reader.js', 'frontdoor/fd_shell.js',
  'frontdoor/fd_app_practice.js', 'frontdoor/fd_path.js', 'frontdoor/fd_wire.js',
].map(read).join('\n');

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i) => (i >= 0 && i < map.size ? [...map.keys()][i] : null),
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `${SOURCES}\nreturn {
  add: fdFeedbackAdd, remove: fdFeedbackRemove, readAll: fdFeedbackRead, forWeek: fdFeedbackForWeek,
  day: fdFeedbackDay, fdPath: fdPath, fdBuildIndex: fdBuildIndex, fdDispatch: fdDispatch,
  MAX: FD_FEEDBACK_MAX, LIMIT: FD_FEEDBACK_LIMIT
};`);
const fresh = (seed) => { const ls = memStorage(seed); return { ls, F: make(ls) }; };

const KEY = 'cw_feedback_v1';
const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;
const NOON_SEP_26 = new Date(2026, 8, 26, 12, 0, 0).getTime();
const NOON_SEP_27 = new Date(2026, 8, 27, 12, 0, 0).getTime();

const REAL_CUR = JSON.parse(readRoot('curriculum.json'));
function realIndex(F, audience) {
  const lp = REAL_CUR.learningPaths[audience];
  return F.fdBuildIndex(
    { ...REAL_CUR, path: { id: lp.id, weekCount: lp.weeks.length }, weeks: lp.weeks },
    JSON.parse(readRoot('topic_meta.json')), JSON.parse(readRoot('tool_registry.json')),
    JSON.parse(read('site_manifest.json')));
}

// ---- store ---------------------------------------------------------------------------------

test('a saved note is stored once, tidied, capped, and read back', () => {
  const { ls, F } = fresh();
  assert.deepEqual(F.readAll(), []);
  const id = F.add('resident-four-week', 2, '  Good   risk\nformulation;  tighten the plan  ', NOON_SEP_26);
  assert.equal(id, 'f_' + NOON_SEP_26.toString(36));
  assert.deepEqual(F.readAll(), [{ id, path: 'resident-four-week', week: 2,
    text: 'Good risk formulation; tighten the plan', at: NOON_SEP_26 }]);
  assert.equal(JSON.parse(ls.getItem(KEY)).v, 1);
  const long = F.add('resident-four-week', 2, 'x'.repeat(F.MAX + 50), NOON_SEP_26);
  assert.equal(long, id + '_1', 'a second note in the same millisecond gets its own id');
  assert.equal(F.readAll().find((n) => n.id === long).text.length, F.MAX);
});

test('an invalid note is refused and nothing is written', () => {
  const { ls, F } = fresh();
  assert.equal(F.add('resident-four-week', 2, '   ', NOON_SEP_26), false);
  assert.equal(F.add('Bad Path', 2, 'ok', NOON_SEP_26), false);
  assert.equal(F.add('resident-four-week', 0, 'ok', NOON_SEP_26), false);
  assert.equal(F.add('resident-four-week', 2.5, 'ok', NOON_SEP_26), false);
  assert.equal(F.add('resident-four-week', 2, 'ok', 1.5), false);
  assert.equal(ls.getItem(KEY), null);
});

test('the store keeps the newest sixty notes and drops the oldest first', () => {
  const { F } = fresh();
  for (let i = 0; i <= F.LIMIT; i++) F.add('resident-four-week', 1, 'note ' + i, NOON_SEP_26 + i);
  const all = F.readAll();
  assert.equal(all.length, F.LIMIT);
  assert.equal(all[0].text, 'note 1', 'note 0, the oldest, is the one dropped');
  assert.equal(all[all.length - 1].text, 'note ' + F.LIMIT);
});

test('deleting a note removes only it, and the last delete removes the key', () => {
  const { ls, F } = fresh();
  const a = F.add('resident-four-week', 1, 'first', NOON_SEP_26);
  const b = F.add('resident-four-week', 1, 'second', NOON_SEP_27);
  assert.equal(F.remove('f_unknown'), false);
  assert.equal(F.remove(a), true);
  assert.deepEqual(F.readAll().map((n) => n.id), [b]);
  assert.equal(F.remove(b), true);
  assert.equal(ls.getItem(KEY), null, 'an emptied log leaves no key behind');
});

test('a damaged store reads as its valid notes only', () => {
  const good = { id: 'f_abc', path: 'resident-four-week', week: 3, text: 'kept', at: NOON_SEP_26 };
  const { F } = fresh({ [KEY]: JSON.stringify({ v: 1, items: [
    good, { ...good }, { ...good, id: '__proto__' }, { ...good, id: 'f_x', week: 'three' },
    { ...good, id: 'f_y', text: '   ' }, null, 'junk', { ...good, id: 'f_z', path: '../x' },
  ] }) });
  assert.deepEqual(F.readAll(), [good]);
  assert.deepEqual(fresh({ [KEY]: '{not json' }).F.readAll(), []);
  assert.deepEqual(fresh({ [KEY]: JSON.stringify({ v: 2, items: [good] }) }).F.readAll(), []);
});

test('a device that refuses the write reports failure instead of a saved note', () => {
  const ls = memStorage();
  ls.setItem = () => { throw new Error('QuotaExceededError'); };
  const F = make(ls);
  assert.equal(F.add('resident-four-week', 1, 'lost?', NOON_SEP_26), false);
});

test('one week of one path, newest first', () => {
  const { F } = fresh();
  F.add('resident-four-week', 2, 'older', NOON_SEP_26);
  F.add('resident-four-week', 2, 'newer', NOON_SEP_27);
  F.add('resident-four-week', 3, 'other week', NOON_SEP_27);
  F.add('other-path', 2, 'other path', NOON_SEP_27);
  assert.deepEqual(F.forWeek(F.readAll(), 'resident-four-week', 2).map((n) => n.text), ['newer', 'older']);
  assert.deepEqual(F.forWeek(null, 'resident-four-week', 2), []);
  assert.equal(F.day(NOON_SEP_26), 'Sep 26');
});

// ---- the callout -----------------------------------------------------------------------------

const practiceOf = (html) => {
  const m = html.match(/<div class="fd-detail__practice">[\s\S]*?<div class="fd-detail__list">/);
  return m ? m[0] : '';
};

test('every four-week week offers "Log what they said"; the six-week path offers nothing', () => {
  const { F } = fresh();
  const idx = realIndex(F, 'resident');
  for (const wk of idx.weeks) {
    const callout = practiceOf(F.fdPath(idx, { week: 1, viewWeek: wk.n, done: {} }));
    assert.match(callout, new RegExp(`<button type="button" class="[^"]*fd-feedback__open"[^>]*data-fd-feedback-open="${wk.n}">Log what they said</button>`),
      'week ' + wk.n + ' has the button inside its practice callout');
    assert.doesNotMatch(callout, /<textarea/, 'nothing is open until the learner taps');
    assert.doesNotMatch(callout, /What they said/, 'no list heading without notes');
  }
  const six = realIndex(F, 'ms3');
  for (const wk of six.weeks) {
    assert.doesNotMatch(F.fdPath(six, { week: 1, viewWeek: wk.n, done: {} }), /fd-feedback|data-fd-feedback/);
  }
});

test('an open note shows the field, the patient-detail warning and Save/Cancel on its own week only', () => {
  const { F } = fresh();
  const idx = realIndex(F, 'resident');
  const draft = { week: 2, text: 'Said <b>my</b> plan & risk "fit"', hold: false };
  const w2 = practiceOf(F.fdPath(idx, { week: 2, viewWeek: 2, done: {}, feedbackDraft: draft }));
  assert.match(w2, /<label class="fd-feedback__label" for="fdFeedbackText">What did they say\?<\/label>/);
  assert.match(w2, /<textarea id="fdFeedbackText" class="fd-feedback__text"[^>]*maxlength="280"[^>]*>Said &lt;b&gt;my&lt;\/b&gt; plan &amp; risk &quot;fit&quot;<\/textarea>/);
  assert.match(w2, /No names, initials, room or bed numbers, dates, or MRNs\. Stays on this device\./);
  assert.match(w2, /data-fd-feedback-cancel>Cancel<\/button>/);
  assert.match(w2, /data-fd-feedback-save>Save note<\/button>/);
  assert.doesNotMatch(w2, /data-fd-feedback-open/, 'the open note replaces the button');
  const w3 = practiceOf(F.fdPath(idx, { week: 2, viewWeek: 3, done: {}, feedbackDraft: draft }));
  assert.doesNotMatch(w3, /<textarea/, 'a note opened on week 2 never appears on week 3');
});

test('a held note asks Edit or "No patient details — save", and a refused save keeps the text', () => {
  const { F } = fresh();
  const idx = realIndex(F, 'resident');
  const held = practiceOf(F.fdPath(idx, { week: 1, viewWeek: 1, done: {},
    feedbackDraft: { week: 1, text: 'Pt in room 4', hold: true } }));
  assert.match(held, /<div class="fd-feedback__hold" role="alert"><p><strong>This may contain patient details\.<\/strong><\/p>/);
  assert.match(held, /data-fd-feedback-edit>Edit<\/button>/);
  assert.match(held, /data-fd-feedback-confirm>No patient details — save<\/button>/);
  assert.doesNotMatch(held, /data-fd-feedback-save/, 'no plain Save while the note is held');
  const failed = practiceOf(F.fdPath(idx, { week: 1, viewWeek: 1, done: {},
    feedbackDraft: { week: 1, text: 'kept text', hold: false, failed: true } }));
  assert.match(failed, /<p class="fd-feedback__error" role="alert">Couldn't save on this device\./);
  assert.match(failed, />kept text<\/textarea>/);
});

test('saved notes list under the question, newest first, escaped, each with its own Delete', () => {
  const { F } = fresh();
  const idx = realIndex(F, 'resident');
  const log = [
    { id: 'f_a', path: 'resident-four-week', week: 2, text: 'older <script>', at: NOON_SEP_26 },
    { id: 'f_b', path: 'resident-four-week', week: 2, text: 'newer', at: NOON_SEP_27 },
    { id: 'f_c', path: 'resident-four-week', week: 3, text: 'week three', at: NOON_SEP_27 },
    { id: 'f_d', path: 'ms3-six-week', week: 2, text: 'other path', at: NOON_SEP_27 },
  ];
  const html = practiceOf(F.fdPath(idx, { week: 2, viewWeek: 2, done: {}, feedbackLog: log,
    feedbackNotice: { week: 2, text: 'Saved on this device.' } }));
  assert.match(html, /<p class="fd-feedback__status" role="status">Saved on this device\.<\/p>/);
  assert.match(html, /<strong>What they said<\/strong>/);
  const items = [...html.matchAll(/<li class="fd-feedback__item">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, 2, 'only this path and this week');
  assert.match(items[0], /<span class="fd-feedback__day">Sep 27<\/span><span class="fd-feedback__note">newer<\/span>/);
  assert.match(items[1], /older &lt;script&gt;/);
  assert.match(items[1], /data-fd-feedback-delete="f_a" aria-label="Delete the note from Sep 26">Delete<\/button>/);
  const other = practiceOf(F.fdPath(idx, { week: 2, viewWeek: 3, done: {}, feedbackLog: log,
    feedbackNotice: { week: 2, text: 'Saved on this device.' } }));
  assert.doesNotMatch(other, /fd-feedback__status/, 'a notice belongs to the week it was made on');
});

test('the callout carries no audience token in any state', () => {
  const { F } = fresh();
  const idx = realIndex(F, 'resident');
  const log = [{ id: 'f_a', path: 'resident-four-week', week: 1, text: 'note', at: NOON_SEP_26 }];
  const strip = (html) => practiceOf(html).replace(/<strong>Demonstrate this week<\/strong><br>[^<]*/, '')
    .replace(/“[^”]*”/, '');
  for (const draft of [null, { week: 1, text: '', hold: false }, { week: 1, text: 'x', hold: true },
    { week: 1, text: 'x', hold: false, failed: true }]) {
    assert.doesNotMatch(strip(F.fdPath(idx, { week: 1, viewWeek: 1, done: {}, feedbackLog: log,
      feedbackDraft: draft, feedbackNotice: { week: 1, text: 'Note deleted.' } })), AUDIENCE_TOKEN_RE);
  }
});

// ---- dispatch --------------------------------------------------------------------------------

function ctx(F, extra = {}) {
  return { index: realIndex(F, 'resident'), nowMs: NOON_SEP_26, search: '', ...extra };
}
const clean = () => false;

test('opening a note needs a real week; Cancel closes it', () => {
  const { F } = fresh();
  const c = ctx(F, { feedbackRisky: clean });
  const opened = F.fdDispatch({ 'data-fd-feedback-open': '2' }, c, {});
  assert.deepEqual(opened.patch, { feedbackDraft: { week: 2, text: '', hold: false }, feedbackNotice: null });
  assert.deepEqual(opened.effect, { type: 'focus-feedback' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-feedback-open': '9' }, c, {}), { patch: {}, route: null, effect: null });
  assert.deepEqual(F.fdDispatch({ 'data-fd-feedback-cancel': '' }, c, { feedbackDraft: { week: 2 } }).patch,
    { feedbackDraft: null });
});

test('Save writes nothing for an empty note and stores a clean one with its path and week', () => {
  const { F } = fresh();
  const c = ctx(F, { feedbackRisky: clean });
  const s = { feedbackDraft: { week: 3, text: '', hold: false } };
  const empty = F.fdDispatch({ 'data-fd-feedback-save': '', 'data-fd-feedback-text': '   ' }, c, s);
  assert.equal(empty.effect.type, 'focus-feedback', 'an empty note stays open; nothing is written');
  const saved = F.fdDispatch({ 'data-fd-feedback-save': '', 'data-fd-feedback-text': '  Name the  risk first ' }, c, s);
  assert.deepEqual(saved.patch, { feedbackDraft: null });
  assert.deepEqual(saved.effect, { type: 'feedback-add', path: 'resident-four-week', week: 3,
    text: 'Name the risk first', at: NOON_SEP_26 });
});

test('a possible patient detail is held, and with no screen wired every note is held (fail closed)', () => {
  const { F } = fresh();
  const s = { feedbackDraft: { week: 1, text: '', hold: false } };
  const risky = F.fdDispatch({ 'data-fd-feedback-save': '', 'data-fd-feedback-text': 'Pt in bed 12' },
    ctx(F, { feedbackRisky: (t) => /bed \d+/.test(t) }), s);
  assert.deepEqual(risky.patch, { feedbackDraft: { week: 1, text: 'Pt in bed 12', hold: true } });
  assert.equal(risky.effect.type, 'focus-feedback-hold');
  const unwired = F.fdDispatch({ 'data-fd-feedback-save': '', 'data-fd-feedback-text': 'fine' }, ctx(F), s);
  assert.equal(unwired.patch.feedbackDraft.hold, true);
  assert.equal(unwired.effect.type, 'focus-feedback-hold');
});

test('confirming a held note saves the held text; Edit reopens it; Delete names one valid note', () => {
  const { F } = fresh();
  const c = ctx(F, { feedbackRisky: () => true });
  const heldState = { feedbackDraft: { week: 4, text: 'kept as typed', hold: true } };
  const confirmed = F.fdDispatch({ 'data-fd-feedback-confirm': '' }, c, heldState);
  assert.deepEqual(confirmed.effect, { type: 'feedback-add', path: 'resident-four-week', week: 4,
    text: 'kept as typed', at: NOON_SEP_26 });
  assert.deepEqual(F.fdDispatch({ 'data-fd-feedback-edit': '' }, c, heldState).patch,
    { feedbackDraft: { week: 4, text: 'kept as typed', hold: false } });
  assert.deepEqual(F.fdDispatch({ 'data-fd-feedback-delete': 'f_abc' }, c, {}).effect,
    { type: 'feedback-remove', id: 'f_abc' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-feedback-delete': '__proto__' }, c, {}),
    { patch: {}, route: null, effect: null });
  assert.deepEqual(F.fdDispatch({ 'data-fd-feedback-confirm': '' }, c, {}),
    { patch: {}, route: null, effect: null }, 'nothing to confirm without an open note');
});

test('the shell hands the controller the capture screen and reads the store on every render', () => {
  const spa = read('spa_index.html');
  assert.match(spa, /feedbackRisky:capRisky,/);
  assert.match(spa, /out\.feedbackLog=typeof fdFeedbackRead==='function'\?fdFeedbackRead\(\):\[\];/);
  assert.match(read('frontdoor/fd_state.js'), /localStorage\.getItem\('cw_feedback_v1'\)/);
});
