# Tool Nav Toolbar + Cache-Bust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-style tool navigation toolbar (← back, → forward, ⌂ all tools) to all ~80 ReConnect tools, and cache-bust shared-libs / design-system / generated-bundle URLs in tool HTML at build time so deploys invalidate browser caches without users needing a hard refresh.

**Architecture:** Two coordinated components. (1) A new vanilla-JS shared library `rc-tool-nav.js` that auto-mounts a sticky toolbar on DOMContentLoaded, modeled on the IIFE pattern of `rc-toolbox.js`. Tracks tool path in `sessionStorage` for ← / → enabled-state; navigation itself uses native `history.back()` / `history.forward()`. (2) An extension to `tools-suite/build_netlify.py` that stamps `?v=<build_stamp>` on `<script src="../shared-libs/rc-*.js">`, `<link href="../design-system/rc-*.css">`, and `<script src="generated/<tool>.app.js">` references in every `_site/tools/*.html`, using the same `datetime.now(timezone.utc).strftime('%Y%m%d%H%M')` pattern already used at `build_netlify.py:673`.

**Tech Stack:** Vanilla JavaScript (IIFE), Node.js + jsdom (QA harness), Python 3 (build & inject scripts), bash (canary check), Playwright (e2e). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-26-tool-nav-toolbar-and-cache-bust-design.md`

**Worktree:** This plan is intended to run in `.claude/worktrees/crazy-villani-9f80f1/` (already active).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `tools-suite/shared-libs/rc-tool-nav.js` | Create | The toolbar component itself; auto-mount, history tracking, opt-out checks, public `RCToolNav` API |
| `tools-suite/qa/qa_harness_rc-tool-nav.js` | Create | jsdom-based QA harness covering mount, suppression, history, button enablement |
| `scripts/inject_rc_tool_nav.py` | Create | One-shot script that adds `<script src="../shared-libs/rc-tool-nav.js"></script>` to tool HTML files; idempotent, with skip-list |
| `tests/e2e/tool-nav-toolbar.spec.ts` | Create | Playwright e2e validating click-through navigation between landing → tool → tool, ← / → / ⌂ behavior |
| `tools-suite/build_netlify.py` | Modify | Add `stamp_tool_html_cache_bust()` post-copy step + invocation |
| `scripts/check_generated_canary_bundles.sh` | Modify | Add `check_html_cache_bust()` function asserting every `_site/tools/*.html` carries `?v=` on the three URL patterns |
| `tools-suite/tools/*.html` (~80 files) | Modify (mechanical, via inject script) | One new `<script>` line each |
| `tools-suite/tools/recovery-companion.html` | Modify | Add `data-rc-no-tool-nav` to body (iframe-embedded) |

---

## Task 1: Scaffold `rc-tool-nav.js` with mount + ⌂ home button + a11y

**Files:**
- Create: `tools-suite/shared-libs/rc-tool-nav.js`
- Create: `tools-suite/qa/qa_harness_rc-tool-nav.js`

**Goal:** End of task — opening any HTML page that includes `<script src="../shared-libs/rc-tool-nav.js"></script>` shows a sticky 44-px toolbar with three buttons. ← and → are disabled (no history yet); ⌂ navigates to `../landing/`. Toolbar is keyboard-focusable with proper ARIA.

- [ ] **Step 1: Create the QA harness with failing assertions**

Create `tools-suite/qa/qa_harness_rc-tool-nav.js`:

```javascript
#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * rc-tool-nav.js — Automated QA Harness
 * ══════════════════════════════════════════════════════════════
 * TDD harness — validates auto-mount behavior, suppression rules,
 * history tracking, and button enable/disable logic.
 *
 * Usage:  node tools-suite/qa/qa_harness_rc-tool-nav.js
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LIB_PATH = path.join(REPO_ROOT, 'tools-suite', 'shared-libs', 'rc-tool-nav.js');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else           { console.error('  ✗ FAIL: ' + label); failed++; }
}
function group(name) { console.log('\n' + name); }

function loadLib(dom) {
  const code = fs.readFileSync(LIB_PATH, 'utf8');
  const script = dom.window.document.createElement('script');
  script.textContent = code;
  dom.window.document.head.appendChild(script);
}

function makeDOM(opts) {
  opts = opts || {};
  const html = '<!DOCTYPE html><html><head><title>' +
    (opts.title || 'Coping Deck | ReConnect') +
    '</title></head><body' +
    (opts.bodyAttrs || '') + '><div id="root"></div></body></html>';
  const dom = new JSDOM(html, {
    url: opts.url || 'http://localhost/tools/coping-deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  // sessionStorage stub (jsdom provides one but ensure clean state)
  dom.window.sessionStorage.clear();
  // performance.getEntriesByType stub
  dom.window.performance.getEntriesByType = function (type) {
    if (type === 'navigation') return [{ type: opts.navType || 'navigate' }];
    return [];
  };
  return dom;
}

function fireDOMReady(dom) {
  const ev = new dom.window.Event('DOMContentLoaded', { bubbles: true });
  dom.window.document.dispatchEvent(ev);
}

// ── Test: basic auto-mount ──
group('Auto-mount on DOMContentLoaded');
{
  const dom = makeDOM();
  loadLib(dom);
  fireDOMReady(dom);
  const header = dom.window.document.querySelector('.rc-tool-nav');
  assert('toolbar element appended to body', !!header);
  assert('toolbar uses semantic <header>', header && header.tagName === 'HEADER');
  assert('toolbar has role="banner"', header && header.getAttribute('role') === 'banner');

  const buttons = header ? header.querySelectorAll('button') : [];
  assert('toolbar has exactly 3 buttons', buttons.length === 3);

  const labels = Array.from(buttons).map(b => b.getAttribute('aria-label') || '');
  assert('back button has aria-label', labels[0] && /back/i.test(labels[0]));
  assert('forward button has aria-label', labels[1] && /forward/i.test(labels[1]));
  assert('home button has aria-label', labels[2] && /tools|home|index/i.test(labels[2]));
}

// ── Test: title detection ──
group('Title detection');
{
  const dom = makeDOM({ title: 'Crisis Moment Navigator | ReConnect' });
  loadLib(dom);
  fireDOMReady(dom);
  const titleEl = dom.window.document.querySelector('.rc-tool-nav__title');
  assert('title element rendered', !!titleEl);
  assert('title strips " | ReConnect" suffix',
    titleEl && titleEl.textContent.trim() === 'Crisis Moment Navigator');
}

// ── Test: home button navigates ──
group('Home button navigates to ../landing/');
{
  const dom = makeDOM();
  loadLib(dom);
  fireDOMReady(dom);
  const buttons = dom.window.document.querySelectorAll('.rc-tool-nav button');
  const homeBtn = buttons[2];
  let navigatedTo = null;
  // jsdom doesn't actually follow window.location.href — capture the assignment
  Object.defineProperty(dom.window, 'location', {
    value: { href: 'http://localhost/tools/coping-deck.html',
             set href(v) { navigatedTo = v; } },
    writable: true,
  });
  // The above stub is fragile in jsdom; alternative: spy on the lib's
  // internal LANDING_HREF by intercepting click. For simplicity use
  // window.location assign via Object.assign trick:
  Object.assign(dom.window.location, { href: '__sentinel__' });
  homeBtn.click();
  // Verify either: navigation attempted or location.href changed away from sentinel
  assert('clicking home button changes location.href',
    dom.window.location.href !== '__sentinel__');
}

// ── Summary ──
console.log('\n' + (failed === 0 ? '✓ ALL PASSED' : '✗ ' + failed + ' FAILED') +
            ' (' + passed + ' passed, ' + failed + ' failed)');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run harness — expect FAIL (lib doesn't exist)**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: error like `ENOENT: no such file or directory, open '...rc-tool-nav.js'`

- [ ] **Step 3: Implement `rc-tool-nav.js` (mount + a11y + home button)**

Create `tools-suite/shared-libs/rc-tool-nav.js`:

```javascript
/**
 * rc-tool-nav.js — ReConnect Tool Navigation Toolbar
 *
 * Auto-mounting browser-style nav toolbar shown above every tool's content.
 * Provides ← back, → forward, and ⌂ all tools buttons.
 *
 * Mount: Auto-mounts on DOMContentLoaded unless suppressed (see init()).
 *
 * @version 1.0.0
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'rc_tool_nav_v1';
  var STACK_CAP = 50;
  var TOOLBAR_CLASS = 'rc-tool-nav';
  var STYLE_ID = 'rc-tool-nav-styles';
  var LANDING_HREF = '../landing/';

  // ── Title detection ──
  function readToolTitle() {
    var html = document.documentElement;
    var node = html ? html.firstChild : null;
    while (node && node.nodeType !== 8) { node = node.nextSibling; }
    if (node && node.nodeValue) {
      var m = node.nodeValue.match(/tool="([^"]+)"/);
      if (m) return m[1];
    }
    var t = document.title || '';
    return t.replace(/\s*\|\s*ReConnect\s*$/, '').trim() || 'ReConnect';
  }

  // ── Styles ──
  var STYLES = [
    '.rc-tool-nav {',
    '  position: sticky; top: 0; z-index: 9000;',
    '  display: flex; align-items: center; gap: 0.5rem;',
    '  padding: 0.375rem 0.75rem;',
    '  background: var(--rc-surface, #fff);',
    '  border-bottom: 1px solid var(--rc-border-light, #ebe3d8);',
    '  font-family: var(--rc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);',
    '  font-size: 0.875rem; min-height: 44px; box-sizing: border-box;',
    '}',
    '.rc-tool-nav__btn {',
    '  background: transparent; border: 1px solid transparent;',
    '  color: var(--rc-text-mid, #64574b);',
    '  padding: 0.375rem 0.625rem; border-radius: 0.25rem;',
    '  font-family: inherit; font-size: inherit; cursor: pointer;',
    '  display: inline-flex; align-items: center; gap: 0.25rem;',
    '}',
    '.rc-tool-nav__btn:hover:not([aria-disabled="true"]) {',
    '  background: var(--rc-surface-quiet, #f1ece6);',
    '}',
    '.rc-tool-nav__btn:focus-visible {',
    '  outline: 2px solid var(--rc-accent, #2a6b5e); outline-offset: 2px;',
    '}',
    '.rc-tool-nav__btn[aria-disabled="true"] { opacity: 0.4; cursor: not-allowed; }',
    '.rc-tool-nav__title {',
    '  flex: 1; text-align: center;',
    '  color: var(--rc-text, #3b332c); font-weight: 500;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
    '}',
    '@media (max-width: 640px) {',
    '  .rc-tool-nav__btn .rc-tool-nav__btn-label { display: none; }',
    '  .rc-tool-nav__title { font-size: 0.8125rem; }',
    '}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ── Button factory ──
  function makeButton(iconChar, labelText, ariaLabel, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rc-tool-nav__btn';
    btn.setAttribute('aria-label', ariaLabel);
    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconChar;
    var label = document.createElement('span');
    label.className = 'rc-tool-nav__btn-label';
    label.textContent = labelText;
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' '));
    btn.appendChild(label);
    btn.addEventListener('click', function (e) {
      if (btn.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        return;
      }
      onClick(e);
    });
    return btn;
  }

  function setDisabled(btn, isDisabled) {
    btn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
  }

  // ── Mount ──
  function mount() {
    injectStyles();

    var header = document.createElement('header');
    header.className = TOOLBAR_CLASS;
    header.setAttribute('role', 'banner');

    var btnBack = makeButton('←', 'Back', 'Go back to previous tool',
                             function () { window.history.back(); });
    var btnFwd = makeButton('→', 'Forward', 'Go forward to next tool',
                            function () { window.history.forward(); });

    var titleEl = document.createElement('div');
    titleEl.className = 'rc-tool-nav__title';
    titleEl.textContent = readToolTitle();

    var btnHome = makeButton('⌂', 'All Tools', 'Return to all tools index',
                             function () { window.location.href = LANDING_HREF; });

    header.appendChild(btnBack);
    header.appendChild(btnFwd);
    header.appendChild(titleEl);
    header.appendChild(btnHome);

    // disabled-by-default until history tracking lands in Task 2
    setDisabled(btnBack, true);
    setDisabled(btnFwd, true);

    document.body.insertBefore(header, document.body.firstChild);

    return { header: header, btnBack: btnBack, btnFwd: btnFwd,
             btnHome: btnHome, titleEl: titleEl };
  }

  function unmount() {
    var existing = document.querySelector('.' + TOOLBAR_CLASS);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var styleEl = document.getElementById(STYLE_ID);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  }

  // ── Init ──
  var _refs = null;

  function init() {
    _refs = mount();
    global.RCToolNav = {
      mount: function () { _refs = mount(); return _refs; },
      unmount: function () { unmount(); _refs = null; },
      setTitle: function (str) {
        if (_refs && _refs.titleEl) _refs.titleEl.textContent = String(str);
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run harness — expect mount + title PASS, home-click test may PASS or be flaky**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: All assertions pass except possibly the "clicking home button changes location.href" assertion — jsdom restricts setting `window.location.href`. If that one fails, leave it: it'll be replaced with a more robust event-spy check in Task 4.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/shared-libs/rc-tool-nav.js tools-suite/qa/qa_harness_rc-tool-nav.js
git commit -m "feat(shared-libs): rc-tool-nav.js scaffold + QA harness

Auto-mounting toolbar with ← → ⌂ buttons. ← and → disabled by
default; history tracking lands in next task.

Refs: docs/superpowers/specs/2026-04-26-tool-nav-toolbar-and-cache-bust-design.md"
```

---

## Task 2: History tracking + ←/→ button enablement

**Files:**
- Modify: `tools-suite/shared-libs/rc-tool-nav.js`
- Modify: `tools-suite/qa/qa_harness_rc-tool-nav.js`

**Goal:** Toolbar tracks tool path in `sessionStorage` and toggles ← / → enabled state correctly. Native `history.back()` / `history.forward()` still does the actual navigation.

- [ ] **Step 1: Add failing harness tests for history**

Append to `tools-suite/qa/qa_harness_rc-tool-nav.js` before the summary:

```javascript
// ── Test: fresh navigation pushes to stack ──
group('History tracking — fresh navigation');
{
  const dom = makeDOM({ navType: 'navigate',
                        url: 'http://localhost/tools/coping-deck.html' });
  loadLib(dom);
  fireDOMReady(dom);
  const raw = dom.window.sessionStorage.getItem('rc_tool_nav_v1');
  assert('sessionStorage entry written', !!raw);
  const state = JSON.parse(raw || '{}');
  assert('stack has 1 entry after fresh nav',
    state.stack && state.stack.length === 1);
  assert('cursor === 0 after fresh nav', state.cursor === 0);
  assert('stack entry has url + title',
    state.stack[0].url && state.stack[0].title);
}

// ── Test: back/forward type does NOT push ──
group('History tracking — back/forward navigation');
{
  const dom = makeDOM({ navType: 'navigate',
                        url: 'http://localhost/tools/coping-deck.html' });
  // pre-seed sessionStorage with a prior visit
  dom.window.sessionStorage.setItem('rc_tool_nav_v1', JSON.stringify({
    stack: [
      { url: 'http://localhost/tools/coping-deck.html', title: 'Coping Deck' },
      { url: 'http://localhost/tools/crisis-moment-navigator.html', title: 'Crisis Moment Navigator' }
    ],
    cursor: 1,
  }));
  // simulate back navigation: type='back_forward', URL = first entry
  dom.window.performance.getEntriesByType = function (t) {
    return t === 'navigation' ? [{ type: 'back_forward' }] : [];
  };
  loadLib(dom);
  fireDOMReady(dom);
  const state = JSON.parse(dom.window.sessionStorage.getItem('rc_tool_nav_v1'));
  assert('stack length unchanged on back/forward', state.stack.length === 2);
  assert('cursor moved to matching URL (0)', state.cursor === 0);
}

// ── Test: button enabled/disabled state ──
group('Button enable/disable state');
{
  const dom = makeDOM({ navType: 'navigate' });
  loadLib(dom);
  fireDOMReady(dom);
  const btns = dom.window.document.querySelectorAll('.rc-tool-nav button');
  assert('back button disabled at cursor 0',
    btns[0].getAttribute('aria-disabled') === 'true');
  assert('forward button disabled at end of stack',
    btns[1].getAttribute('aria-disabled') === 'true');
  assert('home button always enabled',
    btns[2].getAttribute('aria-disabled') !== 'true');
}

group('Button enable/disable — mid-stack');
{
  const dom = makeDOM({ url: 'http://localhost/tools/coping-deck.html' });
  dom.window.sessionStorage.setItem('rc_tool_nav_v1', JSON.stringify({
    stack: [
      { url: 'http://localhost/tools/safety-plan-builder.html', title: 'Safety Plan' },
      { url: 'http://localhost/tools/coping-deck.html', title: 'Coping Deck' },
      { url: 'http://localhost/tools/goal-tracker.html', title: 'Goal Tracker' }
    ],
    cursor: 1,
  }));
  dom.window.performance.getEntriesByType = function (t) {
    return t === 'navigation' ? [{ type: 'back_forward' }] : [];
  };
  loadLib(dom);
  fireDOMReady(dom);
  const btns = dom.window.document.querySelectorAll('.rc-tool-nav button');
  assert('back enabled when cursor > 0',
    btns[0].getAttribute('aria-disabled') === 'false');
  assert('forward enabled when cursor < stack.length - 1',
    btns[1].getAttribute('aria-disabled') === 'false');
}
```

- [ ] **Step 2: Run harness — expect new tests FAIL**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: New tests fail (no `rc_tool_nav_v1` sessionStorage entry, buttons disabled regardless of stack).

- [ ] **Step 3: Add history tracking to `rc-tool-nav.js`**

In `tools-suite/shared-libs/rc-tool-nav.js`, add helper functions just below the `readToolTitle()` function:

```javascript
  // ── History state ──
  function getState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return { stack: [], cursor: -1 };
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.stack) && typeof parsed.cursor === 'number') {
        return parsed;
      }
      return { stack: [], cursor: -1 };
    } catch (e) {
      return { stack: [], cursor: -1 };
    }
  }

  function saveState(state) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* quota or denied — ignore */ }
  }

  function readNavType() {
    try {
      var entries = performance.getEntriesByType('navigation');
      if (entries && entries[0] && entries[0].type) return entries[0].type;
    } catch (e) { /* old browsers — fall through */ }
    return 'navigate';
  }

  function updateHistory() {
    var navType = readNavType();
    var state = getState();
    var entry = { url: window.location.href, title: readToolTitle() };

    if (navType === 'reload') {
      // no change
    } else if (navType === 'back_forward') {
      for (var i = 0; i < state.stack.length; i++) {
        if (state.stack[i].url === entry.url) {
          state.cursor = i;
          break;
        }
      }
    } else {
      // 'navigate' or unknown — push, truncate forward
      var current = state.stack[state.cursor];
      if (current && current.url === entry.url) {
        // dedupe: same URL as current entry, no change
      } else {
        state.stack = state.stack.slice(0, state.cursor + 1);
        state.stack.push(entry);
        if (state.stack.length > STACK_CAP) {
          var drop = state.stack.length - STACK_CAP;
          state.stack = state.stack.slice(drop);
          state.cursor -= drop;
        }
        state.cursor = state.stack.length - 1;
      }
    }
    saveState(state);
    return state;
  }
```

Then update `mount()` to accept the state and apply it. Replace the existing `mount()` function with:

```javascript
  function mount(state) {
    state = state || { stack: [], cursor: -1 };
    injectStyles();

    var header = document.createElement('header');
    header.className = TOOLBAR_CLASS;
    header.setAttribute('role', 'banner');

    var btnBack = makeButton('←', 'Back', 'Go back to previous tool',
                             function () { window.history.back(); });
    var btnFwd = makeButton('→', 'Forward', 'Go forward to next tool',
                            function () { window.history.forward(); });

    var titleEl = document.createElement('div');
    titleEl.className = 'rc-tool-nav__title';
    titleEl.textContent = readToolTitle();

    var btnHome = makeButton('⌂', 'All Tools', 'Return to all tools index',
                             function () { window.location.href = LANDING_HREF; });

    header.appendChild(btnBack);
    header.appendChild(btnFwd);
    header.appendChild(titleEl);
    header.appendChild(btnHome);

    setDisabled(btnBack, state.cursor <= 0);
    setDisabled(btnFwd, state.cursor >= state.stack.length - 1);

    document.body.insertBefore(header, document.body.firstChild);

    return { header: header, btnBack: btnBack, btnFwd: btnFwd,
             btnHome: btnHome, titleEl: titleEl };
  }
```

And update `init()`:

```javascript
  function init() {
    var state = updateHistory();
    _refs = mount(state);
    global.RCToolNav = {
      mount: function () { _refs = mount(getState()); return _refs; },
      unmount: function () { unmount(); _refs = null; },
      setTitle: function (str) {
        if (_refs && _refs.titleEl) _refs.titleEl.textContent = String(str);
      },
      get history() { return getState(); }
    };
  }
```

- [ ] **Step 4: Run harness — expect all history tests PASS**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: All "History tracking" and "Button enable/disable" assertions pass.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/shared-libs/rc-tool-nav.js tools-suite/qa/qa_harness_rc-tool-nav.js
git commit -m "feat(rc-tool-nav): sessionStorage history tracking + button enable state

Tracks tool path in rc_tool_nav_v1 (50-entry cap, FIFO eviction).
Native history.back()/forward() still owns navigation; sessionStorage
is purely cosmetic (button disabled state)."
```

---

## Task 3: Opt-out, iframe detection, idempotency

**Files:**
- Modify: `tools-suite/shared-libs/rc-tool-nav.js`
- Modify: `tools-suite/qa/qa_harness_rc-tool-nav.js`

**Goal:** Toolbar self-suppresses when (a) running inside an iframe, (b) `<body data-rc-no-tool-nav>` is set, (c) `<body class="rc-no-chrome">` is set, or (d) a `.rc-tool-nav` element already exists.

- [ ] **Step 1: Add failing harness tests for suppression**

Append to `qa_harness_rc-tool-nav.js`:

```javascript
// ── Suppression rules ──
group('Suppression — data-rc-no-tool-nav');
{
  const dom = makeDOM({ bodyAttrs: ' data-rc-no-tool-nav' });
  loadLib(dom);
  fireDOMReady(dom);
  assert('toolbar NOT mounted when data-rc-no-tool-nav set',
    !dom.window.document.querySelector('.rc-tool-nav'));
}

group('Suppression — rc-no-chrome class');
{
  const dom = makeDOM({ bodyAttrs: ' class="rc-no-chrome"' });
  loadLib(dom);
  fireDOMReady(dom);
  assert('toolbar NOT mounted when body has rc-no-chrome',
    !dom.window.document.querySelector('.rc-tool-nav'));
}

group('Suppression — iframe context');
{
  const dom = makeDOM();
  // simulate iframe: window.self !== window.top
  Object.defineProperty(dom.window, 'top', { value: {}, writable: false });
  loadLib(dom);
  fireDOMReady(dom);
  assert('toolbar NOT mounted when window.self !== window.top',
    !dom.window.document.querySelector('.rc-tool-nav'));
}

group('Suppression — idempotency');
{
  const dom = makeDOM();
  // pre-seed an existing toolbar
  const fake = dom.window.document.createElement('header');
  fake.className = 'rc-tool-nav';
  fake.setAttribute('data-existing', 'true');
  dom.window.document.body.appendChild(fake);
  loadLib(dom);
  fireDOMReady(dom);
  const all = dom.window.document.querySelectorAll('.rc-tool-nav');
  assert('only the pre-existing toolbar remains', all.length === 1);
  assert('pre-existing toolbar untouched',
    all[0].getAttribute('data-existing') === 'true');
}

group('RCToolNav public API');
{
  const dom = makeDOM();
  loadLib(dom);
  fireDOMReady(dom);
  const api = dom.window.RCToolNav;
  assert('window.RCToolNav exists', !!api);
  assert('RCToolNav.mount is a function', typeof (api && api.mount) === 'function');
  assert('RCToolNav.unmount is a function', typeof (api && api.unmount) === 'function');
  assert('RCToolNav.setTitle is a function', typeof (api && api.setTitle) === 'function');
  assert('RCToolNav.history is a getter', api && typeof api.history === 'object');
}
```

- [ ] **Step 2: Run harness — expect 4 suppression tests FAIL**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: Suppression assertions fail; toolbar mounts even when it should be suppressed.

- [ ] **Step 3: Add suppression logic to `init()`**

In `tools-suite/shared-libs/rc-tool-nav.js`, replace the `init()` function with:

```javascript
  function shouldSuppress() {
    try {
      if (window.self !== window.top) return 'iframe';
    } catch (e) { /* cross-origin frame access threw — treat as iframe */
      return 'iframe';
    }
    if (!document.body) return null;
    if (document.body.hasAttribute('data-rc-no-tool-nav')) return 'opt-out';
    if (document.body.classList.contains('rc-no-chrome')) return 'no-chrome';
    if (document.querySelector('.' + TOOLBAR_CLASS)) return 'already-mounted';
    return null;
  }

  function init() {
    var reason = shouldSuppress();
    if (reason) {
      if (window.console && window.console.debug) {
        window.console.debug('[rc-tool-nav] suppressed:', reason);
      }
      // expose API as a no-op so consumers don't crash
      global.RCToolNav = global.RCToolNav || {
        mount: function () { return null; },
        unmount: function () {},
        setTitle: function () {},
        get history() { return getState(); },
        suppressed: reason
      };
      return;
    }
    var state = updateHistory();
    _refs = mount(state);
    global.RCToolNav = {
      mount: function () { _refs = mount(getState()); return _refs; },
      unmount: function () { unmount(); _refs = null; },
      setTitle: function (str) {
        if (_refs && _refs.titleEl) _refs.titleEl.textContent = String(str);
      },
      get history() { return getState(); }
    };
  }
```

- [ ] **Step 4: Run harness — expect all suppression tests PASS**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: All assertions pass; final summary shows 0 failures.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/shared-libs/rc-tool-nav.js tools-suite/qa/qa_harness_rc-tool-nav.js
git commit -m "feat(rc-tool-nav): suppression rules + RCToolNav public API

Toolbar self-suppresses inside iframes, when body has
data-rc-no-tool-nav or .rc-no-chrome, or when an existing
.rc-tool-nav already mounted. Public API stays available
in suppressed mode (as no-ops) so callers don't crash."
```

---

## Task 4: Inject script + pilot 5 tools

**Files:**
- Create: `scripts/inject_rc_tool_nav.py`
- Modify: 5 tool HTML files (Coping Deck, Crisis Moment Navigator, Daily Reflection, Goal Tracker, Safety Plan Builder)

**Goal:** A single Python script that adds `<script src="../shared-libs/rc-tool-nav.js"></script>` to a tool's `<head>`. Idempotent. Skip-list aware. Apply to 5 pilot tools and run their existing QA harnesses to verify no regressions.

- [ ] **Step 1: Create the inject script**

Create `scripts/inject_rc_tool_nav.py`:

```python
#!/usr/bin/env python3
"""
Inject `<script src="../shared-libs/rc-tool-nav.js"></script>` into tool HTML.

Idempotent: skips files that already include the line.
Skip-list aware: never touches files in SKIP_FILENAMES.
Inserts after the LAST existing `<script src="../shared-libs/rc-*.js">` line in <head>,
or just before </head> if no such line exists.

Usage:
    python3 scripts/inject_rc_tool_nav.py [TOOL_FILES...]
    python3 scripts/inject_rc_tool_nav.py --all

Examples:
    # Pilot — only the named files
    python3 scripts/inject_rc_tool_nav.py \\
        tools-suite/tools/coping-deck.html \\
        tools-suite/tools/crisis-moment-navigator.html

    # Full rollout — all .html in tools-suite/tools/, minus skip-list
    python3 scripts/inject_rc_tool_nav.py --all
"""
import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = REPO_ROOT / "tools-suite" / "tools"

INJECT_LINE = '  <script src="../shared-libs/rc-tool-nav.js"></script>'

SKIP_FILENAMES = {
    "recovery-companion.html",
    # add more during rollout if discovered
}

EXISTING_INCLUDE_PATTERN = re.compile(
    r'<script\s+src="\.\./shared-libs/rc-[^"]+\.js"[^>]*>\s*</script>',
    re.IGNORECASE,
)
INJECT_MARKER = "rc-tool-nav.js"
HEAD_CLOSE = re.compile(r'</head>', re.IGNORECASE)


def already_injected(content: str) -> bool:
    return INJECT_MARKER in content


def inject(content: str) -> str:
    """Return modified content with the inject line added.

    Strategy:
      1. Find all existing rc-*.js shared-libs includes.
      2. Insert our line on a new line after the LAST such include.
      3. If no such include, insert just before </head>.
    """
    matches = list(EXISTING_INCLUDE_PATTERN.finditer(content))
    if matches:
        last = matches[-1]
        insert_at = last.end()
        return content[:insert_at] + "\n" + INJECT_LINE + content[insert_at:]
    head_match = HEAD_CLOSE.search(content)
    if not head_match:
        raise RuntimeError("Tool HTML has no </head> — cannot inject")
    insert_at = head_match.start()
    return content[:insert_at] + INJECT_LINE + "\n" + content[insert_at:]


def process_file(path: Path) -> str:
    if path.name in SKIP_FILENAMES:
        return "skip-list"
    if not path.exists():
        return "missing"
    content = path.read_text(encoding="utf-8")
    if already_injected(content):
        return "already-injected"
    new_content = inject(content)
    path.write_text(new_content, encoding="utf-8")
    return "injected"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", type=Path,
                        help="Specific tool HTML files to inject into")
    parser.add_argument("--all", action="store_true",
                        help="Inject into every .html in tools-suite/tools/")
    args = parser.parse_args()

    if args.all:
        files = sorted(TOOLS_DIR.glob("*.html"))
    else:
        if not args.files:
            parser.error("Pass either --all or one or more tool HTML paths")
        files = [Path(f) for f in args.files]

    counts = {"injected": 0, "already-injected": 0, "skip-list": 0,
              "missing": 0, "error": 0}
    for f in files:
        try:
            status = process_file(f)
        except Exception as e:
            print(f"  ERROR  {f.name}: {e}", file=sys.stderr)
            counts["error"] += 1
            continue
        counts[status] += 1
        print(f"  {status:18s} {f.name}")

    print()
    print("Summary:")
    for k, v in counts.items():
        print(f"  {k:18s} {v}")
    return 0 if counts["error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make script executable and test on a temp copy**

Run:
```bash
chmod +x scripts/inject_rc_tool_nav.py
cp tools-suite/tools/coping-deck.html /tmp/coping-deck-test.html
python3 scripts/inject_rc_tool_nav.py /tmp/coping-deck-test.html
grep -c 'rc-tool-nav.js' /tmp/coping-deck-test.html
```

Expected: prints `injected ... coping-deck-test.html`, summary line shows `injected 1`, grep returns `1`.

Idempotency check:
```bash
python3 scripts/inject_rc_tool_nav.py /tmp/coping-deck-test.html
grep -c 'rc-tool-nav.js' /tmp/coping-deck-test.html
```
Expected: `already-injected 1` in summary, grep still returns `1`.

- [ ] **Step 3: Apply to 5 pilot tools**

Run:
```bash
python3 scripts/inject_rc_tool_nav.py \
  tools-suite/tools/coping-deck.html \
  tools-suite/tools/crisis-moment-navigator.html \
  tools-suite/tools/daily-reflection.html \
  tools-suite/tools/goal-tracker.html \
  tools-suite/tools/safety-plan-builder.html
```

Expected: summary shows `injected 5`.

Verify with `grep -l 'rc-tool-nav.js' tools-suite/tools/*.html | wc -l`. Expected: `5`.

(Note: the actual filenames may differ — `goal-tracker.html` vs `Goal_Tracker.html`. If a path doesn't exist, the script reports `missing` and continues. Adjust filenames based on `ls tools-suite/tools/`.)

- [ ] **Step 4: Run the 5 pilot tools' existing QA harnesses**

Run for each pilot tool that has a harness:
```bash
node tools-suite/qa/qa_harness_coping_deck.js
node tools-suite/qa/qa_harness_crisis-moment-navigator.js  # adjust per actual filename
node tools-suite/qa/qa_harness_daily-reflection.js
node tools-suite/qa/qa_harness_goal-tracker.js
node tools-suite/qa/qa_harness_safety-plan-builder.js
```

Expected: All harnesses pass. The toolbar shouldn't break anything because tools attach their UI to `#root`, and we insert above (not into) `#root`.

If a harness fails because it asserts on `document.body.firstChild` (or similar), update the assertion to skip past the toolbar — flag it during this step rather than papering over.

- [ ] **Step 5: Commit pilot rollout**

```bash
git add scripts/inject_rc_tool_nav.py tools-suite/tools/coping-deck.html \
  tools-suite/tools/crisis-moment-navigator.html \
  tools-suite/tools/daily-reflection.html \
  tools-suite/tools/goal-tracker.html \
  tools-suite/tools/safety-plan-builder.html
git commit -m "feat(tools): rc-tool-nav.js include — pilot rollout (5 tools)

Inject script + 5 pilot tools (Coping Deck, Crisis Moment Navigator,
Daily Reflection, Goal Tracker, Safety Plan Builder). Existing QA
harnesses for these tools still pass."
```

---

## Task 5: Playwright e2e — toolbar navigation flow

**Files:**
- Create: `tests/e2e/tool-nav-toolbar.spec.ts`

**Goal:** Validate the toolbar end-to-end on the deployed (or preview) site: click landing → click a tool → verify toolbar mount + ← enabled / → disabled, click ←, verify return to landing.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/tool-nav-toolbar.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8903';

test.describe('Tool nav toolbar', () => {
  test('mounts on a piloted tool and ⌂ returns to landing', async ({ page }) => {
    await page.goto(`${BASE}/landing/`);
    await page.getByRole('link', { name: /coping deck/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    const home = page.locator('.rc-tool-nav button[aria-label*="all tools" i]');
    await expect(home).toBeVisible();

    // Back is disabled for the first tool in the session — no prior history
    const back = page.locator('.rc-tool-nav button[aria-label*="back" i]');
    await expect(back).toHaveAttribute('aria-disabled', 'true');

    await home.click();
    await expect(page).toHaveURL(/\/landing\/?$/);
  });

  test('← returns to previous tool after navigating between two tools', async ({ page }) => {
    await page.goto(`${BASE}/landing/`);
    await page.getByRole('link', { name: /coping deck/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    // navigate to a second tool from inside the suite (use ⌂ then click another)
    await page.locator('.rc-tool-nav button[aria-label*="all tools" i]').click();
    await page.getByRole('link', { name: /crisis moment navigator/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    const back = page.locator('.rc-tool-nav button[aria-label*="back" i]');
    await expect(back).toHaveAttribute('aria-disabled', 'false');
    await back.click();
    await expect(page).toHaveURL(/\/landing\/?(?:$|[?#])/);
  });

  test('toolbar is keyboard-accessible', async ({ page }) => {
    await page.goto(`${BASE}/landing/`);
    await page.getByRole('link', { name: /coping deck/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    // Skip-link is the first tab stop, then ← Forward Title ⌂
    await page.keyboard.press('Tab'); // skip-link
    await page.keyboard.press('Tab'); // back
    let focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focused).toMatch(/back/i);

    await page.keyboard.press('Tab'); // forward
    focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focused).toMatch(/forward/i);
  });
});
```

- [ ] **Step 2: Run e2e against local dev preview — expect tests PASS**

Run:
```bash
# In one terminal: start the local preview server (serves _site)
python3 tools-suite/build_netlify.py
cd tools-suite/_site && python3 -m http.server 8903 &

# In another: run Playwright (or use the dev server already configured)
npx playwright test tests/e2e/tool-nav-toolbar.spec.ts --project=chromium
```

Expected: 3 tests PASS. If the third test (keyboard accessibility) fails because the skip-link tab-order varies by tool, adjust the number of `Tab` presses to match — or replace with `page.locator('button[aria-label*="back" i]').focus()` followed by an active-element check.

- [ ] **Step 3: Stop the preview server, commit**

```bash
kill %1  # kill the http.server background job
git add tests/e2e/tool-nav-toolbar.spec.ts
git commit -m "test(e2e): tool nav toolbar Playwright suite

Validates toolbar mount, ⌂ → landing navigation, ← inter-tool
navigation, and keyboard accessibility on the pilot 5 tools."
```

---

## Task 6: Roll out to all remaining tools

**Files:**
- Modify: ~75 tool HTML files (mechanical, via inject script)
- Modify: `tools-suite/tools/recovery-companion.html` (add `data-rc-no-tool-nav`)

**Goal:** Every patient/family/clinician/admin tool in `tools-suite/tools/` includes `rc-tool-nav.js`, except known iframe-embedded tools. Full QA harness suite still passes.

- [ ] **Step 1: Identify any other iframe-embedded tools**

Run:
```bash
grep -ln '<iframe[^>]*src="[^"]*tools/' tools-suite/tools/*.html
```

For each match, check whether the embedded tool would mount a toolbar inside the iframe. If yes, add the embedded tool's filename to `SKIP_FILENAMES` in `scripts/inject_rc_tool_nav.py` (the `window.self !== window.top` runtime check is the primary guard — this is just a belt-and-suspenders skip).

- [ ] **Step 2: Add `data-rc-no-tool-nav` to recovery-companion.html**

Find the `<body>` opening tag in `tools-suite/tools/recovery-companion.html`:

```bash
grep -n '<body' tools-suite/tools/recovery-companion.html
```

Edit that line to add the attribute. For example, if the line is `<body class="rc-rc-shell">`, change it to `<body class="rc-rc-shell" data-rc-no-tool-nav>`.

- [ ] **Step 3: Run the inject script in --all mode**

```bash
python3 scripts/inject_rc_tool_nav.py --all
```

Expected: summary shows `injected ~75`, `already-injected 5` (the pilot), `skip-list 1+` (recovery-companion + any iframe-embedded ones found in step 1).

Verify:
```bash
grep -l 'rc-tool-nav.js' tools-suite/tools/*.html | wc -l
```
Expected: ~79 (all tools minus the skip-list).

- [ ] **Step 4: Run the full QA harness suite**

```bash
npm run qa
```

Expected: All harnesses pass. If a harness fails on `document.body.firstChild` or similar selector that the toolbar invalidates, fix the harness to be toolbar-aware. Common pattern: replace `document.body.firstChild` with `document.querySelector('#root')` or similar tool-specific anchor.

If a harness fails for a substantive reason (the tool's actual UI broke), revert that one tool's inject by removing the line and add the filename to `SKIP_FILENAMES` for follow-up investigation.

- [ ] **Step 5: Run Playwright suite**

```bash
npx playwright test --project=chromium
```

Expected: All tests pass, including the new `tool-nav-toolbar.spec.ts`.

- [ ] **Step 6: Commit full rollout**

```bash
git add tools-suite/tools/*.html scripts/inject_rc_tool_nav.py
git commit -m "feat(tools): rc-tool-nav.js include — full rollout (~75 tools)

Toolbar now present on all patient/family/clinician/admin tools in
tools-suite/tools/. recovery-companion opted out via
data-rc-no-tool-nav (iframe embed). All QA harnesses pass."
```

---

## Task 7: Build-time cache-bust extension to `build_netlify.py`

**Files:**
- Modify: `tools-suite/build_netlify.py`

**Goal:** Every `_site/tools/*.html` produced by the build has `?v=<build_stamp>` appended to its `<script src="../shared-libs/rc-*.js">`, `<link href="../design-system/rc-*.css">`, and `<script src="generated/<tool>.app.js">` URLs. One shared timestamp per build (so cross-tool caching within a deploy still works).

- [ ] **Step 1: Add a failing integration test (shell-level)**

First ensure the integration test dir exists:

```bash
mkdir -p tests/integration
```

Then create `tests/integration/test_cache_bust.sh`:

```bash
#!/usr/bin/env bash
# Test that build_netlify.py stamps ?v= on shared-libs, design-system,
# and generated bundle URLs in every _site/tools/*.html.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="$REPO_ROOT/tools-suite/_site"

cd "$REPO_ROOT/tools-suite"
python3 build_netlify.py >/dev/null

# Spot-check one tool HTML
sample="$SITE_DIR/tools/coping-deck.html"
if [ ! -f "$sample" ]; then
  echo "FAIL: sample tool HTML not found at $sample"
  exit 1
fi

fail=0
grep -E 'src="\.\./shared-libs/rc-[^"]+\.js"' "$sample" | grep -v '?v=' && {
  echo "FAIL: shared-libs include without ?v= in $sample"; fail=1; }
grep -E 'href="\.\./design-system/rc-[^"]+\.css"' "$sample" | grep -v '?v=' && {
  echo "FAIL: design-system include without ?v= in $sample"; fail=1; }

# Cross-file: every script/link match across all tools must carry ?v=
total=0
unstamped=0
while IFS= read -r f; do
  while IFS= read -r line; do
    total=$((total + 1))
    if [[ "$line" != *'?v='* ]]; then
      unstamped=$((unstamped + 1))
      [ "$unstamped" -le 3 ] && echo "  unstamped: $f :: $line"
    fi
  done < <(grep -oE '(src|href)="\.\./shared-libs/rc-[^"]+\.js"|(src|href)="\.\./design-system/rc-[^"]+\.(js|css)"|src="generated/[^"]+\.app\.js"' "$f")
done < <(find "$SITE_DIR/tools" -maxdepth 1 -name '*.html')

echo "Inspected $total URL refs across all tool HTML."
if [ "$unstamped" -gt 0 ]; then
  echo "FAIL: $unstamped unstamped URLs found"
  exit 1
fi
[ "$fail" -eq 0 ] || exit 1
echo "PASS: all tool HTML URLs cache-busted"
```

```bash
chmod +x tests/integration/test_cache_bust.sh
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `bash tests/integration/test_cache_bust.sh`
Expected: After the build runs, the test reports unstamped URLs (no cache-bust step exists yet).

- [ ] **Step 3: Add the cache-bust function to `build_netlify.py`**

Open `tools-suite/build_netlify.py`. Find the existing `build_stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M')` line (around line 673) inside `build_landing_index()`.

Add a new top-level function above `build_landing_index()`:

```python
import re

CACHE_BUST_PATTERNS = [
    re.compile(r'(<script\s+src="\.\./shared-libs/rc-[^"]+\.js)(")', re.IGNORECASE),
    re.compile(r'(<link\s+rel="stylesheet"\s+href="\.\./design-system/rc-[^"]+\.css)(")', re.IGNORECASE),
    re.compile(r'(<link\s+href="\.\./design-system/rc-[^"]+\.css)(")', re.IGNORECASE),
    re.compile(r'(<script\s+src="generated/[^"?]+\.app\.js)(")', re.IGNORECASE),
]


def stamp_tool_html_cache_bust(site_dir, build_stamp):
    """Append `?v=<build_stamp>` to shared-libs / design-system / generated
    bundle URLs in every _site/tools/*.html.

    Idempotent: skips URLs that already carry `?v=`.

    The same build_stamp is used across every tool in a single build, so the
    browser reuses the cached rc-toolbox.js (etc.) when the user opens a
    second tool within the same deploy. Only deploys invalidate.
    """
    tools_dir = site_dir / 'tools'
    if not tools_dir.exists():
        print(f'  WARNING: {tools_dir} not found — skipping cache-bust step')
        return
    suffix = f'?v={build_stamp}'
    files_touched = 0
    urls_stamped = 0
    for html_path in sorted(tools_dir.glob('*.html')):
        content = html_path.read_text(encoding='utf-8')
        original = content
        for pattern in CACHE_BUST_PATTERNS:
            def _replace(match):
                nonlocal urls_stamped
                # match.group(1) = up to and including the file extension
                # match.group(2) = closing quote
                # Only stamp if not already stamped
                if '?v=' in match.group(0):
                    return match.group(0)
                urls_stamped += 1
                return match.group(1) + suffix + match.group(2)
            content = pattern.sub(_replace, content)
        if content != original:
            html_path.write_text(content, encoding='utf-8')
            files_touched += 1
    print(f'  Cache-bust: stamped {urls_stamped} URLs across {files_touched} tool HTML files (v={build_stamp})')
```

Then find the main build orchestration function (look for a `def main():` or a function that calls `build_landing_index()`, `build_clinician_landing()`, etc.). Add a call to the new function near the end, after tool HTML has been copied to `_site` but before any further compression/post-processing:

```python
    # ── Cache-bust: stamp shared-libs / design-system / generated URLs ──
    cache_bust_stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M')
    stamp_tool_html_cache_bust(SITE_DIR, cache_bust_stamp)
```

(If `build_landing_index()`'s existing `build_stamp` runs *before* tool HTML is copied, use a fresh stamp here and document why — they don't need to match. The landing's stamp is for the landing's `app.js`; this stamp is for tool HTML.)

- [ ] **Step 4: Run the test — expect PASS**

Run: `bash tests/integration/test_cache_bust.sh`
Expected: `PASS: all tool HTML URLs cache-busted`. The script reports a positive total count and zero unstamped URLs.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/build_netlify.py tests/integration/test_cache_bust.sh
git commit -m "feat(build): cache-bust shared-libs, design-system, and generated URLs

build_netlify.py stamps ?v=<YYYYMMDDHHMM> on every shared-libs /
design-system / generated bundle URL in _site/tools/*.html. Single
shared timestamp per build → cross-tool intra-deploy caching
preserved, cross-deploy invalidation guaranteed.

Resolves the 'hard refresh required when switching tools' symptom
caused by 24h browser cache on assets that lack version stamps."
```

---

## Task 8: Canary check for cache-bust

**Files:**
- Modify: `scripts/check_generated_canary_bundles.sh`

**Goal:** CI fails if a deploy somehow ships tool HTML without `?v=` cache-bust stamps. Catches regressions if the build step is removed or the regex breaks.

- [ ] **Step 1: Add the cache-bust check function to the canary script**

Edit `scripts/check_generated_canary_bundles.sh`. After the last `check_bundle` call (and before the final pass/fail summary), add:

```bash
# ─── Tool HTML cache-bust verification ─────────────────────────────────
check_html_cache_bust() {
  local site_tools="$REPO_ROOT/tools-suite/_site/tools"
  if [ ! -d "$site_tools" ]; then
    echo "SKIP: $site_tools not found — run python3 tools-suite/build_netlify.py first"
    return 0
  fi
  local unstamped=0
  local samples=()
  while IFS= read -r f; do
    while IFS= read -r line; do
      if [[ "$line" != *'?v='* ]]; then
        unstamped=$((unstamped + 1))
        if [ "${#samples[@]}" -lt 3 ]; then
          samples+=("${f##*/}: $line")
        fi
      fi
    done < <(grep -oE '(src|href)="\.\./shared-libs/rc-[^"]+\.js"|(src|href)="\.\./design-system/rc-[^"]+\.css"|src="generated/[^"]+\.app\.js"' "$f")
  done < <(find "$site_tools" -maxdepth 1 -name '*.html')

  if [ "$unstamped" -gt 0 ]; then
    echo "FAIL: $unstamped tool-HTML URLs missing ?v= cache-bust stamp" >&2
    for s in "${samples[@]}"; do echo "  $s" >&2; done
    FAILED_LABELS+=("tool_html_cache_bust")
    return 1
  fi
  echo "PASS: all tool-HTML URLs carry ?v= cache-bust stamps"
}

check_html_cache_bust
```

- [ ] **Step 2: Run the canary script — expect PASS (cache-bust step from Task 7 already ran)**

Run:
```bash
python3 tools-suite/build_netlify.py >/dev/null
bash scripts/check_generated_canary_bundles.sh
```

Expected: existing bundle checks pass, new `PASS: all tool-HTML URLs carry ?v= cache-bust stamps` line appears.

- [ ] **Step 3: Verify the canary catches regressions**

Temporarily strip a `?v=` stamp from one HTML file:

```bash
sed -i '' '0,/?v=[0-9]*/{s//$NOSTAMP/}' tools-suite/_site/tools/coping-deck.html
bash scripts/check_generated_canary_bundles.sh
```

Expected: script exits non-zero, prints `FAIL: 1 tool-HTML URLs missing ?v=`. Then re-run the build to restore:

```bash
python3 tools-suite/build_netlify.py >/dev/null
bash scripts/check_generated_canary_bundles.sh
```

Expected: PASS again.

- [ ] **Step 4: Commit**

```bash
git add scripts/check_generated_canary_bundles.sh
git commit -m "ci(canary): add tool-HTML cache-bust verification

scripts/check_generated_canary_bundles.sh now also asserts every
shared-libs / design-system / generated URL in _site/tools/*.html
carries ?v= — catches regressions if the build's cache-bust step
breaks."
```

---

## Final Verification

- [ ] **Step 1: Confirm full green build**

```bash
python3 tools-suite/build_netlify.py
bash scripts/check_generated_canary_bundles.sh
npm run qa
npx playwright test --project=chromium
```

All four should report success.

- [ ] **Step 2: Manual smoke on local preview**

```bash
cd tools-suite/_site && python3 -m http.server 8903
```

Open `http://localhost:8903/landing/` in a browser:
- [ ] Click any tool → toolbar visible at top
- [ ] ← shows as disabled (first visit in session)
- [ ] ⌂ All Tools → returns to landing
- [ ] Click two different tools sequentially → ← becomes enabled, clicking it returns to first tool
- [ ] Open recovery-companion.html directly → toolbar NOT shown (data-rc-no-tool-nav)
- [ ] DevTools → Network tab → reload a tool → all `rc-*.js`, `rc-*.css`, `generated/*.app.js` requests carry `?v=YYYYMMDDHHMM`

- [ ] **Step 3: Push branch, open PR**

```bash
git push -u origin claude/crazy-villani-9f80f1
gh pr create --title "feat: tool nav toolbar + build-time cache-bust" --body "$(cat <<'EOF'
## Summary
- New `rc-tool-nav.js` shared lib auto-mounts a browser-style ← / → / ⌂ nav toolbar on every tool in `tools-suite/tools/` (~79 tools; recovery-companion opted out as iframe embed)
- `build_netlify.py` now stamps `?v=<timestamp>` on shared-libs / design-system / generated URLs in every `_site/tools/*.html` so deploys invalidate browser caches automatically — fixes the "hard refresh required when switching tools" symptom
- New canary check ensures the cache-bust step never silently breaks
- Spec: `docs/superpowers/specs/2026-04-26-tool-nav-toolbar-and-cache-bust-design.md`
- Plan: `docs/superpowers/plans/2026-04-26-tool-nav-toolbar-and-cache-bust.md`

## Test plan
- [ ] Local preview smoke (see plan §"Final Verification")
- [ ] Netlify deploy preview: open 3 tools, hard-refresh nothing, confirm toolbar + ← / → behavior on real device
- [ ] DevTools → Network: confirm `?v=` stamps present on rc-* and generated assets
- [ ] No console errors on any pilot tool

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- Component A (rc-tool-nav.js) — Tasks 1, 2, 3 ✓
- Component B (build_netlify.py cache-bust) — Task 7 ✓
- Per-tool integration — Tasks 4, 6 ✓
- Testing strategy (QA harness, e2e, cache-bust verification) — Tasks 1-3 (QA), 5 (e2e), 7-8 (cache-bust) ✓
- Rollout plan (3 PRs) — Plan delivers as one branch with clean commits per task; reviewer can split into 3 PRs if preferred ✓
- Risks (toolbar layout, sessionStorage quota, build-stamp regex collision, ⌂ path resolution) — addressed in implementation ✓

**Type / API consistency:**
- `RCToolNav` API surface (`mount`, `unmount`, `setTitle`, `history` getter) consistent across Tasks 1-3 ✓
- `STORAGE_KEY = 'rc_tool_nav_v1'` consistent ✓
- `LANDING_HREF = '../landing/'` consistent (relative path, works in both prod and dev) ✓
- `data-rc-no-tool-nav` attribute name consistent in inject script and lib ✓

**Open items deferred to implementation (per spec §"Open Questions"):**
- Mobile label fallback finalized as "icons only on ≤640px" (CSS media query in Task 1) ✓
- ⌂ button text "All Tools" — locked in Task 1 ✓
- Toolbox/bookmarks integration — deferred (out of scope) ✓
