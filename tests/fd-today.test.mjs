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
           fdItemsForWeek: fdItemsForWeek, fdLibraryOnlyReads: fdLibraryOnlyReads,
           fdFindWeek: fdFindWeek, fdContinue: fdContinue, fdTodayPrimary: fdTodayPrimary,
           fdTodayLastRead: fdTodayLastRead, fdTodayWhy: fdTodayWhy,
           FD_TODAY_PRIMARY_ORDER: FD_TODAY_PRIMARY_ORDER, FD_TODAY_LEAD_END: FD_TODAY_LEAD_END,
           FD_TODAY_WHY: FD_TODAY_WHY };
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
  assert.match(F.fdToday(IDX, s({ nowMs: morning })), /Morning, there<\/h1>/);
  assert.match(F.fdToday(IDX, s({ nowMs: afternoon })), /Afternoon, there<\/h1>/);
  assert.match(F.fdToday(IDX, s({ nowMs: evening })), /Evening, there<\/h1>/);
});

// ---- accessibility (Fresh Eyes Audit A2/A6) --------------------------------------------------

test('the greeting ends with the role, not a dangling dash', () => {
  // "Evening, Core rotation —" first lost its dash from the accessible name (aria-hidden) and on
  // 2026-09-19 lost it altogether: after a role label it read as a truncated sentence, and at
  // 375px the dash wrapped onto a line of its own. The prototype's dash followed a NAME.
  const html = F.fdToday(IDX, s({}));
  const h1 = html.match(/<h1 class="fd-today__h1">([\s\S]*?)<\/h1>/);
  assert.ok(h1, 'the greeting h1 renders');
  assert.doesNotMatch(h1[1], /—|aria-hidden/, `no dash, decorative or otherwise: ${h1[1]}`);
  assert.match(h1[1], /^(Morning|Afternoon|Evening), [^<]+$/);
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

// ---- One Thing First: the priority rule (handoff 2026-09-16 §2) --------------------------
//
// The picker is pure over plain inputs the shell derives. The ORDER is one array so that
// reversing assumption A1 ("unfinished outranks reviews due") is a swap of two entries in
// fd_today.js plus the expected column of the table below — nothing else moves.

const PICK = (over) => F.fdTodayPrimary(Object.assign({
  capsuleLeft: 0, blockNext: null, dueTotal: 0, hasWeek: true,
  weekProgress: { done: 0, total: 2, next: { ref: 'a.md' } }, lastRead: null,
}, over)).kind;
const LAST_READ = { ref: 'b.md', kind: 'read', done: false, isContinueTarget: false };
const NO_WEEK = { done: 0, total: 0, next: null };

test('the order is a single array, top-down, and A1 places unfinished work above reviews due', () => {
  assert.deepEqual(F.FD_TODAY_PRIMARY_ORDER, ['resume', 'block', 'read', 'due', 'week', 'ahead', 'setup']);
});

test('the primary is the first true row of the table', () => {
  const table = [
    // rule 1: unfinished — resume › block › "You were reading"
    [{ capsuleLeft: 4, blockNext: { kind: 'qb' }, dueTotal: 2, lastRead: LAST_READ }, 'resume'],
    [{ blockNext: { kind: 'qb' }, dueTotal: 2, lastRead: LAST_READ }, 'block'],
    [{ dueTotal: 2, lastRead: LAST_READ }, 'read'],
    // rule 2: reviews due
    [{ dueTotal: 2 }, 'due'],
    // rule 3: the week has an undone item
    [{}, 'week'],
    // rule 4: week complete
    [{ weekProgress: { done: 2, total: 2, next: null } }, 'ahead'],
    // rule 5: no week
    [{ hasWeek: false, weekProgress: NO_WEEK }, 'setup'],
    // unfinished work and dues still outrank a missing week
    [{ hasWeek: false, weekProgress: NO_WEEK, capsuleLeft: 1 }, 'resume'],
    [{ hasWeek: false, weekProgress: NO_WEEK, dueTotal: 3 }, 'due'],
  ];
  for (const [over, kind] of table) assert.equal(PICK(over), kind, JSON.stringify(over));
});

test('"You were reading" falls through when the last item is done, a tool, or already the Continue target', () => {
  assert.equal(PICK({ lastRead: Object.assign({}, LAST_READ, { done: true }) }), 'week');
  assert.equal(PICK({ lastRead: Object.assign({}, LAST_READ, { kind: 'tool' }) }), 'week');
  assert.equal(PICK({ lastRead: Object.assign({}, LAST_READ, { isContinueTarget: true }) }), 'week');
  assert.equal(PICK({ lastRead: null }), 'week');
});

test('a capsule with nothing left and a block with no next step do not win', () => {
  assert.equal(PICK({ capsuleLeft: 0, blockNext: null, dueTotal: 1 }), 'due');
  assert.equal(PICK({ capsuleLeft: -1 }), 'week');
  assert.equal(PICK({ capsuleLeft: 'x' }), 'week');
});

test('a week with no items is neither complete nor in progress; Continue still leads', () => {
  assert.equal(PICK({ weekProgress: NO_WEEK }), 'week');
  assert.equal(F.fdTodayPrimary(undefined).kind, 'setup', 'no inputs at all reads as no week');
});

test('fdTodayLastRead resolves cw_last against THIS week only and carries done + target', () => {
  const items = F.fdItemsForWeek(IDX, 1);           // a.md (read), t.html (tool)
  const progress = F.fdTodayProgress(items, {});    // next = a.md
  assert.equal(F.fdTodayLastRead('zzz.md', items, progress, {}), null, 'not a week item');
  assert.equal(F.fdTodayLastRead('', items, progress, {}), null);
  assert.equal(F.fdTodayLastRead(null, items, progress, {}), null);
  assert.deepEqual(F.fdTodayLastRead('a.md', items, progress, {}),
    { ref: 'a.md', kind: 'read', title: 'Page A', minutes: 6, done: false, isContinueTarget: true });
  assert.deepEqual(F.fdTodayLastRead('t.html', items, progress, { 't.html': true }),
    { ref: 't.html', kind: 'tool', title: 'Tool T', minutes: null, done: true, isContinueTarget: false });
});

test('the explanation line is one paragraph with the approved copy, audience-neutral, and no due/capture markup', () => {
  assert.equal(F.fdTodayWhy(),
    '<p class="fd-primary__why">First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.</p>');
  assert.equal(F.FD_TODAY_WHY, 'First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.');
  assert.doesNotMatch(F.fdTodayWhy(), AUDIENCE_TOKEN_RE);
  assert.doesNotMatch(F.fdTodayWhy(), /fd-due|fd-capture/i);
});

test('the lead-end marker is an HTML comment the shell can splice at', () => {
  assert.equal(F.FD_TODAY_LEAD_END, '<!--fd-lead-end-->');
});

// ---- fdContinue: one lead card, demotable ------------------------------------------------

const WK1 = F.fdFindWeek(IDX, 1);
const PROG = (done) => F.fdTodayProgress(F.fdItemsForWeek(IDX, 1), done);

test('fdContinue: primary undefined renders exactly what primary=true renders, and opens with the pinned class', () => {
  const a = F.fdContinue(IDX, s({}), WK1, PROG({}));
  const b = F.fdContinue(IDX, s({}), WK1, PROG({}), true);
  assert.equal(a, b);
  assert.match(a, /^<button type="button" class="fd-continue" data-fd-open="a\.md">/);
  assert.doesNotMatch(a, /is-secondary|fd-freshset/);
});

test('fdContinue: primary=false adds is-secondary and changes nothing else', () => {
  const secondary = F.fdContinue(IDX, s({}), WK1, PROG({}), false);
  assert.match(secondary, /^<button type="button" class="fd-continue is-secondary" data-fd-open="a\.md">/);
  assert.equal(secondary.replace(' is-secondary', ''), F.fdContinue(IDX, s({}), WK1, PROG({})));
});

test('fdContinue names the kind of the next item with the same chip rule as the week rows', () => {
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({})),
    /<span class="fd-continue__title">Page A<span class="fd-chip">read<\/span> →<\/span>/);
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true })),
    /<span class="fd-continue__title">Tool T<span class="fd-chip is-tool">tool<\/span> →<\/span>/);
  // A rights reference reads "reference", never "tool" (fd_data.js: rights is a presentation flag).
  const rights = JSON.parse(JSON.stringify(IDX));
  rights.weeks[0].items[1].rights = true;
  assert.match(F.fdContinue(rights, s({}), F.fdFindWeek(rights, 1),
    F.fdTodayProgress(F.fdItemsForWeek(rights, 1), { 'a.md': true })),
    /<span class="fd-chip is-tool">reference<\/span>/);
  // No chip on the look-ahead card — there is no next item to name.
  assert.doesNotMatch(F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true, 't.html': true })), /fd-chip/);
});

test('a completed week, when primary, offers a fresh set beside the look-ahead card — as a sibling, never nested', () => {
  const done = { 'a.md': true, 't.html': true };
  const lead = F.fdContinue(IDX, s({ done }), WK1, PROG(done));
  assert.match(lead, /<\/button><button type="button" class="fd-btn fd-btn--ghost fd-freshset" data-fd-open="question-bank-practice\.html">Practice a fresh set →<\/button>$/);
  assert.equal((lead.match(/<button/g) || []).length, 2);
  assert.doesNotMatch(F.fdContinue(IDX, s({ done }), WK1, PROG(done), false), /fd-freshset/,
    'a demoted look-ahead card keeps its footprint small');
  assert.doesNotMatch(F.fdContinue(IDX, s({}), WK1, PROG({})), /fd-freshset/,
    'an unfinished week never offers the fresh set from this card');
});

test('fdToday demotes its own Continue card only when a device-store row won', () => {
  for (const kind of [undefined, 'week', 'ahead', 'setup']) {
    assert.match(F.fdToday(IDX, s({ primaryKind: kind })), /class="fd-continue" data-fd-open/, String(kind));
  }
  for (const kind of ['resume', 'block', 'due', 'read']) {
    assert.match(F.fdToday(IDX, s({ primaryKind: kind })), /class="fd-continue is-secondary" data-fd-open/, kind);
  }
});

test('fdToday emits the lead-end marker exactly once, directly after the lead card', () => {
  const html = F.fdToday(IDX, s({}));
  assert.equal(html.split(F.FD_TODAY_LEAD_END).length - 1, 1);
  const lead = html.indexOf('class="fd-continue"');
  const mark = html.indexOf(F.FD_TODAY_LEAD_END);
  const list = html.indexOf('<div class="fd-listhead">');
  assert.ok(lead > -1 && lead < mark && mark < list, `lead ${lead} mark ${mark} list ${list}`);
  const setup = F.fdToday(IDX, s({ week: null }));
  assert.equal(setup.split(F.FD_TODAY_LEAD_END).length - 1, 1);
  assert.ok(setup.indexOf('fd-setupcta') < setup.indexOf(F.FD_TODAY_LEAD_END));
  const complete = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.ok(complete.indexOf('fd-freshset') < complete.indexOf(F.FD_TODAY_LEAD_END),
    'the fresh-set button belongs to the lead, above the marker');
});

test('the same primary kind renders the same lead treatment for both path ids', () => {
  for (const id of ['ms3-six-week', 'resident-four-week']) {
    const idx = Object.assign({}, IDX, { path: { id } });
    assert.match(F.fdToday(idx, s({ primaryKind: 'week' })), /class="fd-continue" data-fd-open/, id);
    assert.match(F.fdToday(idx, s({ primaryKind: 'resume' })), /class="fd-continue is-secondary" data-fd-open/, id);
  }
});

test('every new string is audience-neutral', () => {
  const done = { 'a.md': true, 't.html': true };
  const all = F.fdContinue(IDX, s({}), WK1, PROG({}), false)
    + F.fdContinue(IDX, s({ done }), WK1, PROG(done))
    + F.fdTodayWhy();
  assert.doesNotMatch(all, AUDIENCE_TOKEN_RE);
});

test('phone pill ordering is CSS-only at 480px and desktop remains unchanged', () => {
  const css = read('frontdoor/frontdoor.css');
  const phone = /@media\s*\(max-width:480px\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(phone,'phone-only breakpoint exists');
  assert.match(phone[1], /\.fd-today__main\{display:flex;flex-direction:column\}/);
  assert.match(phone[1], /\.fd-today__main > \.fd-quicktools--pills\{order:-1;margin-bottom:var\(--fd-space-\d+\)\}/);
  assert.match(css, /@media \(min-width:1000px\)\{[\s\S]*?\.fd-quicktools--pills\{display:none\}/);
});
