// Contract for the Today renderer. Evaluates the real snippet body via new Function, following
// tests/fd-data.test.mjs and tests/fd-shell.test.mjs. Concatenated in the same dependency order
// inject_shared_snippets() uses on the built page: phase_policy.js (localDayIndex) -> fd_state.js
// (fdDailyPick/fdExamCountdown, which call it) -> fd_data.js (the join layer) ->
// fd_today.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const todaySrc = read('frontdoor/fd_today.js');
const frontdoorCss = read('frontdoor/frontdoor.css');

// eslint-disable-next-line no-new-func
const make = (governanceBadge) => new Function('governanceBadge', `
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${todaySrc}
  return { fdTodayProgress: fdTodayProgress, fdToday: fdToday, fdBuildIndex: fdBuildIndex,
           fdItemsForWeek: fdItemsForWeek, fdLibraryOnlyReads: fdLibraryOnlyReads,
           fdFindWeek: fdFindWeek, fdContinue: fdContinue, fdTodayPrimary: fdTodayPrimary,
           fdTodayLastRead: fdTodayLastRead, fdQuickToolLabel: fdQuickToolLabel,
           FD_TODAY_PRIMARY_ORDER: FD_TODAY_PRIMARY_ORDER, FD_TODAY_DEVICE_KINDS: FD_TODAY_DEVICE_KINDS,
           fdQuickTools: fdQuickTools, fdThread: fdThread, fdWeekCaseStep: fdWeekCaseStep,
           fdUnitWeek: fdUnitWeek, fdAlsoRow: fdAlsoRow, fdPilotFeedback: fdPilotFeedback,
           fdTodayPurpose: fdTodayPurpose, fdConsistency: fdConsistency, fdSetupCta: fdSetupCta,
           FD_QUICKTOOLS_PREFERRED: FD_QUICKTOOLS_PREFERRED };
`)(governanceBadge || function(){return "";});
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
  careResources: [
    { id: 'resource-finder', title: 'Find services and community supports',
      description: 'Treatment, housing, food, transportation, and family supports.',
      url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html',
      searchTerms: ['community resources', 'housing help'] },
    { id: 'meeting-calendar', title: 'Find a recovery meeting',
      description: 'Current recovery-meeting options from ReConnect.',
      url: 'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html',
      searchTerms: ['recovery meeting', 'aa meeting'] },
  ],
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

test('Today marks only the winning Continue or setup control as a dock source', () => {
  const week = F.fdToday(IDX, s({}));
  assert.equal((week.match(/data-fd-dock-source=/g) || []).length, 1);
  assert.match(week, /data-fd-dock-source="primary-week" data-fd-dock-label="Continue"/);
  const ahead = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.match(ahead, /data-fd-dock-source="primary-ahead" data-fd-dock-label="Preview week"/);
  assert.equal((ahead.match(/data-fd-dock-source=/g) || []).length, 1);
  const setup = F.fdToday(IDX, s({ week: null }));
  assert.match(setup, /data-fd-dock-source="primary-setup" data-fd-dock-label="Set rotation week"/);
  assert.equal((setup.match(/data-fd-dock-source=/g) || []).length, 1);
  assert.equal((F.fdToday(IDX, s({ primaryKind: 'due' })).match(/data-fd-dock-source=/g) || []).length, 0);
  assert.equal((F.fdToday(IDX, s({ week: null, primaryKind: 'resume' })).match(/data-fd-dock-source=/g) || []).length, 0);
});

test('Today keeps the Shift-ready entry below its primary action and emits no in-flow Care row', () => {
  const html = F.fdToday(IDX, s({ offlineHtml: '<aside class="fd-offline" data-test-offline></aside>' }));
  const primary = html.indexOf('data-fd-dock-source="primary-week"');
  const readiness = html.indexOf('data-test-offline');
  assert.ok(primary >= 0 && readiness > primary);
  // Retired 2026-09-26: the header .fd-carebtn (phones) and the Care tab (wider) already reach it.
  assert.doesNotMatch(html, /fd-care-entry/);
  assert.equal((html.match(/data-test-offline/g) || []).length, 1);
});

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

// 2026-10-01: the heading is the week's theme, not a time-of-day greeting -- "Good evening" was
// the largest text on the page and told the learner nothing. Without a week it is "Today".
test('the heading names the week, and the subhead places it in the rotation and the day', () => {
  const html = F.fdToday(IDX, s({}));
  const wk = F.fdFindWeek(IDX, 1);
  assert.equal(html.match(/<h1 class="fd-today__h1">([\s\S]*?)<\/h1>/)[1], wk.title);
  assert.match(html, new RegExp(`<p class="fd-today__sub">Week 1 of ${IDX.weeks.length} · [A-Z][a-z]+day`));
  for (const hour of [9, 14, 20]) {
    assert.doesNotMatch(F.fdToday(IDX, s({ nowMs: new Date(2026, 7, 10, hour).getTime() })), /Good (morning|afternoon|evening)/);
  }
  assert.match(F.fdToday(IDX, s({ week: null })), /<h1 class="fd-today__h1">Today<\/h1>/);
});

test('Today visibly invites feedback while the shared site is in active testing', () => {
  const html = F.fdToday(IDX, s({}));
  assert.match(html, /class="fd-pilot"/);
  assert.match(html, /This learning site is in active testing/);
  assert.match(html, /official rotation materials and supervision/);
  assert.match(html, /class="[^"]*pgfb-b[^"]*"[^>]*data-fb-context="Today landing page"/);
  assert.match(html, />Share feedback</);
});

test('the active-testing invitation is audience-neutral', () => {
  const banner = F.fdToday(IDX, s({})).match(/<section class="fd-pilot"[\s\S]*?<\/section>/);
  assert.ok(banner, 'the invitation renders as one labelled section');
  assert.doesNotMatch(banner[0], AUDIENCE_TOKEN_RE);
});

// Owner decision D1 (2026-10-04): the active-testing banner is ONE row at the very top -- title ·
// "Details" disclosure · Share feedback -- with the explanatory sentence verbatim behind Details on
// every width. Nothing is removed, only folded, so the 390px display:none rule the old banner needed
// to stay above the fold is gone with it.
test('the active-testing line is one row at the top, with its sentence folded behind Details', () => {
  const html = F.fdToday(IDX, s({}));
  const pilot = html.match(/<section class="fd-pilot" aria-labelledby="fd-pilot-title">([\s\S]*?)<\/section>/);
  assert.ok(pilot, 'the invitation renders as one labelled section');
  assert.ok(html.indexOf('<section class="fd-pilot"') < html.indexOf('<div class="fd-today__place">'), 'above the eyebrow, at the very top');
  assert.match(pilot[1], /^<h2 class="fd-pilot__title" id="fd-pilot-title">This learning site is in active testing<\/h2><details class="fd-pilot__details"><summary class="fd-pilot__more">Details<\/summary>/);
  assert.match(pilot[1], /<div class="fd-pilot__copy"><p>Use it alongside your official rotation materials and supervision\. Tell us what helped, what was unclear, or what did not work\.<\/p><\/div><\/details>/);
  assert.match(pilot[1], /<button type="button" class="fd-pilot__button pgfb-b" data-fb-context="Today landing page">Share feedback<\/button>$/);
  assert.doesNotMatch(pilot[1], /fd-pilot__eyebrow|<details[^>]*open/, 'no badge, and the sentence starts folded');
  assert.equal(F.fdPilotFeedback(), '<section class="fd-pilot"' + html.slice(html.indexOf('<section class="fd-pilot"') + '<section class="fd-pilot"'.length, html.indexOf('</section>') + '</section>'.length));
  assert.doesNotMatch(frontdoorCss, /\.fd-pilot__copy p\s*\{\s*display:none/, 'the sentence is folded, never hidden by a breakpoint');
});

// ---- accessibility (Fresh Eyes Audit A2/A6) --------------------------------------------------

test('the heading carries no dash and no role label', () => {
  // "Evening, Core rotation —" first lost its dash from the accessible name (aria-hidden) and on
  // 2026-09-19 lost it altogether: after a role label it read as a truncated sentence, and at
  // 375px the dash wrapped onto a line of its own. The prototype's dash followed a NAME.
  const html = F.fdToday(IDX, s({}));
  const h1 = html.match(/<h1 class="fd-today__h1">([\s\S]*?)<\/h1>/);
  assert.ok(h1, 'the heading h1 renders');
  assert.doesNotMatch(h1[1], /—|aria-hidden/, `no dash, decorative or otherwise: ${h1[1]}`);
  // 2026-09-26: no role label either. "Afternoon, Core rotation" named a rotation, not a person,
  // and wrapped to two lines on a phone.
  for (const role of ['Core rotation', 'PGY-1', 'APP / PA / NP']) {
    const withRole = F.fdToday(IDX, s({ role })).match(/<h1 class="fd-today__h1">([\s\S]*?)<\/h1>/)[1];
    assert.doesNotMatch(withRole, new RegExp(role.replace(/[/]/g, '\\/')), `the greeting does not name the role "${role}"`);
  }
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

// One-thread redesign (README §1.9): the daily pick left Today. The Library still reaches every
// library-only read (fdLibraryOnlyReads is untouched); Today no longer suggests one.
test('the daily pick is gone from Today, done or not', () => {
  for (const done of [{}, { 'b.md': true }]) {
    const html = F.fdToday(IDX, s({ done }));
    assert.doesNotMatch(html, /fd-pick|Daily pick/);
    assert.doesNotMatch(html, /Page B/, 'the library-only read is not surfaced on Today');
  }
  assert.doesNotMatch(todaySrc, /fdDailyPick|fdPick\(/);
  assert.equal(F.fdLibraryOnlyReads(IDX).map((it) => it.ref).join(), 'b.md', 'the Library candidate list is unchanged');
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

// Safety Kit sits above Quick Tools in the desktop rail so it reads as an extension of the
// header's red Safety button, not an afterthought below the tools list (2026-09-26).
test('Safety kit precedes Quick tools in the desktop rail', () => {
  const html = F.fdToday(IDX, s({}));
  const rail = html.slice(html.indexOf('class="fd-rail"'));
  const kit = rail.indexOf('Safety kit');
  const tools = rail.indexOf('Quick tools');
  assert.ok(kit > -1 && tools > -1, 'both section headings render inside the rail');
  assert.ok(kit < tools, 'Safety kit must come first, next to the red Safety button in the header');
});

test('Today leaves patient-care links to the dedicated top-level destination', () => {
  const html = F.fdToday(IDX, s({}));
  assert.doesNotMatch(html, /aria-label="Patient care resources"|fd-carelinks|data-care-resource/);
  assert.equal((html.match(/class="fd-quicktool"/g) || []).length, 2,
    'the existing responsive Quick Tools remain intact');
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

// Owner decision D2 (2026-10-04): the strip moved OFF Today and into Learning activity & review
// (spa_index.html fdProgressMarkup calls fdConsistency). The renderer is unchanged and still
// pinned here; Today must not render it even when handed the days.
test('the strip is absent until the learner has been active on at least one day', () => {
  assert.equal(F.fdConsistency(undefined, BASE_STATE.nowMs), '', 'no activityDays at all');
  assert.equal(F.fdConsistency(NONE, BASE_STATE.nowMs), '',
    'a fresh device must not read "Active 0 of the last 7 days"');
  assert.equal(F.fdConsistency([true, true], BASE_STATE.nowMs), '',
    'anything but seven entries is malformed and renders nothing');
});

test('Today never renders the strip, even when handed active days (D2: it lives in the learning record)', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN })), /fd-consistency/);
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN, week: null })), /fd-consistency/);
});

test('the strip counts active days and names itself for assistive tech', () => {
  const html = F.fdConsistency(FOUR_OF_SEVEN, BASE_STATE.nowMs);
  assert.match(html, /^<div class="fd-consistency" role="img" aria-label="Active 4 of the last 7 days">/);
  assert.equal((html.match(/fd-consistency__dot is-on/g) || []).length, 4);
  assert.equal((html.match(/class="fd-consistency__dot(?: is-on)?"/g) || []).length, 7);
  assert.match(html, /<span class="fd-consistency__dots" aria-hidden="true">/);
  assert.match(html, /<span class="fd-consistency__text" aria-hidden="true">Active 4 of the last 7 days<\/span>/);
});

test('day letters walk back from nowMs and end on today, oldest first', () => {
  // BASE_STATE.nowMs is Monday 2026-08-10, so the seven labels run Tue..Mon.
  const html = F.fdConsistency(FOUR_OF_SEVEN, BASE_STATE.nowMs);
  const letters = [...html.matchAll(/fd-consistency__label">([A-Z])</g)].map((m) => m[1]);
  assert.deepEqual(letters, ['T', 'W', 'T', 'F', 'S', 'S', 'M']);
});

test('an unusable nowMs drops the strip rather than throwing the whole Today render', () => {
  assert.equal(F.fdConsistency(FOUR_OF_SEVEN, undefined), '');
  assert.doesNotMatch(F.fdToday(IDX, s({ activityDays: FOUR_OF_SEVEN, nowMs: undefined })), /fd-consistency/);
});

test('the strip copy is audience-neutral', () => {
  assert.doesNotMatch(F.fdConsistency(FOUR_OF_SEVEN, BASE_STATE.nowMs), AUDIENCE_TOKEN_RE);
});

// ---- the subhead, joined -- the front door's most-read line --------------------------
//
// fdExamCountdown returns a bare fragment ('· exam in ~5 days'): separator dot included, leading
// space NOT -- the caller owns the join. Concatenating
// it directly printed "Sunday· exam in ~5 days" through weeks 5 and 6. tests/fd-state.test.mjs
// pins the fragment; these pin the JOINED string, which is what a learner actually reads and
// which no test covered before.

// The eyebrow's TEXT node: everything before the "Change week" control that follows it when a week
// is set (one-thread redesign; CSS owns the gap, so no text space precedes the button).
function subOf(html) {
  const m = html.match(/<p class="fd-today__sub">([^<]*)(?:<button type="button" class="fd-today__changeweek" data-fd-change-week>Change week<\/button>)?<\/p>/);
  assert.ok(m, 'no .fd-today__sub found');
  return m[1];
}

// 2026-08-16 is the Sunday of the week whose Monday (2026-08-10) anchors fd-state's countdown
// fixture; at week 5 that is 5 days out from the week-6 Friday.
const SUNDAY_W5 = new Date(2026, 7, 16, 9, 0, 0).getTime();
// The countdown belongs to the path that ends in an exam (fdPathExamCountdown, fd_state.js), so
// these indexes carry the path ids frontdoor_catalog.py pins. IDX itself has no path id and, like
// any path without an exam, shows no countdown unless a date is stored.
const MS3_IDX = F.fdBuildIndex({ ...FIX_CUR, path: { id: 'ms3-six-week', weekCount: 6 } }, FIX_META, FIX_TOOLS, FIX_MAN);
const RES_IDX = F.fdBuildIndex({ ...FIX_CUR, path: { id: 'resident-four-week', weekCount: 6 } }, FIX_META, FIX_TOOLS, FIX_MAN);

test('the exam countdown joins onto the subhead with a separating space', () => {
  assert.equal(subOf(F.fdToday(MS3_IDX, s({ week: 5, nowMs: SUNDAY_W5 }))),
    'Week 5 of 6 · Sunday · exam in ~5 days');
});

test('the countdown joins directly after the day name now that the streak clause is gone', () => {
  assert.equal(subOf(F.fdToday(MS3_IDX, s({ week: 5, streak: 3, activityDays: FOUR_OF_SEVEN, nowMs: SUNDAY_W5 }))),
    'Week 5 of 6 · Sunday · exam in ~5 days');
});

// Residents have no end-of-block exam. Until 2026-09-24 the countdown fired in the final two
// weeks of ANY path, so the resident Today told residents an exam was ~N days away. Same week,
// same clock as the MS3 pin above -- only the path differs. (A stored date re-opens it on any
// path; tests/fd-state.test.mjs pins that half, where storage can be injected.)
test('no exam countdown on a path that does not end in an exam', () => {
  for (const idx of [RES_IDX, IDX]) {
    for (const week of [5, 6]) {
      const sub = subOf(F.fdToday(idx, s({ week, nowMs: SUNDAY_W5 })));
      assert.doesNotMatch(sub, /exam/, `path "${idx.path.id}" week ${week}: ${sub}`);
      assert.doesNotMatch(sub, / $/, 'and no stranded join space');
    }
  }
});

// ---- the exam-date nudge (2026-09-26) -----------------------------------------------
//
// With no stored date the taper never engages, and the date's only home is the settings panel's
// Pacing field (fd_sheet.js). Today used to duplicate that field inline; it now only nudges toward
// it. On the exam path Today asks once -- storage is absent in this harness, so fdExamDatePrompt
// (fd_state.js, pinned in fd-state.test.mjs with storage injected) always answers "ask" here.
test('the exam path nudges below the primary action and above the week list', () => {
  const html = F.fdToday(MS3_IDX, s({ week: 1 }));
  const prompt = html.indexOf('class="fd-today__exam"');
  const primary = html.indexOf('data-fd-dock-source="primary-week"');
  const list = html.indexOf('class="fd-listhead"');
  assert.ok(prompt > -1, 'the nudge renders on the exam path');
  assert.ok(primary > -1 && primary < prompt, 'it never sits above One Thing First\'s primary action');
  assert.ok(list > prompt, 'and it comes before the week list');
  assert.equal((html.match(/class="fd-today__exam"/g) || []).length, 1);
});

// The date field has exactly one home (the settings panel's Pacing section); this nudge only
// reopens the same settings action the gear already exposes. That is a second TRIGGER for one
// action, not a second action -- fd_wire.js's equivalentControl already restores focus to the gear
// once this element is gone (a disconnected invoker falls back to any live control sharing the same
// action attribute and value), so no new fallback code is needed for the nudge to disappear safely
// mid-panel-use. tests/smoke/front-door.spec.js exercises that restore end to end.
test('the nudge has no field of its own and reopens Settings via the gear\'s own action', () => {
  const html = F.fdToday(MS3_IDX, s({ week: 1 }));
  const block = html.slice(html.indexOf('class="fd-today__exam"'), html.indexOf('class="fd-listhead"'));
  assert.doesNotMatch(block, /type="date"|fdTodayExam|fdSetExam/,
    'the date field has exactly one home: the settings panel');
  assert.match(block, /<p class="fd-today__examtext"><strong>Exam date<\/strong>/);
  assert.match(block, /<button type="button" class="fd-today__examcta" data-fd-settings>Set exam date<\/button>/);
  assert.doesNotMatch(block, AUDIENCE_TOKEN_RE);
});

test('no exam-date nudge on a path without an exam, or before a week is set', () => {
  for (const idx of [RES_IDX, IDX]) {
    assert.doesNotMatch(F.fdToday(idx, s({ week: 1 })), /fd-today__exam/,
      `path ${JSON.stringify(idx.path && idx.path.id)}`);
  }
  assert.doesNotMatch(F.fdToday(MS3_IDX, s({ week: null })), /fd-today__exam/,
    'browsing without a week has no rotation to pace');
});

test('every nudge class Today emits has a rule in frontdoor.css', () => {
  for (const cls of ['fd-today__exam', 'fd-today__examtext', 'fd-today__examcta']) {
    assert.match(frontdoorCss, new RegExp(`\\.${cls}\\{`), cls);
  }
});

test('a week with no countdown leaves no trailing space behind', () => {
  const sub = subOf(F.fdToday(IDX, s({})));
  assert.equal(sub, 'Week 1 of 6 · Monday');
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

// 2026-10-01 (owner-directed design pass): the "First things first…" explanation line under the
// primary is retired -- the page order already says it. Pinned absent so it does not drift back.
test('Today renders no explanation line under the primary', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({})), /fd-primary__why|First things first/);
  assert.equal(typeof F.fdQuickToolLabel, 'function');
});

// ---- Composition: the shell hands runtime faces in on state; fdToday places them ------------------
// Until 2026-10-04 the shell string-spliced the device-store rows at an HTML-comment marker. The
// marker is gone: state.nowHtml / state.alsoRows / state.purposeHtml / state.offlineHtml /
// state.caseWeek are the contract (fd_today.js header, "Composition"), and these tests pin where
// each lands. A fixture passing none of them must render exactly a learner with empty stores.

test('the lead-end marker is gone: nothing in the renderer is a splice point', () => {
  assert.doesNotMatch(todaySrc, /fd-lead-end|FD_TODAY_LEAD_END/);
  assert.equal(F.FD_TODAY_DEVICE_KINDS.join(), 'resume,block,read,due');
});

test('a winning device-store face renders as THE Now card, first in the column, inside one .fd-now', () => {
  for (const kind of F.FD_TODAY_DEVICE_KINDS) {
    const html = F.fdToday(IDX, s({ primaryKind: kind, nowHtml: '<a class="fd-due is-primary" href="#x">face</a>' }));
    assert.equal((html.match(/ fd-now fd-now--/g) || []).length, 1, kind);
    const main = html.indexOf('<div class="fd-today__main">');
    const now = html.indexOf('<div class="fd-primary fd-now fd-now--' + kind + '">');
    assert.ok(main > -1 && now === main + '<div class="fd-today__main">'.length, `${kind}: the Now card opens the column`);
    assert.match(html, /class="fd-continue is-secondary"/, 'the week\'s own Continue is demoted');
    assert.ok(html.indexOf('fd-continue is-secondary') > html.indexOf('fd-also'), 'and sits under "Also today"');
  }
  // Without a face to show, a device-store kind leaves no empty shell behind.
  assert.doesNotMatch(F.fdToday(IDX, s({ primaryKind: 'due' })), /fd-now/);
});

test('the lead card is THE Now card for week, ahead and setup, with the kind on the shell', () => {
  const week = F.fdToday(IDX, s({}));
  assert.match(week, /<div class="fd-today__main"><div class="fd-now fd-now--week"><button type="button" class="fd-continue"/);
  const ahead = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.match(ahead, /<div class="fd-now fd-now--ahead"><button type="button" class="fd-continue"[^>]*data-fd-dock-source="primary-ahead"/);
  assert.ok(ahead.indexOf('fd-freshset') < ahead.indexOf('</div><h2 class="fd-sectionhead fd-also">'), 'the fresh-set button stays inside the Now card');
  const setup = F.fdToday(IDX, s({ week: null }));
  assert.match(setup, /<div class="fd-now fd-now--setup"><button type="button" class="fd-setupcta"/);
  for (const html of [week, ahead, setup]) {
    assert.equal((html.match(/fd-now fd-now--/g) || []).length, 1, 'exactly one Now card');
    assert.doesNotMatch(html, /fd-primary/);
  }
});

// The thread needs a VALID projected path (fdActivePathValid, as fd_path.js requires): IDX alone has
// no path id and its weeks carry no focusCategories, exactly like a partial cache response, which
// must render no thread rather than invent one. PATH_IDX is the same fixture made valid.
const PATH_IDX = Object.assign({}, IDX, { path: { id: 'six-week-fixture', weekCount: 6 },
  weeks: IDX.weeks.map((w) => Object.assign({}, w, { focusCategories: [] })) });

test('Also-today rows render in the shell\'s order with their status marks, the week row before saved questions', () => {
  const rows = [
    { kind: 'due', mark: 'due', count: 2, html: '<a class="fd-due" href="#d">due</a>' },
    { kind: 'resume', mark: 'progress', share: 33.4, html: '<section class="fd-resume">r</section>' },
    { kind: 'capture', mark: 'plus', count: 3, html: '<section class="fd-capture">c</section>' },
  ];
  const html = F.fdToday(IDX, s({ primaryKind: 'block', nowHtml: '<section class="fd-block">b</section>', alsoRows: rows }));
  const list = html.match(/<div class="fd-alsolist">([\s\S]*?)<\/div><details|<div class="fd-alsolist">([\s\S]*?)<\/div><div class="fd-listhead">/);
  assert.ok(list, 'the Also list renders between the heading and the week');
  const body = list[1] || list[2];
  const marks = [...body.matchAll(/<div class="fd-also__row" data-fd-mark="([a-z]+)"([^>]*)>/g)].map((m) => m[1] + m[2]);
  assert.deepEqual(marks, [
    'due data-fd-count="2"',
    'progress style="--mark-share:33%"',
    'progress style="--mark-share:0%"',
    'plus data-fd-count="3"',
  ], 'due · resume · the week (Continue, demoted) · saved questions');
  assert.ok(body.indexOf('fd-continue is-secondary') < body.indexOf('fd-capture'), 'the week row precedes the capture row');
  assert.match(html, /<h2 class="fd-sectionhead fd-also">Also today<\/h2><div class="fd-alsolist">/);
});

test('a row with no html is skipped, and the share is clamped to 0-100 and rounded', () => {
  assert.equal(F.fdAlsoRow({ mark: 'progress', share: 150, html: 'x' }), '<div class="fd-also__row" data-fd-mark="progress" style="--mark-share:100%">x</div>');
  assert.equal(F.fdAlsoRow({ mark: 'progress', share: -4, html: 'x' }), '<div class="fd-also__row" data-fd-mark="progress" style="--mark-share:0%">x</div>');
  assert.equal(F.fdAlsoRow({ html: 'x' }), '<div class="fd-also__row" data-fd-mark="ring">x</div>');
  assert.equal(F.fdAlsoRow({ mark: 'due', count: 7, html: '' }), '<div class="fd-also__row" data-fd-mark="due" data-fd-count="7"></div>');
  const html = F.fdToday(IDX, s({ alsoRows: [{ mark: 'due', count: 1, html: '' }, null] }));
  assert.doesNotMatch(html, /fd-alsolist/, 'rows without markup produce no list');
  assert.match(html, /fd-also">Also today</, 'the heading still renders: the chooser sits under it');
  // A bare status line (the transient concept count with nothing due) follows the heading unwrapped.
  const status = F.fdToday(IDX, s({ statusHtml: '<p role="status" data-fd-concept-status>Concepts due: checking…</p>' }));
  assert.match(status, /fd-also">Also today<\/h2><p role="status" data-fd-concept-status>Concepts due: checking…<\/p>/);
  assert.doesNotMatch(status, /fd-also__row/);
});

test('the chooser, the offline receipt and the case step land where the spec puts them', () => {
  const html = F.fdToday(PATH_IDX, s({
    offlineHtml: '<aside class="fd-offline" data-test-offline></aside>',
    purposeHtml: '<details class="fd-purpose" data-test-purpose></details>',
    alsoRows: [{ mark: 'due', count: 1, html: '<a class="fd-due" href="#d">due</a>' }],
    caseWeek: { n: 1, title: 'Admission', learnerTask: 'Open the interview.', handoff: 'Present the timeline.', ref: 'one-patient-six-weeks.html' },
  }));
  const at = (needle) => { const i = html.indexOf(needle); assert.ok(i > -1, needle); return i; };
  const order = [
    at('class="fd-pilot"'), at('class="fd-today__place"'), at('class="fd-thread"'),
    at('class="fd-now fd-now--week"'), at('data-test-offline'), at('fd-also">Also today'),
    at('class="fd-alsolist"'), at('data-test-purpose'), at('class="fd-listhead"'),
    at('class="fd-unit"'), at('class="fd-quicktools--pills"'), at('class="fd-today__record"'), at('class="fd-rail"'),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'pilot · place · thread · Now · offline · Also · rows · chooser · week · unit · pills · record · rail');
  assert.equal((html.match(/data-test-offline/g) || []).length, 1);
});

// ---- fdContinue: one lead card, demotable ------------------------------------------------

const WK1 = F.fdFindWeek(IDX, 1);
const PROG = (done) => F.fdTodayProgress(F.fdItemsForWeek(IDX, 1), done);

test('fdContinue: primary undefined renders exactly what primary=true renders, and opens with the pinned class', () => {
  const a = F.fdContinue(IDX, s({}), WK1, PROG({}));
  const b = F.fdContinue(IDX, s({}), WK1, PROG({}), true);
  assert.equal(a, b);
  assert.match(a, /^<button type="button" class="fd-continue" data-fd-open="a\.md" data-fd-reading-resume="1" data-fd-dock-source="primary-week" data-fd-dock-label="Continue">/);
  assert.doesNotMatch(a, /is-secondary|fd-freshset/);
});

test('Continue marks only a reading open for one-shot restored-heading focus', () => {
  const reading = F.fdContinue(IDX, s({}), WK1, PROG({}));
  assert.match(reading, /data-fd-open="a\.md" data-fd-reading-resume="1"/);
  const tool = F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true }));
  assert.doesNotMatch(tool, /data-fd-reading-resume/);
});

test('fdContinue: primary=false adds is-secondary, drops the Now-card button and arrows the title', () => {
  const secondary = F.fdContinue(IDX, s({}), WK1, PROG({}), false);
  assert.match(secondary, /^<button type="button" class="fd-continue is-secondary" data-fd-open="a\.md" data-fd-reading-resume="1">/);
  assert.doesNotMatch(secondary, /fd-continue__cta|data-fd-dock-source/, 'a demoted card has no filled button and no dock source');
  assert.match(secondary, /<span class="fd-continue__title">Page A →<\/span>/, 'the arrow rides on the title instead');
  // Everything else -- route, kicker, count, segments -- is byte-identical.
  const primary = F.fdContinue(IDX, s({}), WK1, PROG({}));
  const strip = (h) => h.replace(' is-secondary', '').replace(' data-fd-dock-source="primary-week" data-fd-dock-label="Continue"', '')
    .replace(/<span class="fd-continue__cta" aria-hidden="true">Continue →<\/span>/, '').replace('Page A →', 'Page A');
  assert.equal(strip(secondary), strip(primary));
});

test('the primary Continue carries one filled button as a span: the card is already the control', () => {
  const html = F.fdContinue(IDX, s({}), WK1, PROG({}));
  assert.match(html, /<\/span><span class="fd-continue__cta" aria-hidden="true">Continue →<\/span><span class="fd-continue__meta">/);
  assert.equal((html.match(/<button/g) || []).length, 1, 'never a button inside the button');
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true, 't.html': true })), /fd-continue__cta" aria-hidden="true">Preview week →</);
  const last = F.fdContinue(IDX, s({ week: 6 }), F.fdFindWeek(IDX, 6), F.fdTodayProgress([], {}));
  assert.match(last, /fd-continue__cta" aria-hidden="true">Review week →</);
});

test('fdContinue names the kind of the next item with the same chip rule as the week rows', () => {
  // 2026-10-01: a reading is the default kind and carries no chip; only the exceptions do.
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({})),
    /<span class="fd-continue__title">Page A<\/span>/);
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true })),
    /<span class="fd-continue__title">Tool T<span class="fd-chip is-tool">tool<\/span><\/span>/);
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

test('the Now card precedes "Also today", which precedes the week list, for every lead kind', () => {
  for (const state of [s({}), s({ week: null }), s({ done: { 'a.md': true, 't.html': true } })]) {
    const html = F.fdToday(IDX, state);
    const now = html.indexOf('class="fd-now ');
    const also = html.indexOf('fd-also">Also today');
    assert.ok(now > -1 && also > now, `Now ${now} before Also ${also}`);
    if (state.week !== null) assert.ok(html.indexOf('<div class="fd-listhead">') > also, 'the week list follows Also today');
  }
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
    + F.fdContinue(IDX, s({ done }), WK1, PROG(done));
  assert.doesNotMatch(all, AUDIENCE_TOKEN_RE);
});

test('phone quick tools remain CSS-first, follow the week, and patient-care duplicates stay retired', () => {
  const css = read('frontdoor/frontdoor.css');
  const phoneBlocks = [...css.matchAll(/@media\s*\(max-width:640px\)\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
  // One-thread redesign (README §1.9): the order:-1 hoist that put the pills above the Now card is
  // gone. The Now card is first after the heading at every width; the pills follow the week.
  assert.doesNotMatch(phoneBlocks, /\.fd-quicktools--pills\{order:-1|order:-1;margin-bottom/);
  assert.doesNotMatch(phoneBlocks, /\.fd-today__main\{display:flex;flex-direction:column\}/);
  // 2026-09-26 fold probe: ONE sideways row, not a wrapped block.
  assert.match(phoneBlocks, /\.fd-quicktools--pills\{flex-wrap:nowrap;overflow-x:auto;/);
  assert.match(phoneBlocks, /\.fd-quicktools--pills \.fd-quicktool\{flex:0 0 auto;/);
  // Today no longer emits an in-flow Care row (see the Shift-ready test); APP's must stay visible.
  assert.doesNotMatch(css, /\.fd-app[^{]*\.fd-care-entry\{display:none\}/);
  assert.match(css, /@media \(min-width:1000px\)\{[\s\S]*?\.fd-quicktools--pills\{display:none\}/);
  assert.doesNotMatch(css, /fd-carelinks--mobile|fd-carelinks--rail|fd-kit__care/);
  // The pills sit after the week list and the record link after the pills, in document order.
  const html = F.fdToday(IDX, s({}));
  assert.ok(html.indexOf('class="fd-listhead"') < html.indexOf('class="fd-quicktools--pills"'));
  assert.ok(html.indexOf('class="fd-quicktools--pills"') < html.indexOf('class="fd-today__record"'));
});

test('the quick-tool fallback leads with the on-shift list, skips what a site lacks, then goes by ref', () => {
  const tool = (ref, extra) => ({ ref, kind: 'tool', title: 'T ' + ref, ...extra });
  const byRef = {};
  for (const ref of ['aaa.html', 'capacity.html', 'mse.html', 'violence.html', 'zzz.html', 'rights.html', 'hidden.html'])
    byRef[ref] = tool(ref);
  byRef['rights.html'].rights = { kind: 'reference' };
  byRef['hidden.html'].searchOnly = true;
  byRef['notes.md'] = { ref: 'notes.md', kind: 'read' };
  // withdrawal.html and interaction-cards.html are absent here: a site without them just skips them.
  const week = [tool('violence.html')];
  const refs = F.fdQuickTools({ byRef }, week).map((t) => t.ref);
  assert.deepEqual(refs, ['violence.html', 'mse.html', 'capacity.html', 'aaa.html', 'zzz.html'],
    'week tool first, then the preferred list in its order without duplicates, then the rest by ref');
  assert.ok(F.FD_QUICKTOOLS_PREFERRED.every((ref) => /\.html$/.test(ref)), 'the preferred list names tools only');
  const five = ['a1.html', 'a2.html', 'a3.html', 'a4.html', 'a5.html'].map((ref) => tool(ref));
  assert.deepEqual(F.fdQuickTools({ byRef }, five).map((t) => t.ref), five.map((t) => t.ref),
    'five week tools leave no room for the fallback');
});

// ---- 2026-10-01 design pass -------------------------------------------------------------

test('a week row labels only tools and references; a reading carries no chip', () => {
  const html = F.fdToday(IDX, s({}));
  assert.doesNotMatch(html, /<span class="fd-chip">read<\/span>/);
  assert.match(html, /<span class="fd-chip is-tool">tool<\/span>/);
});

test('Continue shows the week as one segment per activity, filled as they are done', () => {
  const none = F.fdContinue(IDX, s({}), WK1, PROG({}));
  assert.equal((none.match(/class="fd-continue__seg"/g) || []).length, 2);
  assert.match(none, /<span class="fd-continue__segs" aria-hidden="true">/, 'decorative: the count is the text');
  const half = F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true }));
  assert.equal((half.match(/fd-continue__seg is-done/g) || []).length, 1);
  assert.doesNotMatch(none, /fd-ring/, 'the percentage ring is retired');
});

test('a quick tool shows the title before its em-dash subtitle, keeping the full title as a tooltip', () => {
  assert.equal(F.fdQuickToolLabel('The Interview Room — AI Standardized Patient'), 'The Interview Room');
  assert.equal(F.fdQuickToolLabel('Mental Status Exam'), 'Mental Status Exam');
  assert.equal(F.fdQuickToolLabel('— leading dash'), '— leading dash', 'never an empty label');
});

test('the Safety kit renders as one panel holding every kit row', () => {
  const html = F.fdToday(IDX, s({}));
  const panel = html.match(/<div class="fd-railkit">([\s\S]*?)<\/div><\/div>/);
  assert.ok(panel, 'the rail kit panel renders');
  assert.equal((panel[1].match(/class="fd-kitcard"/g) || []).length, IDX.kit.length);
  assert.doesNotMatch(html, /fd-kitcard__dot/);
});

test('a week row keeps its full title in the markup, with the em-dash subtitle in its own span', () => {
  // 2026-10-03: a phone clips .fd-row__sub visually, so the row reads "The Interview Room" rather
  // than ellipsing mid-word; textContent (which several smoke specs read) stays the full title.
  const idx = JSON.parse(JSON.stringify(IDX));
  idx.byRef['t.html'].title = 'Tool T — With a subtitle';
  idx.weeks[0].items[1].title = 'Tool T — With a subtitle';
  const html = F.fdToday(idx, s({}));
  const title = html.match(/<span class="fd-row__title">(Tool T[\s\S]*?)<\/span><\/span>/);
  assert.ok(title, 'the subtitled row renders');
  assert.equal(title[1], 'Tool T<span class="fd-row__sub"> — With a subtitle');
  const [short, sub] = title[1].split('<span class="fd-row__sub">');
  assert.equal(short + sub, 'Tool T — With a subtitle', 'the two parts are the full title');
  assert.match(html, /<span class="fd-row__title">Page A<\/span>/, 'a title with no subtitle is unchanged');
});

// One-thread redesign (README §1.5): the Prepare-for-tomorrow invitation belongs INSIDE the
// preparation chooser, not as a card of its own. It renders through fdTodayPurpose -- the shell's
// chooser -- so it is one optional action at every week, with the tool's honest review status.
test('preparation is a single optional action inside the chooser at every week, with honest fixture status',()=>{
 const prep={ref:'prepare-for-tomorrow.html',kind:'tool',title:'Prepare for tomorrow',governance:{status:'pending',riskKind:'clinical',riskLevel:'moderate'}};
 for(const week of [null,1,6]) for(const status of ['pending','reviewed']) for(const open of [true,false]) {
   const item={...prep,governance:{...prep.governance,status}}, idx={...IDX,byRef:{...IDX.byRef,[prep.ref]:item}};
   const G=make(g=>'<span class="fixture-badge">'+g.status+'</span>');
   const chooser=G.fdTodayPurpose(idx,'',open);
   assert.equal((chooser.match(/class="fd-prepare"/g)||[]).length,1);
   assert.match(chooser,/data-fd-open="prepare-for-tomorrow.html"/);assert.match(chooser,/Choose a task and prepare in 5 or 15 minutes/);assert.ok(chooser.includes(status));
   assert.match(chooser,/<div class="fd-prepare">[\s\S]*<\/div><\/details>$/,'inside the disclosure, after the choices');
   // The chooser is where it renders on Today; Today itself emits no second copy.
   const html=G.fdToday(idx,s({week,purposeHtml:chooser}));
   assert.equal((html.match(/class="fd-prepare"/g)||[]).length,1);
   assert.ok(html.indexOf('class="fd-prepare"')>html.indexOf('fd-also">Also today'));
   assert.doesNotMatch(G.fdToday(idx,s({week})),/class="fd-prepare"/,'nothing but the chooser carries it');
   assert.deepEqual(G.FD_TODAY_PRIMARY_ORDER,F.FD_TODAY_PRIMARY_ORDER);
 }
 assert.doesNotMatch(F.fdTodayPurpose(IDX,'',true),/class="fd-prepare"/,'a site without the tool has no invitation');
});

// ---- the six-week thread (one-thread redesign, README §1.2) ---------------------------------------

test('the thread has one node per projected week, marks done by real completion, and previews on Path', () => {
  const html = F.fdThread(PATH_IDX, s({ week: 2 }));
  assert.match(html, /^<nav class="fd-thread" aria-label="Rotation weeks"><ol class="fd-thread__list">/);
  assert.equal((html.match(/<li class="fd-thread__step/g) || []).length, IDX.weeks.length);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.match(html, /<li class="fd-thread__step is-current"><button type="button" class="fd-thread__node" data-fd-tab="path" data-fd-view-week="2" aria-current="step" aria-label="Week 2: W2 \(current week\)">/);
  // Week 1 is in the past but NOT done: it must not be marked done merely for being past.
  assert.match(html, /<li class="fd-thread__step"><button type="button" class="fd-thread__node" data-fd-tab="path" data-fd-view-week="1" aria-label="Week 1: Foundations">/);
  assert.doesNotMatch(html, /is-done/);
  assert.doesNotMatch(html, /data-fd-setweek|data-fd-week=|data-fd-open/, 'a node previews a week; it never sets one or opens an item');
  const done = F.fdThread(PATH_IDX, s({ week: 2, done: { 'a.md': true, 't.html': true } }));
  assert.match(done, /<li class="fd-thread__step is-done"><button[^>]*data-fd-view-week="1" aria-label="Week 1: Foundations \(done\)"><span class="fd-thread__mark" aria-hidden="true">✓<\/span>/);
  assert.match(html, /<span class="fd-thread__mark" aria-hidden="true">1<\/span><span class="fd-thread__label" aria-hidden="true">Foundations<\/span>/);
});

test('the thread renders without a current week while browsing, and not at all without a valid path', () => {
  const browsing = F.fdThread(PATH_IDX, s({ week: null }));
  assert.equal((browsing.match(/<li /g) || []).length, 6);
  assert.doesNotMatch(browsing, /is-current|aria-current/);
  assert.equal(F.fdThread({ weeks: [] }, s({})), '');
  assert.equal(F.fdThread(IDX, s({})), '', 'no path id: a partial projection renders no thread');
  assert.equal(F.fdThread({ path: { id: 'x', weekCount: 1 }, weeks: [{ n: 2, title: 'bad', focusCategories: [] }] }, s({})), '', 'a malformed projection renders nothing');
  const today = F.fdToday(PATH_IDX, s({}));
  assert.ok(today.indexOf('class="fd-thread"') > today.indexOf('</h1>') && today.indexOf('class="fd-thread"') < today.indexOf('fd-today__cols'), 'between the place block and the columns');
  assert.doesNotMatch(F.fdToday(IDX, s({})), /fd-thread/);
});

// ---- "On the unit this week" (README §1.7): derived, read-only, only where the tool ships ---------

const CASE = { weeks: [
  { title: 'Admission: start with the person', learnerTask: 'Practice opening the interview.', handoff: 'Present the timeline first.' },
  { title: 'Week two', learnerTask: 'Task two.' },
] };

test('fdWeekCaseStep returns the week\'s step only when the case tool ships and the week exists', () => {
  const withTool = { byRef: { 'one-patient-six-weeks.html': { kind: 'tool' } } };
  assert.deepEqual(F.fdWeekCaseStep(withTool, CASE, 1), { n: 1, title: 'Admission: start with the person',
    learnerTask: 'Practice opening the interview.', handoff: 'Present the timeline first.', ref: 'one-patient-six-weeks.html', governance: undefined });
  assert.equal(F.fdWeekCaseStep(withTool, CASE, 2).handoff, '', 'a missing handoff is an empty string, not undefined');
  assert.equal(F.fdWeekCaseStep(withTool, CASE, 3), null, 'no matching week');
  assert.equal(F.fdWeekCaseStep(withTool, CASE, 0), null);
  assert.equal(F.fdWeekCaseStep(withTool, null, 1), null, 'no data yet');
  assert.equal(F.fdWeekCaseStep(withTool, { weeks: 'nope' }, 1), null);
  assert.equal(F.fdWeekCaseStep(IDX, CASE, 1), null, 'the fixture site does not ship the tool');
  assert.equal(F.fdWeekCaseStep({ byRef: { 'one-patient-six-weeks.html': { kind: 'read' } } }, CASE, 1), null);
});

test('the unit section renders the case strings verbatim with a real ?week= link, escaped', () => {
  const step = { n: 3, title: 'T <b>', learnerTask: 'L & M', handoff: 'H "q"', ref: 'one-patient-six-weeks.html' };
  const html = F.fdUnitWeek(step);
  assert.match(html, /^<section class="fd-unit" aria-labelledby="fd-unit-title"><span class="fd-unit__line" aria-hidden="true"><\/span><div class="fd-unit__body">/);
  assert.match(html, /<span class="fd-unit__kicker">On the unit this week · Case Journeys, week 3<\/span>/);
  assert.match(html, /<h2 class="fd-unit__title" id="fd-unit-title">T &lt;b&gt;<\/h2><p class="fd-unit__task">L &amp; M<\/p>/);
  assert.match(html, /<p class="fd-unit__handoff"><strong>Carry it to rounds:<\/strong> H &quot;q&quot;<\/p>/);
  assert.match(html, /<a class="fd-btn fd-btn--ghost fd-unit__open" href="\?tool=one-patient-six-weeks\.html&amp;week=3">Open case week 3<\/a><\/div><\/section>$/);
  assert.doesNotMatch(html, /data-fd-open/, 'a ref-only action would drop ?week=');
  assert.doesNotMatch(F.fdUnitWeek({ ...step, handoff: '' }), /fd-unit__handoff/);
  assert.equal(F.fdUnitWeek(null), '');
  // Today renders it after the week list, and never while browsing without a week.
  const today = F.fdToday(IDX, s({ caseWeek: step }));
  assert.ok(today.indexOf('class="fd-unit"') > today.indexOf('<div class="fd-list">'));
  assert.doesNotMatch(F.fdToday(IDX, s({ week: null, caseWeek: step })), /fd-unit/);
  assert.doesNotMatch(F.fdToday(IDX, s({})), /fd-unit/);
});

// ---- the place block and the week heading -----------------------------------------------------

test('the place block carries the eyebrow with Change week, the title, and the theme line in order', () => {
  const html = F.fdToday(IDX, s({}));
  assert.match(html, /<div class="fd-today__place"><p class="fd-today__sub">Week 1 of 6 · Monday<button type="button" class="fd-today__changeweek" data-fd-change-week>Change week<\/button><\/p><h1 class="fd-today__h1">Foundations<\/h1><p class="fd-today__theme">Orientation<\/p><\/div>/);
  const setup = F.fdToday(IDX, s({ week: null }));
  assert.match(setup, /<p class="fd-today__sub">Monday · browsing — no week set<\/p><h1 class="fd-today__h1">Today<\/h1><\/div>/);
  assert.doesNotMatch(setup, /data-fd-change-week>Change week/, 'without a week the setup Now card IS the week action');
  assert.equal((F.fdToday(IDX, s({})).match(/data-fd-change-week/g) || []).length, 1, 'one week control on a set-up Today');
});

test('the week heading carries "N of M done" at its right and the theme no longer rides there', () => {
  const html = F.fdToday(IDX, s({ done: { 'a.md': true } }));
  assert.match(html, /<div class="fd-listhead"><h2 class="fd-sectionhead">This week<\/h2><span class="fd-listhead__count">1 of 2 done<\/span><\/div>/);
  assert.doesNotMatch(html, /fd-listhead__theme/);
  assert.match(F.fdToday(Object.assign({}, IDX, { path: { id: 'ms3-six-week' } }), s({})), /<h2 class="fd-sectionhead">Suggested this week<\/h2><span class="fd-listhead__count">0 of 2 done<\/span>/);
});

test('week rows carry no entrance stagger any more', () => {
  assert.doesNotMatch(F.fdToday(IDX, s({})), /animation-delay/);
  assert.doesNotMatch(todaySrc, /animation-delay/);
});

test('the setup face carries the kicker, the title and one button, in the one Now-card shape', () => {
  const html = F.fdSetupCta();
  assert.match(html, /^<button type="button" class="fd-setupcta" data-fd-change-week data-fd-dock-source="primary-setup" data-fd-dock-label="Set rotation week">/);
  assert.match(html, /<span class="fd-setupcta__kicker">30-second setup<\/span><span class="fd-setupcta__title">Set your rotation week → get a real Today<\/span><\/span><span class="fd-setupcta__cta" aria-hidden="true">Set rotation week<\/span><\/button>$/);
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(F.fdSetupCta(false), /data-fd-dock-source/);
});

test('the rail ends with the learning-record link, and the phone column carries its own copy', () => {
  const html = F.fdToday(IDX, s({}));
  assert.equal((html.match(/class="fd-progresscard" data-fd-progress/g) || []).length, 2, 'one for the rail, one for the phone');
  const rail = html.slice(html.indexOf('<aside class="fd-rail">'));
  assert.match(rail, /Quick tools[\s\S]*<button type="button" class="fd-progresscard" data-fd-progress>[\s\S]*<\/aside>/);
  assert.match(html, /<div class="fd-today__record"><button type="button" class="fd-progresscard" data-fd-progress>/);
});


test('resident thread uses the projected four weeks without a six-week label', () => {
  const idx = {...PATH_IDX, path: {...PATH_IDX.path, weekCount: 4}, weeks: PATH_IDX.weeks.slice(0, 4)};
  const html = F.fdThread(idx, s({week: 2}));
  assert.equal((html.match(/class="fd-thread__step/g) || []).length, 4);
  assert.match(html, /aria-label="Rotation weeks"/);
  assert.doesNotMatch(html, /Six-week|data-fd-view-week="[56]"/);
});

test('Today case excerpt preserves the source tool review badge', () => {
  for (const status of ['pending', 'stale', 'reviewed']) {
    const governance = {status, riskKind: 'clinical', riskLevel: 'moderate'};
    const idx = {byRef: {'one-patient-six-weeks.html': {kind: 'tool', governance}}};
    const G = make((g, options) => {
      assert.equal(g, governance);
      assert.equal(options.compact, true);
      return '<span class="fixture-badge">' + g.status + '</span>';
    });
    const step = G.fdWeekCaseStep(idx, CASE, 1);
    assert.equal(step.governance, governance);
    assert.ok(G.fdUnitWeek(step).includes('<span class="fixture-badge">' + status + '</span>'));
    assert.equal(step.learnerTask, CASE.weeks[0].learnerTask);
    assert.equal(step.handoff, CASE.weeks[0].handoff);
  }
});
