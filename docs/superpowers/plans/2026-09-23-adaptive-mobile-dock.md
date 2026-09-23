# Adaptive Mobile Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three competing phone-fixed surfaces with one five-slot dock whose center control forwards to the shell's existing primary action.

**Architecture:** Keep Today/reader decision rules in their current owners. Render one phone-only dock from `fd_shell.js`, then let the runtime bind its center control to an existing, explicitly marked source action. Desktop markup and behavior remain unchanged; APP mode substitutes The Essentials for Path.

**Tech Stack:** ES5 browser JavaScript, build-injected Front Door modules, CSS, Node `node:test`, Playwright smoke tests.

**Spec:** `docs/superpowers/specs/2026-09-23-on-the-go-learning-design.md`

## Global Constraints

- Shared strings must remain audience-neutral; APP labels come from existing APP mode, not a new identity store.
- At `max-width: 640px`, exactly one element may own the fixed bottom edge.
- Every dock target is at least 44×44 CSS pixels and clears `env(safe-area-inset-bottom)`.
- The center control forwards to existing behavior; it does not reimplement Today, reader, timed-block, or practice routing rules.
- Desktop/tablet shell, keyboard shortcuts, faculty preview, and non-persistent `?audience=app` behavior remain unchanged.
- Update `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` in the same change as stylesheet/markup changes.
- Use ES5 syntax in build-injected modules.
- Do not change clinical content, attestation state, analytics configuration, or deployment settings.

## Review Focus

- A primary action rendered as an `<a>` rather than a `<button>` must still forward exactly once without constructing a second route.
- APP mode must show On shift / The Essentials and must never dispatch the invalid Path tab.
- A reader with no primary source must show Browse rather than a stale action retained from the preceding page.
- Opening Search or Capture from the dock must preserve their focus trap, Escape, and invoker-focus restoration behavior.
- The final focusable item on a short phone page must scroll above the dock in both safe-area and non-safe-area viewports.

---

## File map

- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js`: pure dock model and markup.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`: mark the winning Today action as the dock source.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js`: add stable labels to due/resume/read source controls.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js`: mark a primary block action without changing its route.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js`: expose one existing APP start action as the optional dock source.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js`: mark the existing reader primary control and stop emitting a second visible phone bar.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`: handle dock forwarding and Browse fallback.
- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html`: mount dock markup and retire the phone capture mount path.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`: dock layout, safe-area clearance, and retired fixed-surface rules.
- Modify `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`: new nesting/state contract.
- Test `tests/fd-shell.test.mjs`, `tests/fd-today.test.mjs`, `tests/fd-reader.test.mjs`, `tests/fd-wire.test.mjs`, `tests/fd-phone-chrome.test.mjs`, `tests/fd-action-contract.test.mjs`.
- Test `tests/smoke/front-door.spec.js`: both audiences plus APP invitation on a phone viewport.

### Task 1: Pure dock model and shell markup

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js:28-71`
- Test: `tests/fd-shell.test.mjs`

**Interfaces:**
- Consumes: state fields `tab`, `appMode`, and optional `dockAction:{label:string,sourceId:string}|null`.
- Produces: `fdDockModel(state) -> {items:Array, context:Object}` and `fdDock(state) -> string`.

- [ ] **Step 1: Add failing model and markup tests**

Add cases that assert the exact destinations and one raised context slot:

```js
test('phone dock adapts slot two for APP without exposing Path', () => {
  const standard = F.fdDockModel({ tab: 'today', appMode: false, dockAction: null });
  const app = F.fdDockModel({ tab: 'today', appMode: true, dockAction: null });
  assert.deepEqual(standard.items.map((x) => x.label), ['Today', 'Path', 'Search', 'Capture']);
  assert.deepEqual(app.items.map((x) => x.label), ['On shift', 'The Essentials', 'Search', 'Capture']);
  assert.equal(app.items.some((x) => x.value === 'path'), false);
});

test('dock context uses a source id or the audience browse fallback', () => {
  assert.match(F.fdDock({ appMode: false, dockAction: { label: 'Continue', sourceId: 'primary-1' } }),
    /data-fd-dock-forward="primary-1"[^>]*>.*Continue/s);
  assert.match(F.fdDock({ appMode: true, dockAction: null }),
    /data-fd-tab="library"[^>]*>.*Browse/s);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/fd-shell.test.mjs`

Expected: FAIL because `fdDockModel` and `fdDock` are undefined.

- [ ] **Step 3: Implement the pure model and renderer**

Add ES5 helpers with one canonical item shape:

```js
function fdDockModel(state){
  var s=state||{}, app=fdAppMode(s);
  return {
    items:[
      {id:'today',label:app?'On shift':'Today',attr:'data-fd-tab',value:'today'},
      {id:'structure',label:app?'The Essentials':'Path',attr:'data-fd-tab',value:app?'library':'path'},
      {id:'search',label:'Search',attr:'data-fd-search',value:''},
      {id:'capture',label:'Capture',attr:'data-capture-open',value:''}
    ],
    context:s.dockAction&&s.dockAction.sourceId
      ?{label:s.dockAction.label,attr:'data-fd-dock-forward',value:s.dockAction.sourceId}
      :{label:'Browse',attr:'data-fd-tab',value:'library'}
  };
}
```

`fdDock()` must emit a labelled `<nav class="fd-dock" aria-label="Learning actions">`, four
ordinary items, and one center `.fd-dock__item--context`. Escape every interpolated label/value
with `fdEsc`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/fd-shell.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the pure dock contract**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js tests/fd-shell.test.mjs
git commit -m "feat: define adaptive mobile dock"
```

### Task 2: Mark and forward the existing primary action

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js:80-112`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js:17-77`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js:249-270`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:1-70, 900-930`
- Test: `tests/fd-today.test.mjs`
- Test: `tests/fd-reader.test.mjs`
- Test: `tests/fd-wire.test.mjs`
- Test: `tests/fd-action-contract.test.mjs`

**Interfaces:**
- Consumes: one visible source control carrying `data-fd-dock-source="stable-id"` and `data-fd-dock-label="visible label"`.
- Produces: `fdDockSource(root) -> {id,label}|null` and dispatch handling for `data-fd-dock-forward`.

- [ ] **Step 1: Add failing source-marker tests for every primary kind**

Pin Today due/resume/read/block, APP, and reader output. Each primary branch must emit exactly one
source marker; secondary cards must emit none.

```js
assert.equal((primaryDue.match(/data-fd-dock-source=/g)||[]).length, 1);
assert.equal((secondaryDue.match(/data-fd-dock-source=/g)||[]).length, 0);
assert.match(reader, /data-fd-dock-label="Mark read|Next|Continue/);
```

Add an action-contract assertion that the marker value is a fixed token derived from the action
kind, never learner text.

- [ ] **Step 2: Add a failing forwarding test**

Build a harness with a marked anchor and button. Assert the returned source is current, the dock
activation calls only that control once, and a removed source falls back to Browse.

```js
test('dock forwards once to the currently connected source', () => {
  let clicks = 0;
  const source = { isConnected: true, click(){ clicks++; },
    getAttribute(name){ return name === 'data-fd-dock-label' ? 'Continue' : 'primary-read'; } };
  const root = { querySelector(){ return source; }, querySelectorAll(){ return [source]; } };
  assert.deepEqual(F.fdDockSource(root), { id:'primary-read', label:'Continue' });
  F.fdForwardDockAction(root, 'primary-read');
  assert.equal(clicks, 1);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test tests/fd-today.test.mjs tests/fd-reader.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs`

Expected: FAIL on missing markers/helpers.

- [ ] **Step 4: Add source markers without duplicating routes**

Add the two attributes to the control that already owns each primary behavior. Do not add new
`href`, route construction, block calculations, or question counts. APP marks its existing
current preparation/start action only when one is already present.

- [ ] **Step 5: Implement guarded runtime forwarding**

Add pure helpers:

```js
function fdDockSource(root){
  var el=root&&root.querySelector?root.querySelector('[data-fd-dock-source]'):null;
  if(!el||el.isConnected===false)return null;
  return {id:el.getAttribute('data-fd-dock-source'),label:el.getAttribute('data-fd-dock-label')};
}

function fdForwardDockAction(root,id){
  var nodes=root&&root.querySelectorAll?root.querySelectorAll('[data-fd-dock-source]'):[], i, el;
  for(i=0;i<nodes.length;i++){
    el=nodes[i];
    if(el.getAttribute('data-fd-dock-source')===id&&
       el.isConnected!==false&&typeof el.click==='function'){
      el.click(); return true;
    }
  }
  return false;
}
```

Register `data-fd-dock-forward` in `FD_HANDLED_ATTRS` and `FD_ACTION_SEMANTICS`. Reject missing or
stale ids instead of forwarding to the first control. The next render then supplies Browse.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test tests/fd-today.test.mjs tests/fd-reader.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit primary-action delegation**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js tests/fd-today.test.mjs tests/fd-reader.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs
git commit -m "feat: delegate dock context to primary action"
```

### Task 3: Mount one dock and retire competing phone-fixed surfaces

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:631, 2283-2301, 2420-2478`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css:734, 992-1017, 1115-1160`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md:43-49, 114-134, 241-242, 406-430`
- Test: `tests/fd-shell-boot.test.mjs`
- Test: `tests/fd-phone-chrome.test.mjs`
- Test: `tests/tool-frame.test.mjs`

**Interfaces:**
- Consumes: `fdDock(state)` and `fdDockSource(root)` from Tasks 1-2.
- Produces: one `#fdDockMount` with fresh markup after each base render; no phone-visible `#fdCaptureMount`, `.fd-tabs`, or `.fd-actionbar`.

- [ ] **Step 1: Add failing shell and CSS contract tests**

Assert:

```js
assert.match(shell, /id="fdDockMount"/);
assert.match(phoneCss, /\.fd-dock\{[^}]*position:fixed/);
assert.match(phoneCss, /\.fd-tabs[^}]*display:none/);
assert.match(phoneCss, /#fdCaptureMount[^}]*display:none/);
assert.match(phoneCss, /\.fd-actionbar[^}]*display:none/);
assert.doesNotMatch(phoneCss, /\.fd-dock[^}]*display:none/);
```

Also pin `padding-bottom` for `.fd-main`, touch target dimensions, safe-area use, reduced-motion
behavior, and reader/tool routes.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/fd-shell-boot.test.mjs tests/fd-phone-chrome.test.mjs tests/tool-frame.test.mjs`

Expected: FAIL because no dock mount/rules exist.

- [ ] **Step 3: Mount and refresh the dock**

Add `#fdDockMount` beside the existing portal mounts. After each base render, derive the current
source and call `fdDock()` with a cloned live state plus `dockAction`. Hide the mount for setup,
faculty preview, enhanced guide, and non-app screens.

Do not remove desktop capture markup in this task. At phone widths, CSS hides the floating mount;
the dock's Capture control opens the same existing dialog.

- [ ] **Step 4: Replace phone-visible fixed rules**

Add a five-column dock with a raised center slot, visible labels, and safe-area padding. At phone
widths hide `.fd-tabs`, `#fdCaptureMount`, and `.fd-actionbar`; keep their desktop behavior. Update
the main-content clearance once, against `.fd-dock`, including keyboard scrolling.

- [ ] **Step 5: Update the class inventory**

Document exact mount/sibling nesting, `.fd-dock__item--context`, active/disabled states, phone-only
visibility, and the rule that hidden legacy sources remain in the DOM solely to own behavior.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test tests/fd-shell-boot.test.mjs tests/fd-phone-chrome.test.mjs tests/tool-frame.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the integrated phone chrome**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/fd-shell-boot.test.mjs tests/fd-phone-chrome.test.mjs tests/tool-frame.test.mjs
git commit -m "feat: unify mobile actions in one dock"
```

### Task 4: Browser proof for both audiences and APP mode

**Files:**
- Modify: `tests/smoke/front-door.spec.js`
- Verify unchanged: `tests/smoke/essentials-inventory.js` remains the shared reading-row/tool-card inventory contract.

**Interfaces:**
- Consumes: built MS3/resident sites and the non-persistent `?audience=app` route.
- Produces: deterministic phone-browser evidence; no visual baseline regeneration on macOS.

- [ ] **Step 1: Add failing phone journeys**

At 375×812, assert one visible fixed bottom nav, five visible labels, APP slot substitution, Search
focus, Capture focus/close restoration, reader forwarding, and final-element clearance. Use
`:visible` selectors because desktop/mobile duplicates remain in the DOM.

- [ ] **Step 2: Build both audiences sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both PASS. Do not run them concurrently because they share generated output.

- [ ] **Step 3: Run the focused browser tests and verify RED, then repair selectors/behavior**

Run: `cd tests/smoke && npx playwright test front-door.spec.js --grep "adaptive mobile dock"`

Expected before the final repair: at least one new assertion fails. Apply only dock-related fixes,
then rerun until PASS.

- [ ] **Step 4: Run affected unit suites and the full local gate**

Run:

```bash
node --test tests/fd-shell.test.mjs tests/fd-today.test.mjs tests/fd-reader.test.mjs tests/fd-wire.test.mjs tests/fd-phone-chrome.test.mjs tests/fd-action-contract.test.mjs tests/fd-shell-boot.test.mjs tests/tool-frame.test.mjs
bash bin/verify.sh
```

Expected: PASS. A bash-3.2-only failure must be reproduced on clean `main` before attributing it to
this feature; never bypass the pre-push gate.

- [ ] **Step 5: Commit browser coverage and verification evidence**

```bash
git add tests/smoke/front-door.spec.js
git commit -m "test: cover adaptive dock journeys"
```

Record native VoiceOver and visual-baseline refresh as required manual/CI evidence in the PR body;
do not claim them from local Chromium.
