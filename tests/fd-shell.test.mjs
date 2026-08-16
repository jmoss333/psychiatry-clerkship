// The keyboard map is the part worth testing hardest: it is pure decision logic with six
// interacting conditions, and every one of its branches is a real usability bug when wrong
// (typing "1" in the search box must not switch tabs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_shell.js')}
  return { fdHeader: fdHeader, fdTabs: fdTabs, fdSetupRole: fdSetupRole,
           fdSetupWeek: fdSetupWeek, fdKeyAction: fdKeyAction };
`);
const F = make();

const OPTS = { typing: false, screen: 'app', searchOpen: false, sheetOpen: false, reading: false };
const o = (over) => Object.assign({}, OPTS, over);

// ---- keyboard map ----------------------------------------------------------------

test('slash and cmd-k open search', () => {
  assert.deepEqual(F.fdKeyAction('/', o()), { type: 'search' });
  assert.deepEqual(F.fdKeyAction('k', o({ meta: true })), { type: 'search' });
});

test('no shortcut fires while typing in an input', () => {
  for (const k of ['/', '1', '2', '3', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(F.fdKeyAction(k, o({ typing: true })), null, `${k} fired while typing`);
  }
});

test('escape closes search first, then the sheet', () => {
  assert.deepEqual(F.fdKeyAction('Escape', o({ searchOpen: true, sheetOpen: true })), { type: 'close' });
  assert.deepEqual(F.fdKeyAction('Escape', o({ sheetOpen: true })), { type: 'close' });
  assert.equal(F.fdKeyAction('Escape', o()), null, 'escape with nothing open does nothing');
});

test('1/2/3 switch tabs only when nothing is layered above the page', () => {
  assert.deepEqual(F.fdKeyAction('1', o()), { type: 'tab', tab: 'today' });
  assert.deepEqual(F.fdKeyAction('2', o()), { type: 'tab', tab: 'path' });
  assert.deepEqual(F.fdKeyAction('3', o()), { type: 'tab', tab: 'library' });
  assert.equal(F.fdKeyAction('1', o({ searchOpen: true })), null);
  assert.equal(F.fdKeyAction('1', o({ sheetOpen: true })), null);
});

test('arrows move between items only while reading', () => {
  assert.deepEqual(F.fdKeyAction('ArrowLeft', o({ reading: true })), { type: 'nav', dir: -1 });
  assert.deepEqual(F.fdKeyAction('ArrowRight', o({ reading: true })), { type: 'nav', dir: 1 });
  assert.equal(F.fdKeyAction('ArrowLeft', o()), null, 'arrows do nothing outside the reader');
});

// This is deliberate, not an oversight: '/' and cmd-k are checked BEFORE the overlay guard that
// blocks arrows and 1/2/3, so they keep working even when a surface is already layered above the
// page. Global search has to stay reachable from anywhere -- that's the point of a ⌘K shortcut --
// and escape (tested above) is what unwinds search before the sheet. Pinned here so nobody
// "fixes" the ordering into a bug later.
test('search stays reachable over an open sheet', () => {
  assert.deepEqual(F.fdKeyAction('/', o({ sheetOpen: true })), { type: 'search' });
  assert.deepEqual(F.fdKeyAction('k', o({ sheetOpen: true, meta: true })), { type: 'search' });
});

test('search stays reachable when search is already open', () => {
  assert.deepEqual(F.fdKeyAction('/', o({ searchOpen: true })), { type: 'search' });
  assert.deepEqual(F.fdKeyAction('k', o({ searchOpen: true, meta: true })), { type: 'search' });
});

test('arrows and number keys stay suppressed by an open overlay even while reading', () => {
  const overlays = [{ searchOpen: true }, { sheetOpen: true }];
  for (const overlay of overlays) {
    const opts = o(Object.assign({ reading: true }, overlay));
    for (const k of ['ArrowLeft', 'ArrowRight', '1', '2', '3']) {
      assert.equal(F.fdKeyAction(k, opts), null, `${k} fired over an open overlay while reading`);
    }
  }
});

test('no shortcut fires during first-run setup except nothing at all', () => {
  for (const k of ['/', '1', 'ArrowLeft']) {
    assert.equal(F.fdKeyAction(k, o({ screen: 'setup' })), null, `${k} fired during setup`);
  }
});

// ---- renderers -------------------------------------------------------------------

test('the active tab is marked for both CSS and assistive tech', () => {
  const html = F.fdTabs('path');
  assert.match(html, /class="[^"]*fd-tab[^"]*is-active[^"]*"[^>]*data-fd-tab="path"/);
  assert.match(html, /aria-current="page"/);
  assert.equal((html.match(/is-active/g) || []).length, 1, 'exactly one tab is active');
});

test('the header renders the safety button and the week pill', () => {
  const html = F.fdHeader({ week: 4 });
  assert.match(html, /data-fd-safety/);
  assert.match(html, /Week 4/);
});

// The attribution is the ONE rebranded string in fd_shell.js, so it is excluded from the
// audience-neutrality scan rather than the scan being weakened. Everything else in the header
// still has to pass — strip only the attribution's own element and re-scan the remainder, so a
// leak anywhere else (including a second attribution-shaped span someone adds later) still fails.
const stripAttrib = (html) => html.replace(/<span class="fd-attrib">[^<]*<\/span>/, '');

test('the header says exam, never the site-specific word', () => {
  assert.doesNotMatch(stripAttrib(F.fdHeader({ week: 6 })), /MS3|clerkship|student|shelf|resident/i);
});

test('stripping the attribution does not hide a leak elsewhere in the header', () => {
  // Guards the exclusion above: if stripAttrib ever over-matched (e.g. a greedy regex eating the
  // rest of the bar), this scan would go quiet. Assert it removes exactly one element and leaves
  // the surrounding markup intact.
  const html = F.fdHeader({ week: 6 });
  const stripped = stripAttrib(html);
  assert.equal(html.length - stripped.length,
    '<span class="fd-attrib">MS3 Clerkship · Joshua Moss, MD</span>'.length,
    'stripAttrib must remove the attribution element and nothing else');
  assert.match(stripped, /class="fd-brand__name"/);
  assert.match(stripped, /data-fd-safety/);
});

test('the header carries the attribution the deleted sidebar used to', () => {
  const html = F.fdHeader({ week: 4 });
  assert.match(html, /<span class="fd-attrib">MS3 Clerkship · Joshua Moss, MD<\/span>/,
    'the attribution restores the sidebar byline verbatim; resident_section.py rebrands it '
    + 'through a needle anchored on class="fd-attrib", so a reword here must be mirrored there '
    + 'or the resident build aborts');
});

// ---- the rebrand contract behind the attribution ------------------------------------
// resident_section.py used to carry a BARE 'MS3 Clerkship' needle, which caught any shell literal
// containing that phrase. Task 3 replaced it with three anchored needles (the attribution, the
// <title>, and pageTitle()'s fallback) because the three now need different replacement text — but
// that swap traded a catch-all for a fixed list, and tests/shell-copy.test.mjs only scans
// extractShellCopy()'s curated set. So a NEW shell literal carrying 'MS3 Clerkship' would ship
// unrebranded to the resident site with every gate green. These two tests are the compensating
// check fd_shell.js's own comment asks for.
const SHELL_JS = read('frontdoor/fd_shell.js');
const RESIDENT_PY = read('resident_section.py');
const SPA_HTML = read('spa_index.html');

test('the attribution has a rebrand needle, anchored on its own class', () => {
  const emitted = (SHELL_JS.match(/<span class="fd-attrib">[^<]*<\/span>/) || [])[0];
  assert.ok(emitted, 'fd_shell.js must emit the attribution');
  assert.ok(RESIDENT_PY.includes(`'${emitted}'`),
    `resident_section.py must carry a RESIDENT_REBRAND needle for exactly ${emitted} — without it `
    + 'the resident site silently ships this site\'s attribution. Reword one, reword both.');
  assert.match(RESIDENT_PY, /Resident Rotation · Sanford BHU · Joshua Moss, MD/,
    'and the resident replacement must still name the resident site');
});

test('every shell literal carrying "MS3 Clerkship" has a needle covering it', () => {
  // The bare needle is gone, so this count IS the safety net: three sites in the shell sources,
  // three needles. A fourth literal added without a needle moves one number and not the other.
  const sites = (SPA_HTML.match(/MS3 Clerkship/g) || []).length
    + (SHELL_JS.match(/MS3 Clerkship/g) || []).length;
  // Scoped to the RESIDENT_REBRAND list itself. resident_section.py carries a SECOND, unrelated
  // rebrand list for tools/learning-path.html which has its own 'MS3 Clerkship · Joshua Moss, MD'
  // needle — counting the whole file would credit the shell with a needle that never touches it.
  const listStart = RESIDENT_PY.indexOf('RESIDENT_REBRAND=[');
  assert.ok(listStart !== -1, 'RESIDENT_REBRAND list not found');
  const list = RESIDENT_PY.slice(listStart, RESIDENT_PY.indexOf('\n]', listStart));
  const needles = (list.match(/^\s*\(r?['"][^\n]*MS3 Clerkship/gm) || []).length;
  assert.equal(sites, 3, 'shell sources carry exactly three "MS3 Clerkship" literals');
  assert.equal(needles, sites,
    'each must have its own anchored RESIDENT_REBRAND needle — the bare catch-all needle was '
    + 'removed in Task 3 because the three sites need different replacement text');
});

test('the attribution is a sibling of the brand button, not inside it', () => {
  // Two reasons, both load-bearing: text inside the <button> would be folded into the home
  // button's accessible name, and a two-line brand would grow .fd-header past the height
  // .fd-rail/.fd-railnav's top:106px sticky offset assumes.
  const html = F.fdHeader({ week: 4 });
  const brandEnd = html.indexOf('</button>');
  const attribAt = html.indexOf('class="fd-attrib"');
  assert.ok(brandEnd !== -1 && attribAt !== -1);
  assert.ok(attribAt > brandEnd,
    'the attribution must come after the brand button closes, never nested inside it');
});

// The theme toggle is the one header control with no prototype counterpart. It is here because
// cw_theme/data-theme is inherited by all 21 clinical tools through clinical-warm.css and the old
// toggle lived in the deleted sidebar — a header that renders without it strands dark-mode users.
test('the header carries a theme toggle the delegated handler can reach', () => {
  assert.match(F.fdHeader({ week: 4 }), /class="fd-themebtn"[^>]*data-fd-theme/);
});

// The toggle uses the ARIA toggle model: a STABLE accessible name for the thing, with the state in
// aria-pressed. It previously carried both aria-pressed and a state-dependent label, which the
// WAI-ARIA APG treats as alternatives — a screen reader read "Switch to light mode, toggle button,
// pressed", the label naming the action and the state naming the value, as opposites. These tests
// pin the model itself, not just the strings, so the pairing cannot come back.
test('the theme toggle carries state in aria-pressed, and only there', () => {
  const light = F.fdHeader({ week: 4, theme: 'light' });
  const dark = F.fdHeader({ week: 4, theme: 'dark' });
  assert.match(light, /aria-pressed="false"/);
  assert.match(dark, /aria-pressed="true"/);
});

test('the theme toggle name is stable across themes — never an action label', () => {
  const nameOf = (html) => (html.match(/class="fd-themebtn"[^>]*aria-label="([^"]*)"/) || [])[1];
  const light = nameOf(F.fdHeader({ week: 4, theme: 'light' }));
  const dark = nameOf(F.fdHeader({ week: 4, theme: 'dark' }));
  assert.equal(light, dark,
    'a name that changes with state contradicts aria-pressed — pick one model, not both');
  assert.equal(light, 'Dark mode');
  for (const html of [F.fdHeader({ week: 4, theme: 'light' }), F.fdHeader({ week: 4, theme: 'dark' })]) {
    assert.doesNotMatch(html, /aria-label="Switch to/,
      'an action-shaped label ("Switch to …") is the action model; this control uses the toggle model');
  }
});

test('the theme toggle glyph is stable too — the state is not carried by the icon', () => {
  // A moon flipping to a sun is the visual form of the same contradiction: a sun reads "go to
  // light" while the button announces "Dark mode, pressed". frontdoor.css's
  // [aria-pressed="true"] rule is what shows a sighted user which way the toggle sits.
  const glyphOf = (html) => (html.match(/class="fd-themebtn"[^>]*>([^<]*)</) || [])[1];
  assert.equal(glyphOf(F.fdHeader({ week: 4, theme: 'light' })),
    glyphOf(F.fdHeader({ week: 4, theme: 'dark' })));
});

test('an absent theme renders an operable, not-pressed toggle rather than nothing', () => {
  // fdHeader is called before any caller has resolved data-theme on a cold boot.
  const html = F.fdHeader({ week: 4 });
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Dark mode"/);
});

test('role and week choices are addressable by the delegated click handler', () => {
  const roles = F.fdSetupRole([{ id: 'ms3', name: 'Student', desc: 'd', hint: 'most common' }]);
  assert.match(roles, /data-fd-role="ms3"/);
  const weeks = F.fdSetupWeek([{ n: 1, title: 'Foundations', theme: 't' }], 'Student');
  assert.match(weeks, /data-fd-week="1"/);
  assert.match(weeks, /data-fd-week="0"/, 'the browse option must be addressable too');
});

test('user-supplied text is escaped in every renderer', () => {
  const evil = '<img src=x onerror=1>';
  assert.doesNotMatch(F.fdSetupRole([{ id: 'x', name: evil, desc: evil, hint: '' }]), /<img/);
  assert.doesNotMatch(F.fdSetupWeek([{ n: 1, title: evil, theme: evil }], evil), /<img/);
});
