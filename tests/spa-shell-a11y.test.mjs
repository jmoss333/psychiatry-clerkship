// Accessibility contract for the front-door shell.
//
// REWRITTEN, not repointed (Plan 3 Task 8). Every assertion in the previous version addressed a
// structure the swap deleted: #mobileTitle and the .mobile-chrome media query (the sidebar-era
// mobile bar), #mPath/#mLib (the Path/Library segmented toggle), and closeSheet() (the old sheet's
// close path). The shell they described no longer exists, so this file describes the one that
// does. What each old assertion protected is named against its successor below, so a reader can
// audit the swap rather than take it on trust:
//
//   old: a desktop route live region exists outside the mobile chrome
//   new: #routeStatus is the SINGLE live region at every width — the duplicate mobile title bar
//        it had to sit outside of is gone, so the finding it fixed cannot recur.
//   old: route renders announce the page and move focus to #content   (>=5 announceRoute calls)
//   new: the same, repointed — announceRoute() still lives in spa_index.html but its callers moved
//        to fd_wire.js's fdAnnounce(), which is 2 call sites covering all four route shapes.
//   old: the Path/Library segmented toggle exposes aria-pressed
//   new: the tab row is a LABELLED <nav> marking the active tab with aria-current="page" — a
//        stronger statement than aria-pressed, and the correct one for navigation.
//   old: the mobile media query hides the desktop route live region
//   new: nothing to hide (one region, one width). Replaced by the 44px hit-target pins, which is
//        the mobile-a11y contract that DOES apply to the new shell.
//   old: closeSheet only restores focus to the invoker when the sheet still owns focus
//   new: fdFocusAfterRender()/fdRestoreFocus() carry the same guard, plus dialog semantics and a
//        Tab trap the old sheet never had.
//
// Assertions are structural (string/regex over the shipped sources) except the Tab trap, whose
// decision function is pure and is executed for real. There is no DOM harness in the root suite —
// no jsdom, no vm — and adding one for this file alone would make it the odd one out among a dozen
// sibling suites that all pin structure this way.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// *** COUNT-BASED ASSERTIONS RUN ON COMMENT-STRIPPED SOURCE, ALWAYS. ***
// These modules are heavily commented, and their comments name the very functions being counted.
// A raw `(src.match(/announceRoute\(/g)||[]).length` reads 7 where there are 2 call sites, so the
// count says nothing about the code — and the failure mode is the dangerous direction: the number
// only ever goes UP, so a deleted call site is masked by the prose describing it. This plan has
// already shipped that bug twice (a boot comment naming clinical-warm.css satisfied the guard that
// was supposed to inject it; a comment reproducing a call inflated its own call-site count).
const REGEX_PRECEDERS = '(,=:[!&|?{};+-*%~^<>';
function stripJsComments(src) {
  let out = '';
  let i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2; continue;
    }
    if (c === '/' && (prev === '' || REGEX_PRECEDERS.includes(prev))) {
      let inClass = false;
      out += c; i++;
      while (i < n) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1]; i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '\n') break;
        else if (src[i] === '/' && !inClass) break;
        i++;
      }
      i++; prev = '/'; continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      out += c; i++;
      while (i < n && src[i] !== quote) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1]; i += 2; continue; }
        i++;
      }
      out += quote; i++; prev = quote; continue;
    }
    if (!/\s/.test(c)) prev = c;
    out += c; i++;
  }
  return out;
}

const shell = read('spa_index.html');
const wireSrc = stripJsComments(read('frontdoor/fd_wire.js'));
const shellModSrc = stripJsComments(read('frontdoor/fd_shell.js'));
const sheetSrc = stripJsComments(read('frontdoor/fd_sheet.js'));
const css = read('frontdoor/frontdoor.css');

// The stripper is load-bearing for four assertions below, and a stripper that silently ate too
// much would make all of them pass vacuously. Pin both directions on real code.
test('the comment stripper removes prose and keeps code (harness health)', () => {
  assert.ok(!/heavily commented/.test(wireSrc), 'sanity on this file\'s own idiom');
  assert.doesNotMatch(wireSrc, /SCOPE LINE|aria-modal promise/, 'block-comment prose must be gone');
  assert.match(wireSrc, /function fdTrapTab\(ev\)\{/, 'code must survive');
  assert.match(wireSrc, /FD_TABBABLE='a\[href\]/, 'string literals must survive intact');
  // A regex literal containing a quote is the case that breaks a naive stripper (it reads the
  // quote as a string opener and every subsequent quote is off by one from there on).
  assert.match(wireSrc, /\/\["\\\\\]\/\.test/, 'a quote-bearing regex literal must survive intact');
  assert.match(wireSrc, /\.replace\(\/\\\+\/g,' '\)/, 'and so must an ordinary one');
  assert.ok(wireSrc.length < read('frontdoor/fd_wire.js').length * 0.75,
    'fd_wire.js is more comment than code — a stripper that removed nothing would prove nothing');
});

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

// ---- landmarks ---------------------------------------------------------------------------

test('the shell has exactly one <main>, and every surface renders inside it', () => {
  // Anchored on the EMITTED form (a quote then the tag), never a bare `<main` — spa_index.html's
  // own comments describe the markup they emit, and counting those would inflate this.
  const opens = (shell.match(/'<main\b/g) || []).length;
  const closes = (shell.match(/'<\/main>'/g) || []).length;
  assert.equal(opens, 2, 'fdRender emits <main> on exactly two mutually exclusive branches (tool / not-tool)');
  assert.equal(closes, 1, 'and closes it once — the two opens are the arms of one ternary');
  // The arms differ only by a modifier class, so at most one <main> can ever be in the document.
  assert.match(shell, /openTool\?'<main class="fd-main fd-main--tool" id="fdMain">':'<main class="fd-main" id="fdMain">'/,
    'the two <main> spellings must remain the two arms of a single ternary, not two emissions');
  // The wizard branch renders no <main> at all and must not: it replaces the app, and a first-run
  // role picker with a main landmark but no header/nav reads as a page that lost its chrome.
  const wizardBranch = slice(shell, "if(wizard==='role'){", '} else {');
  assert.doesNotMatch(wizardBranch, /<main/);
});

test('#routeStatus is the single route live region, at every width', () => {
  assert.match(shell, /id="routeStatus"[^>]*aria-live="polite"/);
  assert.equal((shell.match(/aria-live=/g) || []).length, 1,
    'exactly one aria-live region in the shell — a second would double-announce every route');
  // The sidebar-era duplicate is gone and must not come back: #mobileTitle existed only to
  // announce on small screens, and the whole reason #routeStatus had to sit outside .mobile-chrome
  // was that display:none removed the mobile one from the accessibility tree.
  assert.doesNotMatch(shell, /id="mobileTitle"/);
  assert.doesNotMatch(shell, /mobile-chrome/);
});

test('route renders announce the page and move focus to #content', () => {
  assert.match(shell, /function announceRoute\(/);
  assert.match(shell, /contentEl\.focus\(\{preventScroll:true\}\)/,
    'the announcement must be paired with a focus move, or a screen reader hears it and stays put');
  // The CALLERS moved to fd_wire.js when Task 4 wired routing. Two of them, covering all four
  // route shapes: an open item (page, tool, or the Progress special) and a bare tab.
  const announce = slice(wireSrc, 'function fdAnnounce(st){', '\n}');
  assert.match(announce, /announceRoute\(fdRouteItem\(st\.openId\)\)/, 'open-item branch');
  assert.match(announce, /announceRoute\(\{f:'__tab__', t:fdReaderBackLabel\(st\.tab\)\}\)/, 'tab branch');
  assert.equal((wireSrc.match(/\bannounceRoute\(/g) || []).length, 2,
    'both branches, and no third caller announcing something that is not a route');
  // And it is actually reached: fdApply announces only when the route changed.
  assert.match(wireSrc, /if\(routed\)\{\s*\n\s*fdAnnounce\(next\);/,
    'fdApply must call fdAnnounce on a routed change');
});

test('the tab row is a labelled nav that marks the current tab with aria-current', () => {
  const tabs = slice(shellModSrc, 'function fdTabs(tab){', '\n}');
  assert.match(tabs, /<nav class="fd-tabs" aria-label="Sections">/,
    'an unlabelled <nav> is announced as just "navigation" — and the page ships a second one');
  assert.match(tabs, /\(active\?' aria-current="page"':''\)/,
    'the active tab, and only the active tab, carries aria-current="page"');
  assert.doesNotMatch(tabs, /aria-pressed/,
    'these are navigation controls, not toggles — aria-current is the right property');
});

// ---- the safety sheet: dialog semantics and the Tab trap, which ship together ----------------

test('.fd-sheet carries full dialog semantics in its MARKUP', () => {
  const panel = slice(sheetSrc, "return '<div class=\"fd-sheetbackdrop\"", '</aside>');
  assert.match(panel, /<aside class="fd-sheet" role="dialog" aria-modal="true" /);
  assert.match(panel, /aria-labelledby="'\+FD_SHEET_TITLE_ID\+'"/,
    'the panel is named by its own title, addressed by id');
  assert.match(panel, /tabindex="-1"/,
    'focusable by script so fdFocusSheet can land on the panel rather than its close button');
  // The title must actually carry that id, or aria-labelledby points at nothing and the dialog
  // announces as unnamed — which is worse than no role at all.
  assert.match(sheetSrc, /<span class="fd-sheet__title" id="'\+FD_SHEET_TITLE_ID\+'">/);
  // And the runtime duplicate is gone: fd_wire.js used to set tabindex on every focus.
  assert.doesNotMatch(wireSrc, /setAttribute\('tabindex', *'-1'\)/,
    'the panel tabindex belongs in the markup, not in a second runtime writer');
});

// *** THE HARD COUPLING. *** aria-modal="true" tells assistive tech the background is inert. With
// no Tab trap that is a lie the keyboard disproves immediately, and a lie is worse than the honest
// no-modal state the sheet shipped with through Task 4 — which is exactly why Task 4 added
// neither. This test is what makes removing one half without the other impossible.
test('aria-modal is backed by a real Tab trap, wired into the keydown listener', () => {
  assert.ok(sheetSrc.includes('aria-modal="true"'), 'precondition: the panel claims to be modal');
  assert.match(wireSrc, /function fdTrapIndex\(count, idx, shift, onPanel\)\{/);
  assert.match(wireSrc, /function fdTrapTab\(ev\)\{/);
  assert.match(wireSrc, /if\(key==='Tab'&&fdTrapTab\(ev\)\) return;/,
    'the trap must be wired into the keydown listener, not merely defined');
  // Before the typing bail: a guard that exists to stop "1" from switching tabs must not become
  // the hole the trap leaks out of.
  const listener = slice(wireSrc, "window.addEventListener('keydown'", "var panel=document.getElementById('fdSearch')");
  assert.ok(listener.indexOf("key==='Tab'") < listener.indexOf("if(typing&&key!=='Escape'"),
    'the Tab trap must run before the typing bail');
});

// The trap's DECISION is pure, so it is executed rather than described. `count` is how many
// tabbable elements the panel holds, `idx` where the active one sits among them (-1 when it is not
// one of them), `onPanel` whether the active element is the panel itself.
const T = new Function(`${wireSrc}\nreturn {fdTrapIndex:fdTrapIndex, FD_TRAP_PANEL:FD_TRAP_PANEL};`)();

test('fdTrapIndex wraps at both ends and never lets focus out of the panel', () => {
  const { fdTrapIndex, FD_TRAP_PANEL } = T;
  // Interior moves are the browser's job — intercepting them would break nothing but would also
  // do nothing, and a trap that preventDefaults every Tab is how focus order gets silently rewritten.
  assert.equal(fdTrapIndex(4, 1, false, false), null, 'forward from the middle: do not intercept');
  assert.equal(fdTrapIndex(4, 2, true, false), null, 'backward from the middle: do not intercept');
  // The two ends.
  assert.equal(fdTrapIndex(4, 3, false, false), 0, 'forward off the last control wraps to the first');
  assert.equal(fdTrapIndex(4, 0, true, false), 3, 'backward off the first wraps to the last');
  // The panel itself. Forward is already correct (it precedes its children in document order);
  // backward would step out of the dialog into the page behind it, which aria-modal forbids.
  assert.equal(fdTrapIndex(4, -1, false, true), null, 'forward off the panel: the browser is right');
  assert.equal(fdTrapIndex(4, -1, true, true), 3, 'backward off the panel wraps to the last control');
  // Focus somewhere outside the panel entirely (a click on the background, a stale reference).
  assert.equal(fdTrapIndex(4, -1, false, false), 0, 'pull an escaped focus back to the first control');
  assert.equal(fdTrapIndex(4, -1, true, false), 3, 'and to the last one when shifted');
  // A panel with nothing tabbable in it still holds focus rather than releasing it.
  assert.equal(fdTrapIndex(0, -1, false, true), FD_TRAP_PANEL);
  assert.equal(fdTrapIndex(0, -1, true, false), FD_TRAP_PANEL);
  // One control: every Tab is both ends at once, so it must land back on itself, not escape.
  assert.equal(fdTrapIndex(1, 0, false, false), 0);
  assert.equal(fdTrapIndex(1, 0, true, false), 0);
});

test('the tabbable query excludes the panel itself and anything script-only', () => {
  assert.match(wireSrc, /var FD_TABBABLE='a\[href\],button:not\(\[disabled\]\)/);
  assert.match(wireSrc, /\[tabindex\]:not\(\[tabindex="-1"\]\)/,
    'tabindex="-1" is precisely the marker for script-focusable-but-not-tabbable — and it is what '
    + 'the panel itself carries, so including it would make the panel a stop in its own cycle');
  const tabbables = slice(wireSrc, 'function fdTrapTabbables(panel){', '\n}');
  assert.match(tabbables, /offsetParent!==null/,
    'hidden controls must be skipped or they become dead stops in the cycle');
});

test('closing the sheet restores focus to the invoker only when the sheet still owns focus', () => {
  const after = slice(wireSrc, 'function fdFocusAfterRender(', '\n}');
  assert.match(after, /if\(!sheetNow&&sheetWas\)\{[\s\S]*?fdRestoreFocus\(inv, wasInSheet\);/,
    'the close branch must pass whether focus was inside the sheet, not restore unconditionally');
  const restore = slice(wireSrc, 'function fdRestoreFocus(', '\n}');
  assert.match(restore, /if\(!owned\)/,
    'a route change that already moved focus to #content must win over the invoker restore');
});

// ---- mobile hit targets -----------------------------------------------------------------------
// Selector matching is by EXACT membership in the comma-split selector list, and the assertion is
// on the DECLARATION, never on the selector text alone. Both are deliberate: a prefix regex like
// /\.fd-tab\{[^}]*44px/ is satisfied by any rule whose selector merely STARTS with .fd-tab
// (.fd-tabs, .fd-tab.is-active), which is the decoy-sibling failure this plan has already shipped
// once and had to fix in Task 2.
function mobileBlock() {
  const start = css.indexOf('@media (max-width:999px){');
  assert.ok(start > -1, 'the mobile media query must exist to anchor this scan');
  // Brace-count to the block's own close, so a later @media cannot be read as part of it.
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(start, i); }
  }
  throw new Error('unterminated @media block');
}

function ruleBodiesFor(block, selector) {
  // Comments come out FIRST, whole. Stripping them per comma-separated fragment (the obvious
  // shortcut) fails on any comment containing a comma: the fragments each hold half an unbalanced
  // /* */, nothing is stripped, and the selector that follows the comment silently stops matching.
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const bodies = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (selectors.includes(selector)) bodies.push(m[2]);
  }
  return bodies;
}

test('mobile primary actions all meet the 44px minimum hit target', () => {
  const block = mobileBlock();
  // One row per control a learner taps to do the primary thing on that surface.
  const oneDimension = ['.fd-btn--primary', '.fd-safetybtn', '.fd-weekpill', '.fd-searchbtn',
    '.fd-weekgrid__browse', '.fd-role', '.fd-weektile', '.fd-kitrow', '.fd-step', '.fd-pick',
    '.fd-setupcta', '.fd-quiz__o', '.fd-cta', '.fd-tab', '.fd-capturebtn'];
  for (const sel of oneDimension) {
    const bodies = ruleBodiesFor(block, sel);
    assert.ok(bodies.length >= 1, `${sel} has no rule of its own inside the mobile media query`);
    assert.ok(bodies.some((b) => /min-height:44px/.test(b)),
      `${sel} must declare min-height:44px on mobile`);
  }
  // The two square controls need BOTH axes — a min-height alone leaves them 32px wide.
  for (const sel of ['.fd-themebtn', '.fd-sheet__close']) {
    const body = ruleBodiesFor(block, sel).join(';');
    assert.match(body, /(min-)?width:44px/, `${sel} must be 44px on its narrow axis too`);
    assert.match(body, /(min-)?height:44px/, `${sel} must be 44px tall`);
  }
});

test('the hit-target scan cannot be satisfied by a decoy sibling selector', () => {
  // .fd-tabs and .fd-tab.is-active both share the ".fd-tab" prefix; neither may stand in for it.
  const block = mobileBlock();
  assert.deepEqual(ruleBodiesFor(block, '.fd-tab').length >= 1, true, 'precondition');
  assert.deepEqual(ruleBodiesFor(block, '.fd-tabs'), [],
    'sanity: .fd-tabs has no mobile rule, so matching it would be a false pass');
  const fake = '@media (max-width:999px){.fd-tabbed-decoy{min-height:44px}}';
  assert.deepEqual(ruleBodiesFor(fake, '.fd-tab'), [],
    'exact selector membership: a rule merely starting with .fd-tab must not satisfy .fd-tab');
});
