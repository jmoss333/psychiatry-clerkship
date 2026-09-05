// Contract for the Today renderer. Evaluates the real snippet body via new Function, following
// tests/fd-data.test.mjs and tests/fd-shell.test.mjs. Concatenated in the same dependency order
// inject_shared_snippets() uses on the built page: phase_policy.js (localDayIndex) -> fd_state.js
// (fdDailyPick/fdExamCountdown/fdRingStep, which call it) -> fd_data.js (the join layer) ->
// fd_today.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const todaySrc = read('frontdoor/fd_today.js');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${todaySrc}
  return { fdTodayProgress: fdTodayProgress, fdToday: fdToday, fdBuildIndex: fdBuildIndex,
           fdItemsForWeek: fdItemsForWeek, fdLibraryOnlyReads: fdLibraryOnlyReads };
`);
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ---- pure progress arithmetic -----------------------------------------------------

const ITEMS = [{ ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' }];

test('progress is zero and safe on an empty week', () => {
  const p = F.fdTodayProgress([], {});
  assert.deepEqual(p, { done: 0, total: 0, pct: 0, next: null },
    'an empty week must not divide by zero');
});

test('pct rounds rather than truncating', () => {
  assert.equal(F.fdTodayProgress(ITEMS, { 'a.md': true }).pct, 33);
  assert.equal(F.fdTodayProgress(ITEMS, { 'a.md': true, 'b.md': true }).pct, 67);
});

test('next is the first not-done item, skipping earlier done ones', () => {
  assert.equal(F.fdTodayProgress(ITEMS, { 'a.md': true }).next.ref, 'b.md');
  assert.equal(F.fdTodayProgress(ITEMS, { 'b.md': true }).next.ref, 'a.md',
    'a done item mid-list must not become next');
});

test('next is null and pct 100 when the week is complete', () => {
  const p = F.fdTodayProgress(ITEMS, { 'a.md': true, 'b.md': true, 'c.md': true });
  assert.equal(p.next, null);
  assert.equal(p.pct, 100);
});

test('a done map naming items outside the week does not inflate the count', () => {
  assert.equal(F.fdTodayProgress(ITEMS, { 'z.md': true }).done, 0);
});

// ---- rendering ----------------------------------------------------------------------

// Two week items (one read, one tool) so both the ring/list AND the quick-tools rail have
// something real to draw on; b.md sits in a library column but no week, making it the daily
// pick's only candidate.
const FIX_CUR = {
  weeks: [
    { n: 1, title: 'Foundations', theme: 'Orientation', items: [{ ref: 'a.md', kind: 'read' }, { ref: 't.html', kind: 'tool' }] },
    { n: 2, title: 'W2', theme: 'T2', items: [] },
    { n: 3, title: 'W3', theme: 'T3', items: [] },
    { n: 4, title: 'W4', theme: 'T4', items: [] },
    { n: 5, title: 'W5', theme: 'T5', items: [] },
    { n: 6, title: 'W6', theme: 'T6', items: [] },
  ],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md', 'b.md', 't.html'] }],
  libraryExclude: [],
  safetyKit: [{ ref: 'a.md', sub: 'Sub line' }],
  roles: { ms3: [], resident: [] },
  synonyms: {},
};
const FIX_META = {
  'a.md': { read: 6, tldr: 'Summary A', points: ['p1'], facultyReview: { status: 'reviewed' } },
  'b.md': { read: 3, tldr: 'Summary B' },
};
const FIX_TOOLS = { tools: [{ file: 't.html', title: 'Tool T', category: 'acute-safety', riskLevel: 'high' }] };
const FIX_MAN = {
  tools: [['src/t.html', 't.html', 'Tool T']],
  md: [['src/a.md', 'a.md', 'Page A'], ['src/b.md', 'b.md', 'Page B']],
};
const IDX = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
const FOUR_CUR = Object.assign({}, FIX_CUR, { weeks: FIX_CUR.weeks.slice(0, 4).map((week) => (
  week.n === 3 ? Object.assign({}, week, { items: [{ ref: 'w3a.md', kind: 'read' }] })
    : week.n === 4 ? Object.assign({}, week, { items: [{ ref: 'w4a.md', kind: 'read' }] })
      : week
)) });
const FOUR_MAN = Object.assign({}, FIX_MAN, {
  md: FIX_MAN.md.concat([['src/w3a.md', 'w3a.md', 'Week 3 item'], ['src/w4a.md', 'w4a.md', 'Week 4 item']]),
});
const FOUR_INDEX = F.fdBuildIndex(FOUR_CUR, FIX_META, FIX_TOOLS, FOUR_MAN);

const BASE_STATE = { week: 1, role: 'there', done: {}, streak: 0, ringPct: 50,
  nowMs: new Date(2026, 7, 10, 9, 0, 0).getTime() }; // Monday, morning
const s = (over) => Object.assign({}, BASE_STATE, over);
const fourState = (over) => Object.assign({}, BASE_STATE, over);

test('Today counts repeated practice for the current week even when another Path week was viewed', () => {
  const cur = { ...FIX_CUR, weeks: FIX_CUR.weeks.map((w) => ({ ...w,
    items: [{ ref: 't.html', kind: 'tool' }],
  })) };
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  const html = F.fdToday(idx, s({ week: 2, viewWeek: 1, done: { 't.html': true },
    progressRaw: { 't.html': { done: true, practiceWeeks: { 1: { done: true, at: '2026-08-03' } } } },
  }));
  assert.match(html, /fd-continue__count">0 of 1/);
  assert.match(html, /data-fd-toggle="t.html"[^>]*aria-pressed="false"/);
  assert.match(html, /class="fd-continue" data-fd-open="t.html"/);
});

test('the greeting varies by time of day, derived from state.nowMs', () => {
  const morning = new Date(2026, 7, 10, 9, 0, 0).getTime();
  const afternoon = new Date(2026, 7, 10, 14, 0, 0).getTime();
  const evening = new Date(2026, 7, 10, 20, 0, 0).getTime();
  assert.match(F.fdToday(IDX, s({ nowMs: morning })), /Morning, there /);
  assert.match(F.fdToday(IDX, s({ nowMs: afternoon })), /Afternoon, there /);
  assert.match(F.fdToday(IDX, s({ nowMs: evening })), /Evening, there /);
});

// ---- accessibility (Fresh Eyes Audit A2/A6) --------------------------------------------------

test('the greeting’s trailing dash is decoration, not something a screen reader announces', () => {
  // "Evening, Core rotation —" left a dangling em dash in the accessible name. Same treatment as
  // the ✓ glyph in fdRow: the character stays visually and becomes aria-hidden.
  const html = F.fdToday(IDX, s({}));
  assert.match(html, /<span aria-hidden="true">—<\/span>/);
  assert.doesNotMatch(html, /<h1 class="fd-today__h1">[^<]*—/);
});

test('each done-toggle carries its item title in the accessible name', () => {
  // Nine rows all named "Mark done" told a screen-reader user nothing about WHICH item.
  const html = F.fdToday(IDX, s({}));
  const names = [...html.matchAll(/title="(Mark (?:done|undone): [^"]*)"/g)].map((m) => m[1]);
  assert.ok(names.length > 1, `expected several toggles, got ${names.length}`);
  assert.equal(new Set(names).size, names.length, `duplicate toggle names: ${names.join(' | ')}`);
});

test('the toggle name tracks aria-pressed so it says what the press will do', () => {
  const html = F.fdToday(IDX, s({ done: { 'a.md': true } }));
  const pairs = [...html.matchAll(/title="(Mark [^"]+)" aria-pressed="(true|false)"/g)];
  assert.ok(pairs.length > 1);
  for (const [, name, pressed] of pairs) {
    assert.ok(name.startsWith(pressed === 'true' ? 'Mark undone:' : 'Mark done:'),
      `"${name}" contradicts aria-pressed="${pressed}"`);
  }
});

test('the week-complete kicker appears only at 100%', () => {
  const partial = F.fdToday(IDX, s({ done: { 'a.md': true } }));
  assert.doesNotMatch(partial, /is-complete/);
  assert.match(partial, /Continue · Week 1/);
  const complete = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.match(complete, /fd-continue__kicker is-complete/);
  assert.match(complete, /Week 1 complete/);
});

test('a completed Continue card previews Path with view-week, never setup-week', () => {
  const html = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.match(html, /data-fd-tab="path" data-fd-view-week="2"/);
  assert.doesNotMatch(html, /data-fd-week=/);
});

test('completed resident Week 3 previews Week 4 from the index', () => {
  const html = F.fdToday(FOUR_INDEX, fourState({ week: 3, done: { 'w3a.md': true } }));
  assert.match(html, /Preview Week 4/);
  assert.match(html, /data-fd-view-week="4"/);
});

test('completed final week reviews itself and never invents a next week', () => {
  const html = F.fdToday(FOUR_INDEX, fourState({ week: 4, done: { 'w4a.md': true } }));
  assert.match(html, /Review Week 4/);
  assert.match(html, /data-fd-view-week="4"/);
  assert.doesNotMatch(html, /Preview Week 4|Week 5/);
});

test('a done item carries .is-done on both the check and the title', () => {
  const html = F.fdToday(IDX, s({ done: { 'a.md': true } }));
  assert.match(html, /class="fd-check is-done" data-fd-toggle="a\.md"/);
  assert.match(html, /class="fd-row__title is-done">Page A</);
});

test('an undone item carries neither', () => {
  const html = F.fdToday(IDX, s({ done: {} }));
  assert.match(html, /class="fd-check" data-fd-toggle="a\.md"/);
  assert.match(html, /class="fd-row__title">Page A</);
});

// ---- the ✓ must not lie (WCAG 1.4.1 / 4.1.2), same treatment as fd_sheet.js -------------
//
// The glyph is emitted in BOTH states and only its COLOUR differs (frontdoor.css:231/233), so
// before this fix the toggle's accessible name was "✓" whether the item was done or not, and
// done-ness reached a screen-reader user not at all. The character stays (deleting it would
// leave the circle with nothing to colour); it is marked decoration, and the state moves onto
// the button, which is the actual toggle.

test('the row ✓ is hidden from assistive tech and the state is carried by aria-pressed', () => {
  const html = F.fdToday(IDX, s({ done: { 'a.md': true } }));
  assert.match(html, /class="fd-check is-done" data-fd-toggle="a\.md" title="Mark undone: [^"]+" aria-pressed="true">/);
  assert.match(html, /class="fd-check" data-fd-toggle="t\.html" title="Mark done: [^"]+" aria-pressed="false">/);

  // Every ✓ in the whole surface is inside an aria-hidden wrapper -- no bare glyph survives.
  const glyphs = (html.match(/✓/g) || []).length;
  assert.equal(glyphs, 2, 'one per week row');
  assert.equal((html.match(/<span aria-hidden="true">✓<\/span>/g) || []).length, glyphs,
    'an undone row announced as "✓ Page A" tells the user it is finished when it is not');
});

test('aria-pressed tracks the done map in both directions', () => {
  const none = F.fdToday(IDX, s({ done: {} }));
  assert.equal((none.match(/aria-pressed="false"/g) || []).length, 2);
  assert.doesNotMatch(none, /aria-pressed="true"/);

  const all = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.equal((all.match(/aria-pressed="true"/g) || []).length, 2);
  assert.doesNotMatch(all, /aria-pressed="false"/);
});

test('the daily pick is omitted once every library-only read is done', () => {
  const withPick = F.fdToday(IDX, s({ done: {} }));
  assert.match(withPick, /fd-pick/);
  assert.match(withPick, /Page B/);
  const noPick = F.fdToday(IDX, s({ done: { 'b.md': true } }));
  assert.doesNotMatch(noPick, /fd-pick/);
});

// frontdoor.css already ships the display:none/flex breakpoint swap at 1000px
// (frontdoor.css:270, 281-283, 548-552) -- this renderer emits both the desktop rail and the
// mobile pill row unconditionally in every single call and lets CSS pick, rather than branching
// on a device flag. That makes one render correct at any viewport and needs no resize-driven
// re-render to stay correct, unlike an earlier version of this file that branched on
// state.desk (caught in review).
test('the rail and the pill row are both always present, for CSS to choose between', () => {
  const html = F.fdToday(IDX, s({}));
  assert.match(html, /fd-rail/);
  assert.match(html, /fd-kitcard/);
  assert.match(html, /fd-quicktools--pills/);
});

test('no week set renders the setup CTA instead of the continue card', () => {
  const html = F.fdToday(IDX, s({ week: null }));
  assert.match(html, /fd-setupcta/);
  assert.doesNotMatch(html, /fd-continue"/);
  assert.match(html, /browsing — no week set/);
});

test('Today leaves the trusted edition card and local DOM to the stable governance mount', () => {
  const projected = Object.assign({}, IDX, { edition: { card: { fingerprint: 'EXU-MS3-ZBVX4D' } } });
  const html = F.fdToday(projected, s({}));
  assert.doesNotMatch(html, /fd-edition-card|data-edition-orientation|EXU-MS3-ZBVX4D/);
});

test('Today keeps core progress refs while showing edition priority and rationale beneath rows', () => {
  const weeks = IDX.weeks.map((week) => Object.assign({}, week, {
    items: week.items.map((item) => item.ref === 'a.md' ? Object.assign({}, item, {
      instanceId: 'core:a.md:1', priority: 'required',
      reasonText: 'Start before the first handoff.',
    }) : item),
  }));
  const html = F.fdToday(Object.assign({}, IDX, { weeks }), s({}));
  assert.match(html, /data-fd-toggle="a\.md"/);
  assert.doesNotMatch(html, /data-fd-toggle="core:a\.md:1"/);
  assert.match(html, /Required by this local rotation/);
  assert.match(html, /Local rotation reason: Start before the first handoff\./);
  assert.match(html, /Reviewed clerkship Library/);
});

// ---- the seven-day activity strip (replaces the Daily-Review-only streak clause) ---------

const NONE = [false, false, false, false, false, false, false];
const FOUR_OF_SEVEN = [true, true, false, false, true, true, false];

test('the streak clause is gone from the subhead for good', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({ streak: 5 })), /days in a row/,
    'a stale state.streak must not resurrect the old clause');
  assert.doesNotMatch(todaySrc, /days in a row/);
});

test('the strip is absent until the learner has been active on at least one day', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({})), /fd-consistency/, 'no activityDays at all');
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: NONE })), /fd-consistency/,
    'a fresh device must not read "Active 0 of the last 7 days"');
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: [true, true] })), /fd-consistency/,
    'anything but seven entries is malformed and renders nothing');
});

test('the strip counts active days and names itself for assistive tech', () => {
  const html = F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN }));
  assert.match(html, /<div class="fd-consistency" role="img" aria-label="Active 4 of the last 7 days">/);
  assert.equal((html.match(/fd-consistency__dot is-on/g) || []).length, 4);
  assert.equal((html.match(/class="fd-consistency__dot(?: is-on)?"/g) || []).length, 7);
  assert.match(html, /<span class="fd-consistency__dots" aria-hidden="true">/);
  assert.match(html, /<span class="fd-consistency__text" aria-hidden="true">Active 4 of the last 7 days<\/span>/);
});

test('the strip sits directly under the subhead, before the columns', () => {
  const html = F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN }));
  const sub = html.indexOf('<p class="fd-today__sub">');
  const strip = html.indexOf('<div class="fd-consistency"');
  const cols = html.indexOf('<div class="fd-today__cols">');
  assert.ok(sub > -1 && sub < strip && strip < cols);
});

test('day letters walk back from nowMs and end on today, oldest first', () => {
  // BASE_STATE.nowMs is Monday 2026-08-10, so the seven labels run Tue..Mon.
  const html = F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN }));
  const letters = [...html.matchAll(/fd-consistency__label">([A-Z])</g)].map((m) => m[1]);
  assert.deepEqual(letters, ['T', 'W', 'T', 'F', 'S', 'S', 'M']);
});

test('an unusable nowMs drops the strip rather than throwing the whole Today render', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN, nowMs: undefined })), /fd-consistency/);
});

test('the strip copy is audience-neutral', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN })), AUDIENCE_TOKEN_RE);
});

// ---- the subhead, joined -- the front door's most-read line --------------------------
//
// fdExamCountdown returns a bare fragment ('· exam in ~5 days'): separator dot included, leading
// space NOT -- the caller owns the join. Concatenating
// it directly printed "Sunday· exam in ~5 days" through weeks 5 and 6. tests/fd-state.test.mjs
// pins the fragment; these pin the JOINED string, which is what a learner actually reads and
// which no test covered before.

function subOf(html) {
  const m = html.match(/<p class="fd-today__sub">([^<]*)<\/p>/);
  assert.ok(m, 'no .fd-today__sub found');
  return m[1];
}

// 2026-08-16 is the Sunday of the week whose Monday (2026-08-10) anchors fd-state's countdown
// fixture; at week 5 that is 5 days out from the week-6 Friday.
const SUNDAY_W5 = new Date(2026, 7, 16, 9, 0, 0).getTime();

test('the exam countdown joins onto the subhead with a separating space', () => {
  assert.equal(subOf(F.fdToday(IDX, s({ week: 5, nowMs: SUNDAY_W5 }))),
    'Week 5 · W5 · Sunday · exam in ~5 days');
});

test('the countdown joins directly after the day name now that the streak clause is gone', () => {
  assert.equal(subOf(F.fdToday(IDX, s({ week: 5, streak: 3, activityDays: FOUR_OF_SEVEN, nowMs: SUNDAY_W5 }))),
    'Week 5 · W5 · Sunday · exam in ~5 days');
});

test('a week with no countdown leaves no trailing space behind', () => {
  const sub = subOf(F.fdToday(IDX, s({})));
  assert.equal(sub, 'Week 1 · Foundations · Monday');
  assert.doesNotMatch(sub, / $/, 'an unconditional join would strand a space on weeks 1-4');
});

test('every interpolated title is escaped', () => {
  const evilCur = JSON.parse(JSON.stringify(FIX_CUR));
  evilCur.weeks[0].items = [{ ref: 'evil.md', kind: 'read' }];
  evilCur.libraryColumns[0].refs.push('evil.md');
  const evilMeta = Object.assign({}, FIX_META, {
    'evil.md': { read: 2, tldr: 'x' },
  });
  const evilMan = {
    tools: FIX_MAN.tools,
    md: FIX_MAN.md.concat([['src/evil.md', 'evil.md', '<img src=x onerror=1>']]),
  };
  const evilIdx = F.fdBuildIndex(evilCur, evilMeta, FIX_TOOLS, evilMan);
  const html = F.fdToday(evilIdx, s({ done: {} }));
  assert.doesNotMatch(html, /<img/);
});

test('no rendered string carries an audience-specific token', () => {
  const html = F.fdToday(IDX, s({})) + F.fdToday(IDX, s({ week: null }));
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

// ---- scope pin: due row / capture triage are NOT this task's job --------------------
//
// The design doc's decision table marks both "Port, prominent", but frontdoor.css has no rules
// for either and neither appears in the prototype's Today section -- they read from runtime
// stores outside the index this renderer is pure over. Plan 3 ports them during wiring. Pinned
// here (not just in a comment) so a later edit that reaches for storage to "finish" this
// surface fails loudly instead of silently.
test('fd_today.js touches no DOM, storage, or clock', () => {
  assert.doesNotMatch(todaySrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'fd_today.js must stay a pure function of (index, state)');
});

test('no rendered output carries a due-row or capture-triage surface', () => {
  const html = F.fdToday(IDX, s({})) + F.fdToday(IDX, s({ week: null }));
  assert.doesNotMatch(html, /fd-due|fd-capture|data-fd-due|data-fd-capture/i);
});
