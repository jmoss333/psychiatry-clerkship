// Wiring contract for the front door (Plan 3, Task 4).
//
// fd_wire.js is the ONE impure module in frontdoor/: it owns the listeners, history, and the
// stores. Two functions inside it carry all the logic worth pinning, and both are pure by
// construction so they can be tested directly rather than through a synthesised DOM:
//
//   fdResolveState(url, stored) -- what state a URL and a stored blob imply. This is spec §2.1's
//     precedence rule, and getting it backwards is invisible in a browser (the page still
//     renders -- just not the page the link named).
//   fdDispatch(target, state)   -- what a clicked element's data-fd-* attributes mean. `target`
//     is a plain DESCRIPTOR, not an Element: the listener reads the attributes off the DOM and
//     hands this function a bag of strings, which is what keeps the decision logic testable.
//
// The descriptor's three `in*` flags are the DOM-context half of the contract. They exist
// because three attributes are deliberately reused across surfaces rather than duplicated
// (the modules say so in their own comments), so the surface is what disambiguates them:
//   data-fd-safety -- Today's kit card vs the sheet's own kit rows (inSheet)
//   data-fd-toggle -- a list row's checkbox vs the reader's Mark-done button (inReader)
//   data-fd-week   -- the first-run wizard's tiles vs Path's timeline rows (inSetup)
// The first of those is flagged in the plan's attribute table as the one a handler gets wrong;
// it is silent when wrong (the "‹ kit" back affordance simply never renders).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const wireSrc = read('frontdoor/fd_wire.js');

// fd_wire.js references browser globals INSIDE functions only, so it evaluates standalone;
// nothing here calls the impure half. fd_sheet.js is concatenated for one reason: it owns
// FD_SHEET_ITEM_PREFIX, and fdDispatch builds the item-sheet key from that same constant rather
// than from a second copy of the literal that could drift out of step with the parser.
// eslint-disable-next-line no-new-func
const F = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_sheet.js')}
  ${wireSrc}
  return { fdResolveState: fdResolveState, fdDispatch: fdDispatch, fdKeyPatch: fdKeyPatch,
           fdNormTab: fdNormTab, prefix: FD_SHEET_ITEM_PREFIX };
`)();

// A whole-page harness for the keyboard leg: fdKeyAction lives in fd_shell.js and its result is
// what fdKeyPatch consumes, so the mapping is asserted across the real seam, not against a
// hand-written fixture of what fdKeyAction "probably" returns.
// eslint-disable-next-line no-new-func
const K = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_shell.js')}
  ${wireSrc}
  return { fdKeyAction: fdKeyAction, fdKeyPatch: fdKeyPatch };
`)();

// ---- fdResolveState: URL-first precedence (spec §2.1) --------------------------------------

const STORED = { role: 'student', tab: 'library', openId: 'stored.md', fromTab: 'library' };

test('a deep link overrides stored state -- a shared link opens what it names', () => {
  const st = F.fdResolveState('https://x.test/?page=collateral_workflow.md', STORED);
  assert.equal(st.openId, 'collateral_workflow.md',
    'the URL names a page; the device\'s last-open page must not win over it');
});

test('?tool= is a deep link too', () => {
  const st = F.fdResolveState('https://x.test/?tool=mse.html', STORED);
  assert.equal(st.openId, 'mse.html');
});

test('extra tool params do not confuse the ref', () => {
  // communicationHref()/familyAction() ship ?tool=x.html&case=y&resume=1 -- the ref is the
  // tool value alone, and the rest rides along in the URL (toolExtraFromParams' job).
  const st = F.fdResolveState('https://x.test/?tool=comm.html&case=alex&resume=1', {});
  assert.equal(st.openId, 'comm.html');
});

test('a bare URL restores the stored route', () => {
  const st = F.fdResolveState('https://x.test/', STORED);
  assert.equal(st.openId, 'stored.md', 'a returning student with no query resumes where they were');
  assert.equal(st.tab, 'library');
});

test('a bare URL with nothing stored lands on Today', () => {
  const st = F.fdResolveState('https://x.test/', {});
  assert.equal(st.tab, 'today');
  assert.equal(st.openId, '');
  assert.equal(st.role, '');
});

test('?tab= wins over the stored tab', () => {
  const st = F.fdResolveState('https://x.test/?tab=path', { tab: 'library' });
  assert.equal(st.tab, 'path');
});

test('a URL that names a TAB does not restore a stored reader over it', () => {
  // The whole point of the precedence rule: a link to ?tab=library must show the Library, not
  // the article this device happened to have open. Without this branch the recipient of a
  // shared tab link lands in someone else's reading pane.
  const st = F.fdResolveState('https://x.test/?tab=library', STORED);
  assert.equal(st.tab, 'library');
  assert.equal(st.openId, '', 'the link named a tab, so no stored page may be layered over it');
});

test('an unrecognised tab in the URL falls back rather than rendering nothing', () => {
  const st = F.fdResolveState('https://x.test/?tab=nonsense', {});
  assert.equal(st.tab, 'today');
});

test('an unrecognised stored tab falls back too', () => {
  assert.equal(F.fdResolveState('https://x.test/', { tab: 'progress' }).tab, 'today');
});

test('non-routed fields come from storage untouched', () => {
  const st = F.fdResolveState('https://x.test/?page=a.md',
    { role: 'subi', viewWeek: 4, fromTab: 'path', scrollPos: { 'a.md': 120 } });
  assert.equal(st.role, 'subi');
  assert.equal(st.viewWeek, 4);
  assert.equal(st.fromTab, 'path');
  assert.deepEqual(st.scrollPos, { 'a.md': 120 });
});

test('fdResolveState reads a bare query string, not just an absolute URL', () => {
  // popstate and the boot both hand it location.href, but the unit under test must not depend
  // on a parseable origin -- that is what lets it stay pure (no `new URL(...)`, no location).
  assert.equal(F.fdResolveState('?page=a.md', {}).openId, 'a.md');
  assert.equal(F.fdResolveState('/index.html?tab=path#frag', {}).tab, 'path');
});

test('percent-encoded refs survive the round trip', () => {
  assert.equal(F.fdResolveState('?page=a%20b.md', {}).openId, 'a b.md');
});

// ---- fdDispatch: the three disjoint open behaviours -----------------------------------------

const APP = { role: 'student', tab: 'today', openId: '', fromTab: 'today', week: 2, setup: '' };
const t = (over) => Object.assign({
  open: null, sheet: false, safety: null, toggle: null, tab: null, week: null,
  setweek: null, role: null, step: null, back: false, home: false, search: false,
  changeWeek: false, closeSheet: false, closeSearch: false, closeNudge: false,
  inSheet: false, inReader: false, inSetup: false,
}, over);

test('data-fd-open ALONE navigates', () => {
  const p = F.fdDispatch(t({ open: 'a.md' }), APP);
  assert.equal(p.openId, 'a.md');
  assert.equal(p.sheet, null, 'navigating closes any sheet behind it');
  assert.ok(!('sheetFrom' in p) || p.sheetFrom === null);
});

test('data-fd-open + a bare data-fd-sheet opens a PREVIEW SHEET and does not navigate', () => {
  // fd_search.js's result rows and fd_reader.js's "Try it now" both carry the modifier, and
  // both promise in their own copy that the page underneath stays put.
  const p = F.fdDispatch(t({ open: 'mse.html', sheet: true }), APP);
  assert.equal(p.sheet, 'item:mse.html');
  assert.equal(p.openId, undefined, 'the page underneath must not change');
});

test('data-fd-safety opens a PROTOCOL, which is neither of the other two', () => {
  const p = F.fdDispatch(t({ safety: 'pg_suicide.md' }), APP);
  assert.equal(p.sheet, 'pg_suicide.md');
  assert.equal(p.openId, undefined);
});

test('a bare data-fd-safety opens the kit', () => {
  const p = F.fdDispatch(t({ safety: '' }), APP);
  assert.equal(p.sheet, 'kit');
  assert.equal(p.sheetFrom, null);
});

// ---- the flagged ambiguity: one attribute, two emitters -------------------------------------

test('data-fd-safety inside the sheet\'s own kit list yields sheetFrom:"kit"', () => {
  const p = F.fdDispatch(t({ safety: 'pg_suicide.md', inSheet: true }), APP);
  assert.equal(p.sheet, 'pg_suicide.md');
  assert.equal(p.sheetFrom, 'kit',
    'fd_sheet.js renders the "‹ kit" back button only when sheetFrom==="kit" -- get this wrong '
    + 'and the affordance silently never appears');
});

test('the SAME attribute on Today\'s kit card does not', () => {
  const p = F.fdDispatch(t({ safety: 'pg_suicide.md', inSheet: false }), APP);
  assert.equal(p.sheetFrom, null,
    'a protocol opened from the Today rail has no kit to go back to -- a "‹ kit" button there '
    + 'would send the student somewhere they never were');
});

test('a protocol search hit behaves like the kit card, not like the kit row', () => {
  // fd_search.js reuses fdKitCard's payload verbatim for protocol results; those rows live in
  // the search overlay, not the sheet, so they must not claim a kit origin either.
  assert.equal(F.fdDispatch(t({ safety: 'pg_suicide.md' }), APP).sheetFrom, null);
});

test('the sheet\'s own back button is the BARE form and clears the origin', () => {
  const p = F.fdDispatch(t({ safety: '', inSheet: true }), APP);
  assert.equal(p.sheet, 'kit');
  assert.equal(p.sheetFrom, null, 'the kit list itself has nothing to go back to');
});

// ---- data-fd-toggle: list row vs the reader's primary button --------------------------------

test('data-fd-toggle in a list row is a plain toggle', () => {
  const p = F.fdDispatch(t({ toggle: 'a.md' }), APP);
  assert.equal(p.toggle, 'a.md');
  assert.equal(p.fromReader, false);
});

test('data-fd-toggle inside the reader\'s action bar asks for the auto-advance path', () => {
  // fd_reader.js reuses data-fd-toggle deliberately and says so: the wiring layer is expected to
  // notice the click came from .fd-article__actions / .fd-actionbar rather than a row.
  const p = F.fdDispatch(t({ toggle: 'a.md', inReader: true }), APP);
  assert.equal(p.fromReader, true);
});

// ---- data-fd-week: three meanings, disambiguated by surface ---------------------------------

test('a week tile in the first-run wizard adopts the rotation week', () => {
  const p = F.fdDispatch(t({ week: '3', inSetup: true }), { role: 'student', setup: 'week' });
  assert.equal(p.setWeek, 3);
  assert.equal(p.tab, 'today');
  assert.equal(p.setup, '', 'the wizard closes');
});

test('the wizard\'s browse tile sets no week and lands on Library', () => {
  const p = F.fdDispatch(t({ week: '0', inSetup: true }), { role: 'student', setup: 'week' });
  assert.equal(p.setWeek, null, 'null clears the rotation date; a number would set one');
  assert.equal(p.tab, 'library');
  assert.equal(p.setup, '');
});

test('the SAME attribute on Path\'s timeline only changes which week is being VIEWED', () => {
  const p = F.fdDispatch(t({ week: '5' }), APP);
  assert.deepEqual(p, { viewWeek: 5 },
    'browsing ahead on Path must never quietly move the student\'s real rotation week');
});

test('data-fd-tab + data-fd-week together is the Continue card\'s next-week preview', () => {
  const p = F.fdDispatch(t({ tab: 'path', week: '3' }), APP);
  assert.equal(p.tab, 'path');
  assert.equal(p.viewWeek, 3);
  assert.equal(p.setWeek, undefined, 'previewing next week is not adopting it');
});

test('data-fd-setweek is the explicit "Set as my week" action', () => {
  const p = F.fdDispatch(t({ setweek: '4' }), APP);
  assert.equal(p.setWeek, 4);
  assert.equal(p.viewWeek, 4);
  assert.equal(p.tab, 'today');
});

// ---- the rest of the attribute table --------------------------------------------------------

test('data-fd-tab switches tab and leaves the reader', () => {
  const p = F.fdDispatch(t({ tab: 'library' }), Object.assign({}, APP, { openId: 'a.md' }));
  assert.equal(p.tab, 'library');
  assert.equal(p.openId, '');
});

test('an unknown tab value is normalised rather than rendered', () => {
  assert.equal(F.fdDispatch(t({ tab: 'progress' }), APP).tab, 'today');
});

test('data-fd-role advances the wizard to step 2', () => {
  const p = F.fdDispatch(t({ role: 'subi' }), { role: '', setup: '' });
  assert.equal(p.role, 'subi');
  assert.equal(p.setup, 'week');
});

test('data-fd-step toggles one protocol step without touching the persisted progress map', () => {
  const p = F.fdDispatch(t({ step: '2' }), { stepsDone: { 0: true } });
  assert.deepEqual(p.stepsDone, { 0: true, 2: true });
  assert.equal(p.toggle, undefined, 'step checks are session-only and are NOT item progress');
});

test('data-fd-step un-toggles, and does not mutate the state it was handed', () => {
  const state = { stepsDone: { 1: true } };
  const p = F.fdDispatch(t({ step: '1' }), state);
  assert.equal(p.stepsDone[1], false);
  assert.equal(state.stepsDone[1], true, 'fdDispatch is pure -- it may not mutate its argument');
});

test('data-fd-back in the reader returns to the originating tab', () => {
  const p = F.fdDispatch(t({ back: true }), Object.assign({}, APP, { openId: 'a.md', fromTab: 'library' }));
  assert.equal(p.openId, '');
  assert.equal(p.tab, 'library');
});

test('data-fd-back in the wizard steps back to the role question', () => {
  const p = F.fdDispatch(t({ back: true, inSetup: true }), { role: 'student', setup: 'week' });
  assert.equal(p.setup, 'role');
});

test('data-fd-back in the wizard returns to the app when the week is already set', () => {
  // Reached from the header week pill by a student who is already set up: "back" means "never
  // mind", not "start the wizard over".
  const p = F.fdDispatch(t({ back: true, inSetup: true }), { role: 'student', week: 2, setup: 'week' });
  assert.equal(p.setup, '');
});

test('data-fd-home returns to Today', () => {
  const p = F.fdDispatch(t({ home: true }), Object.assign({}, APP, { tab: 'library', openId: 'a.md' }));
  assert.equal(p.tab, 'today');
  assert.equal(p.openId, '');
});

test('data-fd-search opens the overlay with an empty query', () => {
  assert.deepEqual(F.fdDispatch(t({ search: true }), APP), { searchOpen: true, query: '' });
});

test('data-fd-change-week reopens step 2 of the wizard', () => {
  assert.deepEqual(F.fdDispatch(t({ changeWeek: true }), APP), { setup: 'week' });
});

test('the close attributes each close exactly their own layer', () => {
  assert.deepEqual(F.fdDispatch(t({ closeNudge: true }), APP), { nudgeRef: '' });
  assert.deepEqual(F.fdDispatch(t({ closeSearch: true }), APP), { searchOpen: false, query: '' });
  const sheet = F.fdDispatch(t({ closeSheet: true }), APP);
  assert.equal(sheet.sheet, null);
  assert.deepEqual(sheet.stepsDone, {}, 'step checks reset per open (spec §5)');
});

test('an element carrying no known attribute produces no patch', () => {
  assert.equal(F.fdDispatch(t({}), APP), null);
  assert.equal(F.fdDispatch(null, APP), null);
});

test('fromTab records where the reader was opened FROM, and survives reading onward', () => {
  const fromLibrary = F.fdDispatch(t({ open: 'a.md' }), Object.assign({}, APP, { tab: 'library' }));
  assert.equal(fromLibrary.fromTab, 'library', 'opened from Library -> back says Library');
  const onward = F.fdDispatch(t({ open: 'b.md' }),
    Object.assign({}, APP, { tab: 'library', openId: 'a.md', fromTab: 'library' }));
  assert.equal(onward.fromTab, 'library',
    'prev/next inside the reader must not rewrite the origin to the tab behind it');
});

// ---- keyboard: fdKeyAction's result maps to the same patches --------------------------------

const KOPTS = { typing: false, screen: 'app', searchOpen: false, sheetOpen: false, reading: false };

test('1/2/3 produce the same tab patch a tab click does', () => {
  const act = K.fdKeyAction('2', KOPTS);
  assert.deepEqual(act, { type: 'tab', tab: 'path' });
  const p = K.fdKeyPatch(act, APP);
  assert.equal(p.tab, 'path');
  assert.equal(p.openId, '');
});

test('slash produces the same patch the search button does', () => {
  const p = K.fdKeyPatch(K.fdKeyAction('/', KOPTS), APP);
  assert.deepEqual(p, { searchOpen: true, query: '' });
});

test('escape unwinds search before the sheet', () => {
  const both = { searchOpen: true, sheet: 'kit' };
  const first = K.fdKeyPatch(K.fdKeyAction('Escape', Object.assign({}, KOPTS, { searchOpen: true, sheetOpen: true })), both);
  assert.equal(first.searchOpen, false);
  assert.equal(first.sheet, undefined, 'the sheet stays open behind the closing search panel');
  const second = K.fdKeyPatch(K.fdKeyAction('Escape', Object.assign({}, KOPTS, { sheetOpen: true })), { sheet: 'kit' });
  assert.equal(second.sheet, null);
});

test('escape with nothing open is a no-op all the way through', () => {
  assert.equal(K.fdKeyPatch(K.fdKeyAction('Escape', KOPTS), APP), null);
});

test('arrows become a navDir intent, resolved against the week list by the impure layer', () => {
  const p = K.fdKeyPatch(K.fdKeyAction('ArrowRight', Object.assign({}, KOPTS, { reading: true })), APP);
  assert.deepEqual(p, { navDir: 1 });
  assert.deepEqual(K.fdKeyPatch(K.fdKeyAction('ArrowLeft', Object.assign({}, KOPTS, { reading: true })), APP),
    { navDir: -1 });
});

test('no key does anything while typing', () => {
  for (const k of ['/', '1', 'ArrowLeft']) {
    assert.equal(K.fdKeyPatch(K.fdKeyAction(k, Object.assign({}, KOPTS, { typing: true })), APP), null);
  }
});

// ---- source contract -------------------------------------------------------------------------

test('fd_wire.js stays ES5 -- it is a build-injected snippet, not a module', () => {
  assert.doesNotMatch(wireSrc, /\bconst\s|\blet\s|=>/,
    'inject_shared_snippets() pastes this body into spa_index.html; var/function only');
  assert.doesNotMatch(wireSrc, /\bimport\s|\bexport\s/, 'snippets have no module boundary');
});

test('the pure region touches no DOM, no storage, and no clock', () => {
  // fd_wire.js is the one module that is ALLOWED to be impure -- which is exactly why the pure
  // half is fenced and scanned. Everything the unit tests above rely on lives inside the fence.
  const a = wireSrc.indexOf('/* ---- pure ---- */');
  const b = wireSrc.indexOf('/* ---- end pure ---- */');
  assert.ok(a !== -1 && b > a, 'the pure region must be fenced by its marker pair');
  const pure = wireSrc.slice(a, b);
  assert.doesNotMatch(pure, /localStorage|document\.|window\.|location\b|Date\.now\(|new Date\(/,
    'fdResolveState/fdDispatch/fdKeyPatch are testable only because they read nothing ambient');
});

test('every attribute in the plan\'s contract table is in the click selector', () => {
  // A missing entry in the selector is a control that silently does nothing: fdDispatch would
  // handle it correctly and never be called.
  for (const attr of ['data-fd-open', 'data-fd-safety', 'data-fd-toggle', 'data-fd-tab',
                      'data-fd-week', 'data-fd-setweek', 'data-fd-role', 'data-fd-step',
                      'data-fd-back', 'data-fd-home', 'data-fd-search', 'data-fd-change-week',
                      'data-fd-close-sheet', 'data-fd-close-search', 'data-fd-close-nudge']) {
    assert.ok(wireSrc.indexOf('[' + attr + ']') !== -1,
      `${attr} is emitted by a frontdoor module but no listener selector matches it`);
  }
});

test('fdApply writes the route BEFORE it re-renders, and computes it from the patch', () => {
  // Regression guard for a defect found by driving the built page, not by any unit test here.
  // fdCurrentState() resolves the address bar first (spec §2.1), so recomposing state to decide
  // "did the route change?" asks a URL that has not been updated yet -- and a stale ?tab=library
  // out-ranks both the patch and the storage write that just landed. Every tab switch away from
  // a routed tab became a silent no-op: nothing threw, the click just did nothing.
  const a = wireSrc.indexOf('function fdApply(');
  const b = wireSrc.indexOf('\n}', a);
  assert.ok(a !== -1 && b > a, 'fdApply must be findable');
  const body = wireSrc.slice(a, b);
  const route = body.indexOf('fdRoute(next');
  const render = body.indexOf('fdRerender()');
  assert.ok(route !== -1, 'the next route must be built from the patch (fdRoute(next, ...))');
  assert.ok(route < render, 'history has to land before the re-render that reads it back');
  assert.ok(body.indexOf('fdCurrentState()', route) === -1,
    'nothing may recompose state between the patch and the route -- that is the defect');
});

test('the storage keys fd_wire.js writes are cw_*-namespaced literals', () => {
  // check-static-site.mjs hard-fails a non-cw_/rp_ key in index.html, and counts COMPUTED keys
  // against a ceiling pinned in qa-baseline.json -- so every key written here is a literal.
  const keys = [...wireSrc.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(['"])([^'"]+)\1/g)]
    .map((m) => m[2]);
  // Without this the loop below is vacuous the moment the writes move or are renamed: zero
  // matches passes every assertion inside it.
  assert.ok(keys.length >= 2,
    `expected the rotation-week read/write to be found; matched ${keys.length}`);
  for (const k of keys) assert.ok(/^cw_/.test(k), `non-namespaced storage key: ${k}`);
  const computed = [...wireSrc.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(?!['"])/g)];
  assert.equal(computed.length, 0, 'a computed key moves a soft ceiling pinned in qa-baseline.json');
});

// ---- the DOM half of the contract ------------------------------------------------------------
// Everything above injects `inSheet` / `inReader` / `inSetup` directly, which is what makes the
// decision logic testable -- and also what leaves the OTHER half of the mechanism unchecked. The
// three FD_SEL_* literals are the join between fdDispatch and the markup, and a class rename in
// an emitting module (CLASS-INVENTORY is still being edited by Tasks 5-7) would sever it in
// exactly the way the plan warns about: no throw, no log, the "‹ kit" affordance simply stops
// rendering. These scans are the cheapest thing that goes red for that.

const emitters = [
  ['FD_SEL_SHEET', '.fd-sheet', 'frontdoor/fd_sheet.js', 'class="fd-sheet"',
    'kit rows inside the sheet must be distinguishable from Today\'s kit cards'],
  ['FD_SEL_READER_ACTIONS', '.fd-article__actions', 'frontdoor/fd_reader.js', 'class="fd-article__actions"',
    'the reader\'s primary button must be distinguishable from a list row check'],
  ['FD_SEL_READER_ACTIONS', '.fd-actionbar', 'frontdoor/fd_reader.js', 'class="fd-actionbar"',
    'the mobile action bar carries the same data-fd-toggle as the desktop pair'],
  ['FD_SEL_SETUP', '.fd-setup', 'frontdoor/fd_shell.js', 'class="fd-setup"',
    'a wizard week tile must be distinguishable from a Path timeline row'],
];

for (const [name, selector, module, markup, why] of emitters) {
  test(`${selector} (${name}) is still emitted by ${module}`, () => {
    assert.ok(wireSrc.includes(`'${selector}'`) || wireSrc.includes(`${selector},`)
      || wireSrc.includes(`,${selector}`),
      `${name} must still contain ${selector} -- fdWireTarget matches on it`);
    assert.ok(read(module).includes(markup),
      `${module} no longer emits ${markup}, so fdWireTarget's ${selector} test can never be true `
      + `again: ${why}`);
  });
}

test('the sheet panel fd_wire focuses is the same element it discriminates on', () => {
  // fdFocusSheet() and the inSheet discrimination must not drift onto two different elements:
  // focusing a container that is not the one kit rows live in would restore the a11y behaviour
  // while silently breaking the kit origin, or the reverse.
  const focus = wireSrc.match(/function fdFocusSheet\(announce\)\{[\s\S]*?\n\}/);
  assert.ok(focus, 'fdFocusSheet must be findable');
  assert.match(focus[0], /FD_SEL_SHEET/,
    'fdFocusSheet must resolve the panel through FD_SEL_SHEET, not a second literal');
});

// ---- transient reset --------------------------------------------------------------------------

test('fdResetTransient clears every key FD_TRANSIENT declares', () => {
  // popstate's first version reset a hand-listed subset and omitted `setup`, so Back left the
  // full-viewport wizard sitting over a page that had already changed underneath it. The reset is
  // still hand-written, so this is what keeps a newly added field from falling out of it.
  const decl = wireSrc.match(/var FD_TRANSIENT=\{([\s\S]*?)\};/);
  assert.ok(decl, 'FD_TRANSIENT declaration must be findable');
  const keys = [...decl[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  assert.ok(keys.length >= 7, `expected the transient fields; matched ${keys.length}`);
  const reset = wireSrc.match(/function fdResetTransient\(\)\{[\s\S]*?\n\}/);
  assert.ok(reset, 'fdResetTransient must be findable');
  for (const k of keys) {
    assert.ok(reset[0].includes(`FD_TRANSIENT.${k}=`),
      `fdResetTransient does not reset ${k} -- a surface that outlives a Back press`);
  }
});

test('popstate resets the transients through that one function', () => {
  const pop = wireSrc.slice(wireSrc.indexOf("addEventListener('popstate'"));
  assert.match(pop, /fdResetTransient\(\)/,
    'popstate must not reset a hand-picked subset inline -- that is how `setup` was missed');
});

// ---- focus management -------------------------------------------------------------------------

test('opening the sheet moves focus into it and announces it', () => {
  const fn = wireSrc.match(/function fdFocusSheet\(announce\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn, /\.focus\(\)/, 'focus must actually move -- fdMount drops it to <body>');
  assert.match(fn, /fdSay\(/, 'and the change must reach the live region');
  assert.match(fn, /fd-sheet__title/,
    'the announcement names the panel that opened, taken from what is on screen');
});

test('the announcement channel is the live region, not announceRoute', () => {
  // announceRoute also moves focus to #content, so calling it for a sheet would fight the focus
  // move. fdSay writes the same aria-live element without touching focus.
  const fn = wireSrc.match(/function fdSay\(text\)\{[\s\S]*?\n\}/);
  assert.ok(fn, 'fdSay must exist');
  assert.match(fn[0], /routeStatus/, 'the shell already owns exactly one aria-live channel');
  assert.doesNotMatch(fn[0], /focus\(/, 'announcing must not move focus');
});

test('closing restores focus only when the closing surface still owned it', () => {
  // The house shape the deleted shell's closeSheet() used and spa-shell-a11y pinned: a student
  // who has since clicked into the page behind must not be yanked back.
  const fn = wireSrc.match(/function fdRestoreFocus\(inv, owned\)\{[\s\S]*?\n\}/);
  assert.ok(fn, 'fdRestoreFocus must be findable');
  assert.match(fn[0], /if\(!owned\) return;/, 'the ownership guard is the whole point');
  assert.match(fn[0], /isConnected/, 'and the invoker must still be in the document');
  assert.match(fn[0], /offsetParent!==null/, 'and visible -- the reader renders two of some controls');
  assert.match(fn[0], /getElementById\('content'\)/,
    'focus must land somewhere a keyboard can continue from, never on <body>');
});

test('focus ownership is read BEFORE the re-render, not after', () => {
  // After fdRerender the surface is already gone, so asking then always answers "no" and the
  // restore silently never fires.
  const a = wireSrc.indexOf('function fdApply(');
  const body = wireSrc.slice(a, wireSrc.indexOf('\n}', a));
  const read0 = body.indexOf('wasInSheet=');
  const render = body.indexOf('fdRerender()');
  assert.ok(read0 !== -1 && read0 < render,
    'wasInSheet has to be computed before the render that destroys the sheet');
});

test('a re-render puts focus back on the control that was just activated', () => {
  // Ticking a checkbox or a protocol step rebuilds #content or the sheet wholesale, so without
  // this a keyboard user loses their place on every single tick.
  const fn = wireSrc.match(/function fdRestoreActivated\(key\)\{[\s\S]*?\n\}/);
  assert.ok(fn, 'fdRestoreActivated must be findable');
  assert.match(fn[0], /fdFocusLost\(\)/, 'it must not steal focus that has already landed somewhere');
  assert.match(fn[0], /fdFindVisible\(/, 'and must resolve the twin, not the detached original');
  assert.match(wireSrc.match(/function fdFindVisible\(key\)\{[\s\S]*?\n\}/)[0], /offsetParent!==null/,
    'the reader emits the same data-fd-toggle twice; the hidden twin must not win');
});

test('an invoker is stored as a resolvable key, not just an element reference', () => {
  // #content is replaced wholesale on every render, so the header button that opened a sheet is
  // a detached node by the time the sheet closes. Storing the element alone restored focus to
  // nothing and silently fell through to #content on every close -- which is what the browser
  // walkthrough showed before this.
  assert.match(wireSrc, /FD_LAST_INVOKER=\{ el: el, key: fdFocusKey\(el\) \}/,
    'the click listener must record both halves');
  const restore = wireSrc.match(/function fdRestoreFocus\(inv, owned\)\{[\s\S]*?\n\}/)[0];
  assert.match(restore, /fdFindVisible\(i\.key\)/, 'and the restore must fall back to the twin');
});

test('a bare data-fd-safety key does not also match Today\'s kit cards', () => {
  // The header Safety button carries the attribute bare; kit cards carry a ref. A key of
  // `[data-fd-safety]` matches both and document order decides -- an accident that would send
  // focus to a different control than the one the student pressed.
  const fn = wireSrc.match(/function fdFocusKey\(el\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn, /'\['\+names\[i\]\+'="'\+v\+'"\]'/,
    'the value is always written out, so an empty one is matched exactly');
});

test('a keyboard-opened surface has no invoker to restore to', () => {
  const keydown = wireSrc.slice(wireSrc.indexOf("addEventListener('keydown'"));
  assert.match(keydown.slice(0, 600), /FD_LAST_INVOKER=null/,
    'otherwise closing a cmd-K search would jump focus to whatever was last clicked');
});

test('re-opening an already-open search does not wipe what has been typed', () => {
  assert.deepEqual(F.fdKeyPatch({ type: 'search' }, { searchOpen: true }), { searchOpen: true },
    'cmd-K with focus outside the box used to reset the query to empty');
  assert.deepEqual(F.fdKeyPatch({ type: 'search' }, { searchOpen: false }),
    { searchOpen: true, query: '' }, 'a fresh open still starts empty');
});
