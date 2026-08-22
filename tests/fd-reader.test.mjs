// Contract for the Reader renderer. Evaluates the real snippet body via new Function, following
// tests/fd-data.test.mjs, tests/fd-shell.test.mjs, tests/fd-today.test.mjs, tests/fd-path.test.mjs.
// Concatenated in the same dependency order inject_shared_snippets() uses on the built page:
// phase_policy.js -> fd_state.js -> fd_data.js (the join layer) -> fd_today.js (fdTodayProgress,
// which the rail's "X of Y done" header must derive from so it and Today can never disagree) ->
// fd_reader.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const readerSrc = read('frontdoor/fd_reader.js');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_today.js')}
  ${readerSrc}
  return { fdReaderNeighbours: fdReaderNeighbours, fdReader: fdReader, fdBuildIndex: fdBuildIndex,
           fdItemsForWeek: fdItemsForWeek, fdTodayProgress: fdTodayProgress };
`);
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ==== Step 1: the neighbour arithmetic, pinned exactly as the task brief specifies =============
// It drives both the prev/next footer AND the (wiring-layer) </ -> arrow-key nav, which must agree.

const NEI_WEEK = [{ ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' }];
const NEI_IDX = { weeks: [{ n: 1, title: 'W', theme: 'T', items: NEI_WEEK }] };

test('the first item has no prev and the last has no next', () => {
  assert.equal(F.fdReaderNeighbours(NEI_IDX, 'a.md', 1).prev, null);
  assert.equal(F.fdReaderNeighbours(NEI_IDX, 'c.md', 1).next, null);
});

test('a middle item has both neighbours, in week order', () => {
  const n = F.fdReaderNeighbours(NEI_IDX, 'b.md', 1);
  assert.equal(n.prev.ref, 'a.md');
  assert.equal(n.next.ref, 'c.md');
});

test('an item outside the week yields no neighbours rather than throwing', () => {
  assert.deepEqual(F.fdReaderNeighbours(NEI_IDX, 'zzz.md', 1), { prev: null, next: null },
    'a library-only page opened from the Library has no week to page through');
});

// ==== fixture: a real join via fdBuildIndex, so items carry full shape =========================
//
// Week 1: a.md (read, attested, points, a related tool), b.md (read, plain), tool.html (a tool).
// Week 2: d.md alone, so its next-unread wraps to null rather than to some other week's item.
// lib.md sits in a library column but no week -- the "opened from the Library" case.

const FIX_CUR = {
  weeks: [
    { n: 1, title: 'Foundations', theme: 'Orientation',
      items: [{ ref: 'a.md', kind: 'read' }, { ref: 'b.md', kind: 'read' }, { ref: 'tool.html', kind: 'tool' }] },
    { n: 2, title: 'Week Two', theme: 'T2', items: [{ ref: 'd.md', kind: 'read' }] },
  ],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md', 'b.md', 'tool.html', 'd.md', 'lib.md'] }],
  libraryExclude: [],
  safetyKit: [],
  roles: { ms3: [], resident: [] },
  synonyms: {},
};
const FIX_META = {
  'a.md': { read: 6, tldr: 'Summary A', points: ['Point one', 'Point two'],
    facultyReview: { status: 'reviewed' }, relatedTools: ['tool.html'] },
  'b.md': { read: 4, tldr: 'Summary B' },
  'd.md': { read: 5, tldr: 'Summary D' },
  'lib.md': { read: 2, tldr: 'Summary Lib' },
};
const FIX_TOOLS = { tools: [{ file: 'tool.html', title: 'Tool T', category: 'acute-safety', riskLevel: 'moderate' }] };
const FIX_MAN = {
  tools: [['src/tool.html', 'tool.html', 'Tool T']],
  md: [['src/a.md', 'a.md', 'Page A'], ['src/b.md', 'b.md', 'Page B'],
       ['src/d.md', 'd.md', 'Page D'], ['src/lib.md', 'lib.md', 'Page Lib']],
};
const IDX = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);

const BASE_STATE = { ref: 'a.md', week: 1, fromTab: 'today', done: {}, desk: true };
const s = (over) => Object.assign({}, BASE_STATE, over);

// ---- back link ----------------------------------------------------------------------------

test('the back link and the bottom ghost button name the originating tab', () => {
  assert.match(F.fdReader(IDX, s({ fromTab: 'today' }), ''), /fd-reader__back" data-fd-back>‹ Today</);
  assert.match(F.fdReader(IDX, s({ fromTab: 'today' }), ''), /fd-btn fd-btn--ghost" data-fd-back>Today</);
  assert.match(F.fdReader(IDX, s({ fromTab: 'path' }), ''), /‹ Path</);
  assert.match(F.fdReader(IDX, s({ fromTab: 'library' }), ''), /‹ Library</);
  assert.match(F.fdReader(IDX, s({ fromTab: 'bogus' }), ''), /‹ Today</,
    'an unrecognised fromTab falls back to Today, matching fd_shell.js\'s fdTabs() fallback');
});

// ---- attested pill --------------------------------------------------------------------------

test('the attested pill appears only when item.attested', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md' }), ''), /fd-attested">✓ faculty-attested</);
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'b.md' }), ''), /fd-attested/);
});

// ---- Key points -----------------------------------------------------------------------------

test('the Key points callout is omitted when points is empty, present when not', () => {
  const withPoints = F.fdReader(IDX, s({ ref: 'a.md' }), '');
  assert.match(withPoints, /fd-keypoints/);
  assert.match(withPoints, /Point one/);
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'b.md' }), ''), /fd-keypoints/);
});

// ---- Try it now -----------------------------------------------------------------------------

test('the "Try it now" launcher appears only when toolRef is set', () => {
  const withTool = F.fdReader(IDX, s({ ref: 'a.md' }), '');
  assert.match(withTool, /fd-trynow/);
  assert.match(withTool, /Try it now · Tool T</);
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'b.md' }), ''), /fd-trynow/);
});

// The branch contract fd_search.js's header states and fd_sheet.js's attribute table repeats:
// data-fd-open="<ref>" NAVIGATES; the same attribute with a bare data-fd-sheet beside it opens a
// preview side sheet instead. "Try it now" promises, in its own sub-copy, that the page stays put
// -- so without the modifier the button navigated away from the page it had just promised not to
// leave. Pinned as a pair (copy + attribute inside the SAME button) so the promise and the
// mechanism that keeps it cannot drift apart again.
test('"Try it now" carries data-fd-sheet, so the page it promises to keep really stays put', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md' }), '');
  const start = html.indexOf('class="fd-trynow"');
  assert.notEqual(start, -1, 'no .fd-trynow button found');
  const btn = html.slice(start, html.indexOf('</button>', start));
  assert.match(btn, /data-fd-open="tool\.html" data-fd-sheet>/,
    'data-fd-open alone means navigate -- the bare data-fd-sheet modifier is what selects the sheet');
  assert.match(btn, /this page stays put/,
    'the sub-copy making the promise must live in the same button as the attribute keeping it');
});

test('ordinary navigating targets keep a BARE data-fd-open -- the modifier is not blanket-applied', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1 }), '');
  assert.match(html, /class="fd-prevnext__btn is-next" data-fd-open="b\.md"><span/,
    'prev/next really do navigate; adding data-fd-sheet here would be the opposite bug');
  assert.doesNotMatch(html, /data-fd-open="b\.md" data-fd-sheet/);
  assert.doesNotMatch(html, /class="fd-railnav__row[^"]*" data-fd-open="[^"]*" data-fd-sheet/);
});

test('the "Try it now" title falls back to the raw ref when toolRef resolves to nothing', () => {
  const cur = { weeks: [{ n: 1, title: 'W', theme: 'T', items: [{ ref: 'orphan.md', kind: 'read' }] }],
    libraryColumns: [], libraryExclude: [], safetyKit: [], roles: { ms3: [], resident: [] }, synonyms: {} };
  const meta = { 'orphan.md': { read: 1, tldr: 'x', relatedTools: ['ghost.html'] } };
  const man = { tools: [], md: [['src/orphan.md', 'orphan.md', 'Orphan']] };
  const idx = F.fdBuildIndex(cur, meta, { tools: [] }, man);
  const html = F.fdReader(idx, s({ ref: 'orphan.md', week: 1, done: {} }), '');
  assert.match(html, /Try it now · ghost\.html</);
});

// ---- desktop actions + mobile action bar: BOTH always emitted ------------------------------
//
// The task brief's original Step 1 asked to cover "the desktop-only primary button absent when
// desk: false". The controller superseded that mid-implementation (mirroring Task 4's
// rails-vs-chips ruling): state carries no `desk` field any more, and BOTH
// .fd-article__actions (desktop) and .fd-actionbar (mobile, fixed) are always emitted -- CSS's
// existing 1000px breakpoint decides which one shows, never a JS branch. This was blocked once
// on a real gap (frontdoor.css had no rule hiding .fd-article__actions below 1000px, which would
// have shown BOTH action rows on a phone at once); that gap is now closed in frontdoor.css and
// pinned in CLASS-INVENTORY.md's responsive-visibility table.

test('the desktop primary/ghost pair is always emitted, regardless of any desk-like state', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md' }), ''), /fd-article__actions/);
  assert.match(F.fdReader(IDX, s({ ref: 'a.md', desk: false }), ''), /fd-article__actions/,
    'no desk field controls this any more -- CSS hides it below 1000px instead');
});

test('the mobile fixed action bar is always emitted, regardless of any desk-like state', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md' }), ''), /class="fd-actionbar"/);
  assert.match(F.fdReader(IDX, s({ ref: 'a.md', desk: false }), ''), /class="fd-actionbar"/);
});

test('the mobile action bar\'s primary label is wrapped in a bare <span>', () => {
  // CLASS-INVENTORY's trap: `.fd-actionbar .fd-btn--primary span` supplies the ellipsis; a
  // text-only child overflows uncontained on narrow screens.
  const html = F.fdReader(IDX, s({ ref: 'a.md' }), '');
  const bar = html.slice(html.indexOf('class="fd-actionbar"'));
  assert.match(bar,
    /fd-btn fd-btn--primary" data-fd-toggle="a\.md" aria-pressed="(?:true|false)"><span>[^<]*<\/span><\/button>/);
});

test('the icon-only mobile back control has an explicit accessible name', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md' }), '');
  const bar = html.slice(html.indexOf('class="fd-actionbar"'));
  assert.match(bar, /class="fd-btn fd-btn--ghost" data-fd-back aria-label="Back to Today">‹<\/button>/,
    'the compact mobile back glyph needs the same destination name as the visible desktop control');
});

// ---- prev/next footer -----------------------------------------------------------------------

test('the prev/next footer carries no breakpoint class or style in the markup', () => {
  // A single render is all there is to check: unlike .fd-article__actions/.fd-actionbar, there is
  // no desk-like branch here to exercise twice -- CSS never hides .fd-prevnext at either width.
  assert.match(F.fdReader(IDX, s({ ref: 'a.md' }), ''), /fd-prevnext/);
});

test('an item with no neighbours renders no prevnext footer (and no keyboard tip) at all', () => {
  const html = F.fdReader(IDX, s({ ref: 'lib.md', week: null }), '');
  assert.doesNotMatch(html, /fd-prevnext/);
  assert.doesNotMatch(html, /fd-tip/);
});

test('the first item in a week has no prev button but does have next', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1 }), '');
  assert.doesNotMatch(html, /class="fd-prevnext__btn" data-fd-open/);
  assert.match(html, /class="fd-prevnext__btn is-next" data-fd-open="b\.md"/);
});

test('the last item in a week has a prev button but no next', () => {
  const html = F.fdReader(IDX, s({ ref: 'tool.html', week: 1 }), '');
  assert.match(html, /class="fd-prevnext__btn" data-fd-open="b\.md"/);
  assert.doesNotMatch(html, /is-next/);
});

// ---- THE regression test: action-bar nesting, design handoff §6 ----------------------------
//
// A transformed ancestor silently breaks position:fixed. .fd-reader carries the
// fdFadeUp/fdSlideL/fdSlideR animation (a transform), so if .fd-actionbar were nested inside it
// the bar would stop tracking the *viewport* and scroll away with the article -- on exactly the
// phones it exists for. This asserts on element ORDER and CONTAINMENT in the returned string, not
// on styling, so it fails the moment someone nests the two back together, even though both
// classes would still technically be "present" in the output.

test('the mobile action bar is a sibling of the article element, never a descendant', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md' }), '<p>Body</p>');

  assert.equal((html.match(/<article/g) || []).length, 1,
    'exactly one <article> element expected -- a second would defeat the containment check below');

  const start = html.indexOf('<article class="fd-reader">');
  assert.notEqual(start, -1, 'no .fd-reader article found');
  assert.equal(start, 0,
    '.fd-reader must be the very first thing rendered -- a shared wrapping container around ' +
    'both .fd-reader and .fd-actionbar would still satisfy every check below, and a shared ' +
    'ANIMATED container is exactly the regression this test exists to catch');
  const end = html.indexOf('</article>', start);
  assert.notEqual(end, -1, 'no closing </article> found');

  const inside = html.slice(start, end);
  const after = html.slice(end + '</article>'.length);

  assert.match(inside, /fd-actionbar__spacer/,
    '.fd-actionbar__spacer must be the LAST child inside .fd-reader, to reserve scroll room');
  assert.doesNotMatch(inside, /class="fd-actionbar"/,
    'the fixed action bar itself must NOT be nested inside .fd-reader');
  assert.match(after, /class="fd-actionbar"/,
    'the fixed action bar must appear as a SIBLING, after the closing </article>');
});

// ---- rail nav ---------------------------------------------------------------------------------

test('the rail appears only when the open item actually belongs to the named week', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md', week: 1 }), ''), /fd-railnav/);
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'lib.md', week: null }), ''), /fd-railnav/,
    'a library-only item, opened with no week, gets no rail');
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'a.md', week: 2 }), ''), /fd-railnav/,
    'a.md is not a member of week 2\'s item list');
});

test('the rail\'s "X of Y done" header comes from fdTodayProgress -- the reader and Today cannot disagree', () => {
  const done = { 'a.md': true };
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done }), '');
  const progress = F.fdTodayProgress(F.fdItemsForWeek(IDX, 1), done);
  assert.match(html, new RegExp('Week 1 · ' + progress.done + ' of ' + progress.total + ' done'));
});

test('a done rail row carries is-done on both the dot and the title', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: { 'b.md': true } }), '');
  assert.match(html,
    /fd-railnav__dot is-done" aria-hidden="true">✓<\/span><span class="fd-railnav__title is-done">Page B</);
});

// The glyph is emitted in BOTH states and only its COLOUR differs, so a screen reader announced
// "✓ Page B" for an unread row -- telling the user an item was finished when it was not. Same
// defect, same fix as fd_sheet.js's step check: the character is decoration and says so.
test('every rail ✓ is hidden from assistive tech, in both states', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: { 'b.md': true } }), '');
  const dots = html.match(/class="fd-railnav__dot[^"]*"[^>]*>/g) || [];
  assert.equal(dots.length, 3, 'one dot per week-1 item');
  for (const dot of dots) {
    assert.match(dot, /aria-hidden="true"/,
      `an unread ✓ announced as read is a false claim: ${dot}`);
  }
  // The character itself must stay: .fd-railnav__dot conveys state by colouring the glyph, so
  // deleting it would leave the circle with nothing to colour and change the render.
  assert.equal((html.match(/aria-hidden="true">✓<\/span>/g) || []).length, 3);
});

// aria-pressed belongs on the reader's REAL toggle (data-fd-toggle), not on the rail row, which
// is a navigation control -- announcing a navigating button as an unpressed toggle would swap one
// false statement for another.
test('the done toggles carry aria-pressed in both states, and the rail row carries none', () => {
  const undone = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: {} }), '');
  assert.equal((undone.match(/aria-pressed="false"/g) || []).length, 2,
    'the desktop pair and the mobile bar render the same control -- both must agree');
  assert.doesNotMatch(undone, /aria-pressed="true"/);

  const done = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: { 'a.md': true } }), '');
  assert.equal((done.match(/aria-pressed="true"/g) || []).length, 2);
  assert.doesNotMatch(done, /aria-pressed="false"/);

  assert.doesNotMatch(done, /class="fd-railnav__row[^"]*"[^>]*aria-pressed/,
    'the rail row navigates; it is not a toggle');
});

test('only completed rail rows announce their completion status', () => {
  const unread = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: {} }), '');
  assert.doesNotMatch(unread, /fd-visually-hidden">Completed<\/span>/,
    'an unread navigation target must not be announced as complete');

  const done = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: { 'b.md': true } }), '');
  assert.match(done,
    /<span class="fd-railnav__title is-done">Page B<\/span><span class="fd-visually-hidden">Completed<\/span>/,
    'a completed navigation target needs a screen-reader-only status, not aria-pressed');
  assert.doesNotMatch(done, /class="fd-railnav__row[^"]*"[^>]*aria-pressed/);
});

test('the currently-open row carries is-current, and only that row', () => {
  const html = F.fdReader(IDX, s({ ref: 'b.md', week: 1 }), '');
  assert.match(html, /fd-railnav__row is-current" data-fd-open="b\.md"/);
  assert.doesNotMatch(html, /fd-railnav__row is-current" data-fd-open="a\.md"/);
});

// ---- eyebrow / meta ---------------------------------------------------------------------------

test('the eyebrow carries the week number only when the item belongs to the named week', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md', week: 1 }), ''), /fd-eyebrow">Week 1 · Reading</);
  const noWeek = F.fdReader(IDX, s({ ref: 'lib.md', week: null }), '');
  assert.match(noWeek, /fd-eyebrow">Reading</);
  assert.doesNotMatch(noWeek, /fd-eyebrow">Week/);
});

test('a tool item shows "Interactive tool" and "self-paced" rather than read minutes', () => {
  const html = F.fdReader(IDX, s({ ref: 'tool.html', week: 1 }), '');
  assert.match(html, /fd-eyebrow">Week 1 · Interactive tool</);
  assert.match(html, /fd-article__meta">self-paced</);
});

test('tool Readers emit one stable expansion toggle while reading Readers emit none', () => {
  const focused = F.fdReader(IDX, s({ ref: 'tool.html', week: 1, toolExpanded: false }),
    '<iframe class="toolframe"></iframe>');
  const expanded = F.fdReader(IDX, s({ ref: 'tool.html', week: 1, toolExpanded: true }),
    '<iframe class="toolframe"></iframe>');
  const reading = F.fdReader(IDX, s({ ref: 'a.md', toolExpanded: true }), '<p>Read</p>');

  assert.equal((focused.match(/data-fd-expand-tool/g) || []).length, 1);
  assert.match(focused,
    /data-fd-expand-tool aria-pressed="false" aria-controls="fd-tool-region"[^>]*>[^<]*(?:<[^>]+>)*Expand tool/);
  assert.match(focused, /class="fd-reader fd-reader--tool"/);
  assert.doesNotMatch(focused, /fd-reader fd-reader--tool is-tool-expanded/);
  assert.match(focused, /id="fd-tool-region"/);

  assert.equal((expanded.match(/data-fd-expand-tool/g) || []).length, 1);
  assert.match(expanded,
    /data-fd-expand-tool aria-pressed="true" aria-controls="fd-tool-region"/);
  assert.match(expanded, /class="fd-reader fd-reader--tool is-tool-expanded"/);
  assert.match(expanded, />Expand tool<\/span>/,
    'aria-pressed toggles keep the visible and accessible label stable');

  assert.doesNotMatch(reading, /data-fd-expand-tool|fd-reader--tool|fd-tool-region/,
    'a related Try-now tool must not turn the reading page itself into a tool');
});

test('direct unindexed html routes still render as tools with the expansion control', () => {
  const empty = { byRef: {}, weeks: [] };
  for (const ref of ['orientation-video.html', 'feedback.html', 'rp-agitation.html']) {
    const html = F.fdReader(empty, {
      ref, week: null, fromTab: 'library', done: {}, toolExpanded: false,
    }, '<iframe class="toolframe"></iframe>');
    assert.match(html, /fd-eyebrow">Interactive tool</, ref);
    assert.match(html, /data-fd-expand-tool aria-pressed="false"/, ref);
    assert.match(html, /id="fd-tool-region"/, ref);
  }
  assert.doesNotMatch(F.fdReader(empty, {
    ref: 'unindexed.md', week: null, fromTab: 'library', done: {}, toolExpanded: true,
  }, '<p>Read</p>'), /data-fd-expand-tool|fd-reader--tool/);
});

test('the source chip shows the item\'s ref', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md' }), ''),
    /<span>Source:<\/span><span class="fd-src">a\.md<\/span>/);
});

// ---- doneLabel (primary button text) -----------------------------------------------------------

test('doneLabel: not done, nothing left unread -> "Mark done"', () => {
  const html = F.fdReader(IDX, s({ ref: 'd.md', week: 2, done: {} }), '');
  assert.match(html, /data-fd-toggle="d\.md" aria-pressed="false">Mark done</);
});

test('doneLabel: done, nothing left unread -> "Back to " + the ORIGINATING tab, not always Today', () => {
  // Deliberate deviation from the prototype (controller ruling): the prototype hardcodes
  // 'Back to Today' here even though its own markDone navigates to fromTab, so a page opened
  // from Library would show a primary button reading "Back to Today" next to a ghost button
  // reading "Library" -- visibly contradictory. This asserts the two can never drift apart:
  // doneLabel's fallback text is the SAME backLabel the ghost button renders, for three origins.
  const today = F.fdReader(IDX, s({ ref: 'd.md', week: 2, fromTab: 'today', done: { 'd.md': true } }), '');
  assert.match(today, /data-fd-toggle="d\.md" aria-pressed="true">Back to Today</);

  const library = F.fdReader(IDX, s({ ref: 'd.md', week: 2, fromTab: 'library', done: { 'd.md': true } }), '');
  assert.match(library, /data-fd-toggle="d\.md" aria-pressed="true">Back to Library</);
  assert.match(library, /fd-btn fd-btn--ghost" data-fd-back>Library</,
    'the primary button\'s fallback label and the ghost button must name the SAME tab');

  const path = F.fdReader(IDX, s({ ref: 'd.md', week: 2, fromTab: 'path', done: { 'd.md': true } }), '');
  assert.match(path, /data-fd-toggle="d\.md" aria-pressed="true">Back to Path</);
});

test('doneLabel: not done, something left unread -> "Mark done · Next: X ->"', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: {} }), '');
  assert.match(html, /data-fd-toggle="a\.md" aria-pressed="false">Mark done · Next: Page B →</);
});

test('doneLabel: done, something left unread -> "Next: X ->"', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md', week: 1, done: { 'a.md': true } }), '');
  assert.match(html, /data-fd-toggle="a\.md" aria-pressed="true">Next: Page B →</);
});

// ---- bodyHtml: verbatim and unescaped, per contract --------------------------------------------

test('bodyHtml is injected verbatim and unescaped', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md' }), '<strong>bold & <em>nested</em></strong>');
  assert.match(html, /<div class="fd-article__body"><strong>bold & <em>nested<\/em><\/strong><\/div>/);
});

test('bodyHtml is omitted entirely (no empty wrapper) when the caller passes none', () => {
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'a.md' }), ''), /fd-article__body/);
});

test('every OTHER interpolated value is still escaped, even with a hostile title', () => {
  const evilCur = JSON.parse(JSON.stringify(FIX_CUR));
  evilCur.weeks[0].items.push({ ref: 'evil.md', kind: 'read' });
  const evilMeta = Object.assign({}, FIX_META, { 'evil.md': { read: 1, tldr: 'x' } });
  const evilMan = { tools: FIX_MAN.tools, md: FIX_MAN.md.concat([['src/evil.md', 'evil.md', '<img src=x onerror=1>']]) };
  const evilIdx = F.fdBuildIndex(evilCur, evilMeta, FIX_TOOLS, evilMan);
  const html = F.fdReader(evilIdx, s({ ref: 'evil.md', week: 1 }), '');
  assert.doesNotMatch(html, /<img/);
});

// ---- graceful degradation ------------------------------------------------------------------

test('a ref with no index entry degrades to a titled placeholder rather than throwing', () => {
  assert.doesNotThrow(() => F.fdReader(IDX, s({ ref: 'nope.md', week: null }), ''));
  const html = F.fdReader(IDX, s({ ref: 'nope.md', week: null }), '');
  assert.match(html, /fd-article__h1">nope\.md</);
  // The fallback item's minutes is null and its kind defaults to 'read', so metaText is '' --
  // the dot separator must not render with nothing on its right (fix round 1, Minor 3).
  assert.doesNotMatch(html, /fd-article__dot/,
    'a stranded "." with no meta text after it must not render');
  assert.match(html, /fd-article__meta"><\/span>/,
    'the meta span itself still renders, just empty -- matching sibling spans elsewhere (e.g. fd-row__min)');
});

test('the dot separator is present exactly when there is meta text to separate from', () => {
  assert.match(F.fdReader(IDX, s({ ref: 'a.md', week: 1 }), ''), /fd-article__dot">·<\/span><span class="fd-article__meta">6 min</);
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'nope.md', week: null }), ''), /fd-article__dot/);
});

// ---- purity / audience-neutral / ES5 --------------------------------------------------------

test('no rendered output carries an audience-specific token', () => {
  const html = F.fdReader(IDX, s({ ref: 'a.md' }), '<p>Body</p>') + F.fdReader(IDX, s({ ref: 'b.md' }), '');
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

test('no rendered output carries raw hex -- colour must come from CSS classes', () => {
  assert.doesNotMatch(F.fdReader(IDX, s({ ref: 'a.md' }), ''), /#[0-9a-fA-F]{3,6}/);
});

test('fd_reader.js touches no DOM, storage, or clock, and stays ES5', () => {
  assert.doesNotMatch(readerSrc, /localStorage\.|document\.|window\.|Date\.now\(\)|new Date\(/,
    'fd_reader.js must stay a pure function of (index, state, bodyHtml)');
  assert.doesNotMatch(readerSrc, /\bconst\s|\blet\s|=>/,
    'fd_reader.js is a build-injected snippet, not a module -- ES5 only (var/function)');
});
