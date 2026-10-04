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
           fdSetupWeek: fdSetupWeek, fdKeyAction: fdKeyAction,
           fdThemeMode: fdThemeMode, fdThemeAttr: fdThemeAttr,
           fdAppMode: fdAppMode, fdDockModel: fdDockModel, fdDock: fdDock };
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

test('1/2/3/4 switch tabs only when nothing is layered above the page', () => {
  assert.deepEqual(F.fdKeyAction('1', o()), { type: 'tab', tab: 'today' });
  assert.deepEqual(F.fdKeyAction('2', o()), { type: 'tab', tab: 'path' });
  assert.deepEqual(F.fdKeyAction('3', o()), { type: 'tab', tab: 'library' });
  assert.deepEqual(F.fdKeyAction('4', o()), { type: 'tab', tab: 'care' });
  assert.equal(F.fdKeyAction('1', o({ searchOpen: true })), null);
  assert.equal(F.fdKeyAction('1', o({ sheetOpen: true })), null);
});

test('APP keyboard shortcuts follow the two visible destinations', () => {
  assert.deepEqual(F.fdKeyAction('1', o({ appMode: true })), { type: 'tab', tab: 'today' });
  assert.deepEqual(F.fdKeyAction('2', o({ appMode: true })), { type: 'tab', tab: 'library' });
  assert.deepEqual(F.fdKeyAction('3', o({ appMode: true })), { type: 'tab', tab: 'care' });
  assert.equal(F.fdKeyAction('4', o({ appMode: true })), null);
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

test('responsive tab labels render once even before navigation CSS loads', () => {
  const html = F.fdTabs('care');
  const visibleTextWithoutCss = html.replace(/<[^>]+>/g, ' ');
  assert.match(html, /class="[^"]*fd-tab--care[^"]*is-active[^"]*"[^>]*data-fd-tab="care"/);
  assert.match(html, /aria-label="Patient care resources"/);
  assert.match(html, /fd-tab__label" data-compact="Care">Patient care resources<\/span>/);
  assert.match(html, /data-fd-tab="library">Library<\/button>/);
  assert.equal((visibleTextWithoutCss.match(/Library/g) || []).length, 1);
  assert.equal((visibleTextWithoutCss.match(/Patient care resources/g) || []).length, 1);
  assert.ok(html.indexOf('data-fd-tab="care"') > html.indexOf('data-fd-tab="library"'));
});

test('both Library views share one selected app destination', () => {
  for (const app of [false, true]) for (const view of ['essentials', 'full']) {
    const html = F.fdTabs('library', app, view);
    assert.match(html, /class="fd-tab is-active" data-fd-tab="library"[^>]*aria-current="page">Library/);
    assert.doesNotMatch(html, /data-fd-tab="everything"/);
    assert.equal((html.match(/is-active/g) || []).length, 1);
  }
});

// One-thread redesign, Phase 1 (owner decision D4, 2026-10-04): the week pill left the header. The
// week is changed from Today ("Change week"), Path ("Set as my week") and first-run setup, never
// from a control that sits on every screen. These two tests pin the ABSENCE as hard as the old
// ones pinned the presence: a header that grows a week control again fails here.
test('the header renders the safety button and no week control at any week', () => {
  for (const week of [4, undefined, null]) {
    const html = F.fdHeader({ week });
    assert.match(html, /data-fd-safety/);
    assert.doesNotMatch(html, /data-fd-change-week|Set week|Week \d|▾/, `week ${week}: no week pill`);
  }
});

test('the header carries "＋ Ask a question" as a standing capture opener, before Safety', () => {
  const html = F.fdHeader({ week: 4, tab: 'today' });
  const ask = html.indexOf('data-capture-open');
  const safety = html.indexOf('data-fd-safety', ask);
  const settings = html.indexOf('data-fd-settings', safety);
  assert.ok(ask > -1 && safety > ask && settings > safety,
    'Ask, Safety and Settings must keep their visual and keyboard order');
  assert.match(html, /class="fd-askbtn" data-capture-open="" aria-haspopup="dialog" aria-expanded="false">＋ Ask a question<\/button>/);
  // The old phone-only Care shortcut is gone: Care is a tab above 640px and a dock slot below it.
  assert.doesNotMatch(html, /fd-carebtn|aria-label="Patient care resources"[^>]*>Care</);
  assert.equal((html.match(/data-fd-tab="care"/g) || []).length, 1, 'Care appears once, in the tab row');
});

test('the search affordance keeps one accessible name across the phone and desktop spellings', () => {
  const html = F.fdHeader({ week: 2 });
  assert.match(html, /class="fd-searchbtn__long">Search a symptom, drug, or task…<\/span>/);
  assert.match(html, /class="fd-searchbtn__short" aria-hidden="true">Search<\/span>/);
  assert.equal((html.match(/data-fd-search/g) || []).length, 1, 'one search opener in the header');
});

test('the APP header replaces rotation chrome with an On shift workspace', () => {
  const html = F.fdHeader({ roleId: 'app', tab: 'today' });
  assert.match(html, /data-fd-tab="today"[^>]*>On shift</);
  assert.match(html, /data-fd-tab="library"[^>]*>Library</);
  assert.match(html, /data-fd-tab="care"/);
  assert.doesNotMatch(html, /data-fd-tab="path"|data-fd-change-week|Set week|Week \d/);
  assert.match(html, /class="fd-weekpill[^>]*>APP</);
});

test('a transient APP invitation gets APP chrome without replacing the learner identity', () => {
  const state = { roleId: 'resident', appInvite: true, tab: 'today' };
  assert.equal(F.fdAppMode(state), true);
  const html = F.fdHeader(state);
  assert.match(html, /data-fd-tab="today"[^>]*>On shift</);
  assert.doesNotMatch(html, /data-fd-tab="path"|data-fd-change-week/);
  assert.equal(state.roleId, 'resident');
});

// Supersedes 'the compact header theme toggle has an explicit accessible name': that test pinned
// the exact themebtn markup, and the theme control is no longer a header button at all. The
// accessible-name requirement it guarded is carried by the aria-label assertion here.
test('the header offers settings, not a bare theme toggle', () => {
  const h = F.fdHeader({ week: 3, tab: 'today' });
  assert.match(h, /data-fd-settings/, 'gear must be present');
  assert.doesNotMatch(h, /data-fd-theme/, 'theme moved inside the panel');
  assert.match(h, /aria-label="Settings"/);
});

// ---- the phone dock: five FIXED slots (one-thread redesign, Phase 1, 2026-10-04) ------------------
// Today · Path · Library · Care · ＋ Ask, the same four destinations as the tab row in the same
// order, plus the capture opener. Nothing in it mirrors the page's primary action any more, and
// the Browse <details> that duplicated Essentials / Everything / Search is gone. The tests below
// pin that a dock given a dockAction, or any other state, still renders exactly these slots.
test('the dock carries the four tab destinations in tab order, then ＋ Ask', () => {
  const standard = F.fdDockModel({ tab: 'today', appMode: false });
  assert.deepEqual(standard.items.map((x) => x.label), ['Today', 'Path', 'Library', 'Care', '＋ Ask']);
  assert.deepEqual(standard.items.map((x) => x.value), ['today', 'path', 'library', 'care', '']);
  assert.deepEqual(standard.items.map((x) => x.attr),
    ['data-fd-tab', 'data-fd-tab', 'data-fd-tab', 'data-fd-tab', 'data-capture-open']);
  // Same labels and order as the tab row's four destinations.
  const tabs = [...F.fdTabs('today').matchAll(/data-fd-tab="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(standard.items.slice(0, 4).map((x) => x.value), tabs);
});

test('APP gets four fixed slots: no Path, and Library only once', () => {
  const app = F.fdDockModel({ tab: 'today', appMode: true });
  assert.deepEqual(app.items.map((x) => x.label), ['On shift', 'Library', 'Care', '＋ Ask']);
  assert.equal(app.items.some((x) => x.value === 'path'), false);
  assert.equal(app.items.filter((x) => x.value === 'library').length, 1);
  assert.match(F.fdDock({ appMode: true }), /^<nav class="fd-dock fd-dock--four" aria-label="Learning actions">/);
});

test('the dock has no context slot, no Browse disclosure and no forwarding, whatever the state says', () => {
  for (const state of [
    {},
    { dockAction: { label: '<Continue>', sourceId: 'action&one' } },
    { appMode: false, tab: 'library', openId: 'a.md' },
  ]) {
    const html = F.fdDock(state);
    assert.match(html, /^<nav class="fd-dock" aria-label="Learning actions">/);
    assert.equal((html.match(/<button\b/g) || []).length, 5, JSON.stringify(state));
    assert.equal((html.match(/<details\b/g) || []).length, 0);
    assert.doesNotMatch(html, /fd-dock__item--context|fd-dock__browse|data-fd-dock-forward|data-fd-dock-browse-go|Continue|Essential/);
    assert.doesNotMatch(html, /data-fd-search/, 'Search is reached from the sticky header, never a dock slot');
  }
});

test('every dock slot is a plain button; Care carries its full name and ＋ Ask its dialog state', () => {
  const html = F.fdDock({ appMode: false });
  assert.match(html, /<button type="button" class="fd-dock__item" data-fd-tab="today">Today<\/button>/);
  assert.match(html, /<button type="button" class="fd-dock__item" data-fd-tab="path">Path<\/button>/);
  assert.match(html, /<button type="button" class="fd-dock__item" data-fd-tab="library">Library<\/button>/);
  assert.match(html, /<button type="button" class="fd-dock__item" data-fd-tab="care" aria-label="Patient care resources">Care<\/button>/);
  assert.match(html, /<button type="button" class="fd-dock__item" data-capture-open="" aria-haspopup="dialog" aria-expanded="false">＋ Ask<\/button><\/nav>$/);
});

test('the header carries three standing controls: Ask, Safety, Settings', () => {
  // Scoped to the actions container's own markup: everything after the marker also carries the
  // tab buttons fdHeader appends, which otherwise makes the count say nothing.
  const actions = F.fdHeader({ week: 3, tab: 'today' })
    .split('fd-header__actions')[1].split('</div>')[0];
  const buttons = actions.match(/<button/g) || [];
  assert.equal(buttons.length, 3, 'Ask a question, safety, settings');
  assert.doesNotMatch(actions, /fd-weekpill|fd-carebtn/);
  // APP adds its identity chip -- a span, not a control.
  const app = F.fdHeader({ roleId: 'app', tab: 'today' }).split('fd-header__actions')[1].split('</div>')[0];
  assert.equal((app.match(/<button/g) || []).length, 3);
  assert.match(app, /<span class="fd-weekpill fd-weekpill--identity">APP<\/span>/);
});

test('the header says exam, never the site-specific word', () => {
  assert.doesNotMatch(F.fdHeader({ week: 6 }), /MS3|clerkship|student|shelf|resident/i);
});

test('role and week choices are addressable by the delegated click handler', () => {
  const roles = F.fdSetupRole([{ id: 'ms3', name: 'Student', desc: 'd', hint: 'most common' }]);
  assert.match(roles, /data-fd-role="ms3"/);
  const weeks = F.fdSetupWeek({ path: { id: 'fixture', weekCount: 1 }, weeks: [{ n: 1, title: 'Foundations', theme: 't', focusCategories: [] }] }, 'Student');
  assert.match(weeks, /data-fd-week="1"/);
  assert.match(weeks, /data-fd-week="0"/, 'the browse option must be addressable too');
});

test('missing projected path data shows the standard accessible fallback instead of an empty setup grid', () => {
  const html = F.fdSetupWeek({ path: { id: '', weekCount: 0 }, weeks: [] }, 'Student');
  assert.match(html, /class="fd-fallback"[^>]*data-fd-fallback="setup"[^>]*role="alert"/);
  assert.match(html, /This section could not load\. Try reloading, or use another tab\./);
  assert.doesNotMatch(html, /fd-weekgrid|data-fd-week="0"/);
});

test('user-supplied text is escaped in every renderer', () => {
  const evil = '<img src=x onerror=1>';
  assert.doesNotMatch(F.fdSetupRole([{ id: 'x', name: evil, desc: evil, hint: '' }]), /<img/);
  assert.doesNotMatch(F.fdSetupWeek([{ n: 1, title: evil, theme: evil }], evil), /<img/);
});

// ---- theme modes -----------------------------------------------------------------

test('stored mode round-trips; anything else is system', () => {
  assert.equal(F.fdThemeMode('light'), 'light');
  assert.equal(F.fdThemeMode('dark'), 'dark');
  assert.equal(F.fdThemeMode('system'), 'system');
  assert.equal(F.fdThemeMode(null), 'system', 'unset means system, not light');
  assert.equal(F.fdThemeMode(''), 'system');
  assert.equal(F.fdThemeMode('banana'), 'system');
});

test('explicit modes ignore the OS; system follows it', () => {
  assert.equal(F.fdThemeAttr('light', true), 'light', 'explicit light wins over a dark OS');
  assert.equal(F.fdThemeAttr('dark', false), 'dark');
  assert.equal(F.fdThemeAttr('system', true), 'dark');
  assert.equal(F.fdThemeAttr('system', false), 'light');
});

// ---- Phase 3 (F4): the header holds with no role (a guest deep link) --------------------------
test('the header renders for a guest with no role, without leaking an undefined into copy', () => {
  for (const state of [{}, { tab: 'today' }, { tab: 'library', week: undefined }]) {
    const html = F.fdHeader(state);
    assert.match(html, /data-fd-safety/, 'safety stays reachable');
    assert.match(html, /fd-askbtn/, 'the capture opener still renders');
    assert.doesNotMatch(html, /undefined|null/, JSON.stringify(state));
  }
});

test('week setup no longer points at a top-bar control it does not have', () => {
  const weeks = F.fdSetupWeek({ path: { id: 'fixture', weekCount: 1 }, weeks: [{ n: 1, title: 'Foundations', theme: 't', focusCategories: [] }] }, 'Student');
  assert.doesNotMatch(weeks, /top bar/);
  assert.match(weeks, /Change it anytime from Today or Path\./);
});
