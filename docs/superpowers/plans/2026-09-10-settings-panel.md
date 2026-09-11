# Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ◐ theme glyph in the learner shell header with a ⚙ gear that opens a settings sheet holding role, exam date, a three-way appearance control, device-data export/clear, and a conditional analytics opt-out.

**Architecture:** The panel is a fourth branch of the existing `fdSheet()` renderer, so it inherits the backdrop, `role="dialog"`, the ✕ close and Escape handling rather than introducing a second modal idiom. All renderers stay pure (state in, string out); browser effects stay in `fdWire`'s `fdApplyEffect`. Theme grows a third *mode* (`system`) that is distinct from the two resolved *attributes* (`light`/`dark`) the page paints.

**Tech Stack:** Vanilla ES5 injected into a static HTML shell. Tests are `node --test` with `*.test.mjs` files that evaluate real module source through `new Function`. No framework, no build step for the frontdoor modules beyond marker injection.

**Spec:** `docs/superpowers/specs/2026-09-10-settings-panel-design.md`

## Global Constraints

- **ES5 only** in `13_Faculty_Resources/_automation/site_build/frontdoor/*.js` and in the shell's inline scripts: `var` and `function` only — no `const`, no `let`, no arrow functions, no template literals. Test files (`.mjs`) are exempt; they are not shipped.
- **Copy ships to BOTH sites unrebranded.** Audience-neutral only: no "MS3", "student", "resident", "clerkship", "shelf", "UNE", "MMC", "Sanford". Use "Exam", never "Shelf". Pinned by `tests/shell-copy.test.mjs`.
- **localStorage keys must be literal `cw_*` or `rp_*`** wherever possible. This feature adds **no new key**. The one computed-key call it does add is deliberate and costed in Task 7.
- **No hard-coded crisis numbers** and **no dose literals** — neither appears in this feature, but the hooks fire on every edit.
- **Run `node --test tests/*.test.mjs` before any build.** `build_and_check.sh` is `set -euo pipefail` and runs the node suite *before* `build_deploy.py`, so a red test leaves `_build/` serving stale output while the script merely looks "failed".
- **Smoke runs once, in Task 8.** Tasks 3 and 8 both edit `tests/smoke/front-door.spec.js`; only
  Task 8 executes it. A subagent that finds itself running `npm ci` in `tests/smoke` before Task 8
  has misread its task.
- **`bin/verify.sh` does not run the Playwright smoke suite.** A green local gate is not evidence `tests/smoke/front-door.spec.js` passes; that is a separate CI job.
- **`tests/fd-wire.test.mjs:544` hard-codes the entire delegated selector string** inside its DOM
  fixture's `closest()`. Every task below that adds a `data-fd-*` attribute to the selector in
  `fd_wire.js:585-588` must paste the identical updated string into that fixture, or `closest()`
  returns `null`, no event dispatches, and the new tests fail for a reason that has nothing to do
  with the feature.
- On the Mac, `/bin/bash` is 3.2.57: write `${ARR[@]+"${ARR[@]}"}`, never a bare `"${ARR[@]}"` on a possibly-empty array under `set -u`.

---

### Task 1: Theme mode resolution and the boot script

Theme currently has one concept (`cw_theme` is `'light'` or `'dark'`, and that value is written straight onto `documentElement`). It needs two: a **mode** the learner picks (`system`/`light`/`dark`) and a resolved **attribute** the page paints (`light`/`dark`). This task introduces both and makes the pre-paint boot script honour the OS.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js` (append after `fdKeyAction`)
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:4`
- Test: `tests/fd-shell.test.mjs` (append), `tests/theme-boot.test.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `fdThemeMode(stored) -> 'system'|'light'|'dark'` and `fdThemeAttr(mode, prefersDark) -> 'light'|'dark'`, both used by Tasks 2 and 4.

- [ ] **Step 1: Write the failing unit tests**

Append to `tests/fd-shell.test.mjs`. Add `fdThemeMode` and `fdThemeAttr` to the `return {...}` object in the existing `make` call at the top of that file first.

```js
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fd-shell.test.mjs`
Expected: FAIL — `fdThemeMode is not defined`.

- [ ] **Step 3: Implement the two functions**

Append to `frontdoor/fd_shell.js`:

```js
/* Theme has three MODES the learner picks and two ATTRIBUTES the page paints. Storage holds the
   mode so 'system' survives a round trip and the panel can mark it active; documentElement holds
   the resolved attribute so CSS only ever sees light/dark. Collapsing the two -- storing the
   resolved value -- is what made "follow the OS" unexpressible before: the moment you write
   'dark' you have lost the fact that the learner asked for "whatever my phone says".
   An unrecognised stored value reads as system rather than light: a device that never expressed
   a preference should follow its OS, which is the author's 2026-09-10 decision. */
function fdThemeMode(stored){
  return (stored==='light'||stored==='dark'||stored==='system')?stored:'system';
}

function fdThemeAttr(mode, prefersDark){
  if(mode==='light'||mode==='dark') return mode;
  return prefersDark?'dark':'light';
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/fd-shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the failing boot-script test**

Create `tests/theme-boot.test.mjs`. This evaluates the real inline script from the shell rather than pinning its source text, so it tests behaviour and not spelling.

```js
// The theme boot script is the one piece of theme logic that CANNOT import fdThemeMode: it runs
// in <head> before any frontdoor module is injected, because its whole job is painting the right
// attribute before first paint. The duplication is deliberate; this test is what keeps the copy
// honest by exercising it directly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const html = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');

const boot = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.match(boot, /cw_theme/, 'the first inline script should still be the theme boot');

function run({ stored, prefersDark }) {
  let painted = null;
  const localStorage = { getItem: (k) => (k === 'cw_theme' ? stored : null) };
  const document = { documentElement: { setAttribute: (_, v) => { painted = v; } } };
  const window = { matchMedia: (q) => ({ matches: /dark/.test(q) && prefersDark }) };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, window);
  return painted;
}

test('unset follows the OS in both directions', () => {
  assert.equal(run({ stored: null, prefersDark: true }), 'dark');
  assert.equal(run({ stored: null, prefersDark: false }), 'light');
});

test('an explicit stored mode overrides the OS', () => {
  assert.equal(run({ stored: 'light', prefersDark: true }), 'light');
  assert.equal(run({ stored: 'dark', prefersDark: false }), 'dark');
});

test('stored system follows the OS', () => {
  assert.equal(run({ stored: 'system', prefersDark: true }), 'dark');
});

test('a browser without matchMedia still paints something', () => {
  let painted = null;
  const localStorage = { getItem: () => null };
  const document = { documentElement: { setAttribute: (_, v) => { painted = v; } } };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, {});
  assert.equal(painted, 'light', 'no matchMedia must not throw or leave the page unpainted');
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `node --test tests/theme-boot.test.mjs`
Expected: FAIL — unset currently paints `light` even when the OS prefers dark.

- [ ] **Step 7: Replace the boot script**

Replace `spa_index.html` line 4 in full:

```html
<script>(function(){try{var s=localStorage.getItem('cw_theme');var m=(s==='light'||s==='dark'||s==='system')?s:'system';var a=m;if(m==='system'){a=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',a);}catch(e){}})();</script>
```

- [ ] **Step 8: Run both suites**

Run: `node --test tests/theme-boot.test.mjs tests/fd-shell.test.mjs`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add tests/theme-boot.test.mjs tests/fd-shell.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js 13_Faculty_Resources/_automation/site_build/spa_index.html
git commit -m "feat(theme): add a system mode and make unset follow prefers-color-scheme"
```

---

### Task 2: Wire theme as a three-value action

`data-fd-theme` is currently payload-free and the dispatch computes the opposite of the current theme. It becomes a control that carries the mode it selects. Two existing helpers must change with it, and both are traps the spec did not anticipate.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:30` (semantics), `:389-392` (dispatch), `:701-706` (`currentTheme`), `:785-788` (effect), `:813-819` (focus)
- Test: `tests/fd-wire.test.mjs` (append)

**Interfaces:**
- Consumes: `fdThemeMode`, `fdThemeAttr` from Task 1.
- Produces: dispatch of `data-fd-theme="<mode>"` returning `{patch:{}, route:null, effect:{type:'set-theme', mode:<mode>}}`. Note the effect field is now **`mode`**, not `theme`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fd-wire.test.mjs`:

```js
test('the theme action carries the mode it selects', () => {
  const r = F.fdDispatch({ 'data-fd-theme': 'dark' }, { }, { theme: 'light' });
  assert.deepEqual(r.effect, { type: 'set-theme', mode: 'dark' });
  assert.deepEqual(r.patch, {}, 'theme is storage, not state');
  assert.equal(r.route, null, 'a theme change must not push history');
});

test('an unrecognised theme value falls back to system rather than painting garbage', () => {
  const r = F.fdDispatch({ 'data-fd-theme': 'banana' }, { }, { theme: 'light' });
  assert.deepEqual(r.effect, { type: 'set-theme', mode: 'system' });
});

test('selecting the already-active mode is still a valid no-op action', () => {
  const r = F.fdDispatch({ 'data-fd-theme': 'light' }, { }, { theme: 'light' });
  assert.deepEqual(r.effect, { type: 'set-theme', mode: 'light' });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-wire.test.mjs`
Expected: FAIL — the effect is `{type:'set-theme', theme:'dark'}` and the value is ignored.

- [ ] **Step 3: Replace the dispatch branch**

`fd_wire.js:389-392` becomes:

```js
  if(fdOwn(a,'data-fd-theme')){
    /* The value is the MODE, not the painted attribute -- fdApplyEffect resolves it. A missing or
       unknown value reads as 'system' rather than toggling, because this control is three radio
       buttons now: there is no "other one" to flip to. */
    return {patch:{},route:null,
      effect:{type:'set-theme',mode:fdThemeMode(String(a['data-fd-theme']||''))}};
  }
```

- [ ] **Step 4: Update the semantics map**

`fd_wire.js:30` — the string is asserted by `tests/fd-action-contract.test.mjs`:

```js
  'data-fd-theme':'set saved color theme',
```

- [ ] **Step 5: Make `currentTheme()` report the stored mode**

`fd_wire.js:701-706`. This is Trap A: the old body read `documentElement[data-theme]`, which after Task 1 is the *resolved* attribute — so a learner on `system` would see `light` or `dark` marked active in the panel and `system` never highlighted.

```js
  /* Reports the stored MODE, not the painted attribute. Reading documentElement here (as this
     did before the three-way control) cannot distinguish "system, resolving to dark" from
     "explicitly dark", so the panel would never show system as active. Storage is the only place
     the distinction survives; the DOM read remains as a fallback for a blocked-storage browser,
     where 'system' is the honest answer anyway. */
  function currentTheme(){
    try{ return fdThemeMode(localStorage.getItem('cw_theme')); }catch(_){ return 'system'; }
  }
```

- [ ] **Step 6: Resolve the mode in the effect**

`fd_wire.js:785-788`:

```js
    } else if(effect.type==='set-theme'){
      var prefersDark=!!(win&&win.matchMedia&&
        win.matchMedia('(prefers-color-scheme: dark)').matches);
      if(doc&&doc.documentElement)
        doc.documentElement.setAttribute('data-theme',fdThemeAttr(effect.mode,prefersDark));
      try{ localStorage.setItem('cw_theme',effect.mode); }catch(_){}
```

- [ ] **Step 7: Fix the focus restore**

`fd_wire.js:813-819`. This is Trap B: `querySelector('[data-fd-theme]')` returns the **first** match, so with three buttons focus always jumped to "System" no matter which was clicked.

```js
  function focusPostTransition(before, result, changedBase){
    var effect=result&&result.effect;
    if(effect&&effect.type==='set-theme'){
      /* Focus the button that was actually chosen. With one toggle the first match WAS the
         control; with three radio buttons it is always "System", which silently moved focus
         away from the learner's choice on every selection. */
      var sel='[data-fd-theme="'+effect.mode+'"]';
      var themeControl=root&&root.querySelector
        ?(root.querySelector(sel)||root.querySelector('[data-fd-theme]')):null;
      if(themeControl&&themeControl.focus) try{themeControl.focus();}catch(_){}
      return;
    }
```

- [ ] **Step 8: Stop a tool page from pinning a learner's System preference**

Carried into this task by controller ruling — found independently by Task 1's reviewer and Task 1b's
implementer, from different angles, and it becomes live the moment this task lands.

The chain: `spa_index.html:2156-2159` sets `data-theme` from the effect and posts
`{type:'theme',mode:...}` into the tool iframe — necessarily the **resolved** value, never
`'system'`. `question-bank-practice.html:1166-1172` then writes that resolved value into
`cw_theme`. So a learner who picks System and opens a tool has their preference silently pinned to
whatever the theme happened to be at that moment. That defeats the headline setting of this plan.

The asymmetry is the fix. Two directions, only one is a user gesture:

- **Parent → child** (the shell telling an embedded tool what to paint): the child must **apply
  it to the DOM and not write storage**. There is no user gesture here, and since Task 1b every one
  of these pages has its own boot that reads `cw_theme` directly, so the write bought nothing even
  before it started doing harm. Remove the `localStorage.setItem('cw_theme', ...)` from
  `question-bank-practice.html`'s parent-message handler, leaving the `setAttribute`.
- **Child → parent** (a learner clicking a tool's own light/dark button): `spa_index.html:2353`
  persists it, gated on `'dark'||'light'`. **Leave this alone.** A learner clicking an explicit
  light/dark control is legitimately choosing an explicit mode, and both values are valid modes
  under the three-mode scheme.

Note this step's edit is to `d.effect.theme` at `:2156-2159`, which your own change renames to
`d.effect.mode` — make the two consistent.

Write the test first, in `tests/fd-settings.test.mjs`:

```js
// A learner who picks System and opens a tool must still be on System afterwards. The shell can
// only ever push a RESOLVED value into an iframe, so any child that persists what it is pushed
// converts 'system' into a pinned mode — silently, with no user gesture anywhere in the chain.
test('a tool page paints a pushed theme without persisting it', () => {
  const tool = readFileSync(new URL(`${BUILD}/question-bank-practice.html`, import.meta.url), 'utf8');
  const handler = tool.slice(tool.indexOf("'theme'") - 400, tool.indexOf("'theme'") + 400);
  assert.match(handler, /setAttribute\(\s*['"]data-theme['"]/, 'it must still paint');
  assert.doesNotMatch(handler, /setItem\(\s*['"]cw_theme['"]/, 'and must not persist what it was pushed');
});
```

- [ ] **Step 9: Run the wire suite**

Run: `node --test tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add tests/fd-wire.test.mjs tests/fd-settings.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js
git commit -m "feat(theme): dispatch a selected mode instead of toggling, and focus the chosen button"
```

---

### Task 3: The gear replaces the glyph

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js:38-62` (`fdHeader`)
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:6-11`, `:14-36`, `:585-588`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css:162-163`, `:867`, `:868`
- Test: `tests/fd-shell.test.mjs`, `tests/fd-action-contract.test.mjs`, `tests/spa-shell-a11y.test.mjs:117,125`, `tests/smoke/front-door.spec.js:143,245,529,566`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `[data-fd-settings]` button in the header; `sheet:'settings'` as the state value Task 4 renders.

- [ ] **Step 1: Write the failing header test**

Append to `tests/fd-shell.test.mjs`:

```js
test('the header offers settings, not a bare theme toggle', () => {
  const h = F.fdHeader({ week: 3, tab: 'today' });
  assert.match(h, /data-fd-settings/, 'gear must be present');
  assert.doesNotMatch(h, /data-fd-theme/, 'theme moved inside the panel');
  assert.match(h, /aria-label="Settings"/);
});

test('the header still carries exactly three action controls', () => {
  const actions = F.fdHeader({ week: 3, tab: 'today' }).split('fd-header__actions')[1];
  const buttons = actions.match(/<button/g) || [];
  assert.equal(buttons.length, 3, 'week pill, safety, settings — a fourth costs the mobile row');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-shell.test.mjs`
Expected: FAIL — `data-fd-settings` absent, `data-fd-theme` present.

- [ ] **Step 3: Swap the button in `fdHeader`**

In `frontdoor/fd_shell.js`, replace the `fd-themebtn` line inside `fd-header__actions`:

```js
    '<button type="button" class="fd-settingsbtn" data-fd-settings '+
    'aria-label="Settings">⚙</button>'+
```

- [ ] **Step 4: Register the action in all three places in `fd_wire.js`**

In `FD_HANDLED_ATTRS` (`:6-11`) replace `'data-fd-theme'` with `'data-fd-theme','data-fd-settings','data-fd-close-settings'` — `data-fd-theme` stays, it just lives in the panel now.

In `FD_ACTION_SEMANTICS` (`:14-36`) add:

```js
  'data-fd-settings':'open settings panel',
  'data-fd-close-settings':'close settings panel',
```

In the delegated selector string (`:585-588`) add `[data-fd-settings],[data-fd-close-settings],` alongside the others.

- [ ] **Step 5: Add the dispatch branches**

In `fdDispatch`, before the `data-fd-theme` branch:

```js
  if(fdOwn(a,'data-fd-settings')){
    /* Settings is a sheet so it inherits backdrop, dialog semantics, the close button and the
       Escape unwind from fdKeyAction. sheetFrom is not set: settings has no "back to kit" path. */
    return {patch:{sheet:'settings',searchOpen:false},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-close-settings')){
    return {patch:{sheet:null,settingsConfirmClear:false},route:null,effect:null};
  }
```

- [ ] **Step 6: Update the action-contract inventory**

`tests/fd-action-contract.test.mjs:36` — insert into the alphabetical array, between `'data-fd-close-search'` and `'data-fd-close-sheet'`, and after `'data-fd-search'`:

```js
    'data-fd-close-settings',
    'data-fd-settings',
```

- [ ] **Step 7: Rename the button class in CSS**

`frontdoor.css:162` and `:163` — change the selector `.fd-themebtn` to `.fd-settingsbtn` (the declarations are unchanged; the gear reuses the same 34px circle).

`frontdoor.css:867` and `:868` — these coarse-pointer rules name `.fd-themebtn` in a comma list and are what guarantee a 44px touch target. Replace `.fd-themebtn` with `.fd-settingsbtn` in both. **Missing these is a silent a11y regression on phones** — the button shrinks below the touch minimum with no test failure.

- [ ] **Step 8: Update the a11y suite**

`tests/spa-shell-a11y.test.mjs` lists `.fd-themebtn` in two selector arrays, at `:117` and `:125`.
Replace both with `.fd-settingsbtn`. These are the focus-visible and touch-target sweeps — leaving
the old class means the gear is simply absent from both, which passes silently.

- [ ] **Step 9: Update the smoke pins — all four**

`tests/smoke/front-door.spec.js` references the theme control in four places, and two of them are
behavioural rather than cosmetic:

- `:529` and `:566` — `.fd-themebtn` inside selector lists. Rename to `.fd-settingsbtn`.
- `:143` — `await expect(page.locator('[data-fd-theme]')).toBeFocused();`. The theme control now
  lives inside the panel, so this assertion must open the panel first:

```js
  await page.locator('[data-fd-settings]').click();
  await expect(page.locator('[data-fd-theme="dark"]')).toBeFocused();
```

- `:245` — `await page.locator('[data-fd-theme]').click();`. Same restructuring, and note the bare
  locator now matches **three** buttons and would throw under Playwright's strict mode. Target the
  mode explicitly:

```js
  await page.locator('[data-fd-settings]').click();
  await page.locator('[data-fd-theme="dark"]').click();
```

**Do not run the suite here.** Smoke verification is deferred to a single run in Task 8 (author's
decision, 2026-09-10) — `npm ci` in `tests/smoke` is the slowest step in this plan and nothing
between here and Task 8 changes its result. Edit the pins, then move on.

- [ ] **Step 10: Run the node suites and commit**

Run: `node --test tests/*.test.mjs`
Expected: PASS.

```bash
git add tests/fd-shell.test.mjs tests/fd-action-contract.test.mjs tests/smoke/front-door.spec.js 13_Faculty_Resources/_automation/site_build/frontdoor/
git commit -m "feat(shell): replace the theme glyph with a settings gear"
```

---

### Task 4: The settings sheet and its Appearance section

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js` (add `fdSheetSettingsBody`, add branch at `:271`)
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css` (append)
- Test: `tests/fd-settings.test.mjs` (create)

**Interfaces:**
- Consumes: `fdThemeMode` (Task 1); `sheet:'settings'` (Task 3).
- Produces: `fdSheetSettingsBody(state) -> string`. Reads `st.themeMode`, and in later tasks `st.roles`, `st.roleId`, `st.examDate`, `st.analytics`, `st.settingsConfirmClear`.

- [ ] **Step 1: Write the failing tests**

Create `tests/fd-settings.test.mjs`:

```js
// The settings panel is a pure renderer like every other fd_sheet surface: state in, string out.
// Tested directly rather than through the DOM, following tests/fd-sheet.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_shell.js')}
  ${read('frontdoor/fd_sheet.js')}
  return { fdSheetSettingsBody: fdSheetSettingsBody, fdSheet: fdSheet };
`);
const F = make();

const base = { themeMode: 'system' };
const s = (over) => Object.assign({}, base, over);

test('appearance offers all three modes and marks the active one', () => {
  const h = F.fdSheetSettingsBody(s({ themeMode: 'dark' }));
  for (const m of ['system', 'light', 'dark']) {
    assert.match(h, new RegExp(`data-fd-theme="${m}"`), `${m} must be offered`);
  }
  assert.match(h, /data-fd-theme="dark"[^>]*aria-checked="true"/);
  assert.match(h, /data-fd-theme="light"[^>]*aria-checked="false"/);
});

test('system is the active mode when nothing was ever chosen', () => {
  const h = F.fdSheetSettingsBody(s({ themeMode: undefined }));
  assert.match(h, /data-fd-theme="system"[^>]*aria-checked="true"/);
});

test('the sheet renders settings as a dialog with a close control', () => {
  const h = F.fdSheet({}, {}, s({ sheet: 'settings' }));
  assert.match(h, /role="dialog"/);
  assert.match(h, /aria-modal="true"/);
  assert.match(h, /data-fd-close-sheet/, 'reuses the shared sheet close, not a bespoke one');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-settings.test.mjs`
Expected: FAIL — `fdSheetSettingsBody is not defined`.

- [ ] **Step 3: Implement the body and the segmented control**

Append to `frontdoor/fd_sheet.js`:

```js
/* The settings panel. Pure like every other body renderer here: everything it cannot derive --
   the role list, the analytics posture -- arrives on state, the way st.crisisHtml already does.

   Copy rule applies in full: these strings ship to BOTH sites unrebranded. "Exam", never "Shelf".

   Sections are emitted as direct siblings spaced by `.fd-set + .fd-set` (frontdoor.css), matching
   the adjacent-sibling idiom the kit rows use -- no wrapper div between them. */
function fdSettingsSeg(mode){
  var opts=[['system','System'],['light','Light'],['dark','Dark']];
  var cur=fdThemeMode(mode);
  var out='<div class="fd-seg" role="radiogroup" aria-label="Color theme">';
  for(var i=0;i<opts.length;i++){
    var active=(opts[i][0]===cur);
    out+='<button type="button" role="radio" class="fd-seg__btn'+(active?' is-active':'')+'" '+
      'data-fd-theme="'+opts[i][0]+'" aria-checked="'+(active?'true':'false')+'">'+
      opts[i][1]+'</button>';
  }
  return out+'</div>';
}

function fdSettingsSection(title, body){
  return '<section class="fd-set"><h3 class="fd-set__h">'+fdEsc(title)+'</h3>'+body+'</section>';
}

function fdSheetSettingsBody(state){
  var st=state||{};
  var out='<p class="fd-sheet__intro">Everything here is saved on this device only.</p>';
  out+=fdSettingsSection('Appearance',
    fdSettingsSeg(st.themeMode)+
    '<p class="fd-set__note">System follows your device’s light or dark setting.</p>');
  return out;
}
```

- [ ] **Step 4: Add the branch in `fdSheet`**

In `fdSheet`, `frontdoor/fd_sheet.js:271`, the chain becomes:

```js
  if(sheet==='settings'){
    title='Settings';
    body=fdSheetSettingsBody(st);
  } else if(sheet==='kit'){
```

- [ ] **Step 5: Re-add `data-fd-theme` to the emitted-attribute inventory**

`tests/fd-action-contract.test.mjs:36` pins the attributes renderers actually **emit**, not the ones
`fd_wire.js` registers. Task 3 had to remove `'data-fd-theme'` from that array because, between the
gear replacing the header glyph and this task, no renderer emitted it at all. `fdSettingsSeg` emits
it again — so put it back, in alphabetical position.

Run `node --test tests/fd-action-contract.test.mjs` and confirm it is green **because** of the
re-add: it fails without it.

- [ ] **Step 6: Run and watch them pass**

Run: `node --test tests/fd-settings.test.mjs`
Expected: PASS.

- [ ] **Step 7: Supply `themeMode` to the renderer**

The panel reads `st.themeMode`, and nothing sets it yet — `currentTheme()` from Task 2 feeds
dispatch, not render state. In `spa_index.html`'s `fdLiveState`, beside the other additions:

```js
    out.themeMode=fdThemeMode(LS('cw_theme'));
```

Re-run `node --test tests/fd-settings.test.mjs` — without this the panel silently marks System
active for everyone, which is the exact bug Trap A describes, just relocated.

- [ ] **Step 8: Add the CSS**

Append to `frontdoor/frontdoor.css`:

```css
.fd-set + .fd-set{margin-top:18px}
.fd-set__h{margin:0 0 8px;font-size:var(--fd-text-sm);font-weight:600;color:var(--fd-text)}
.fd-set__note{margin:8px 0 0;font-size:var(--fd-text-xs);color:var(--fd-text-mid)}
.fd-seg{display:flex;gap:0;border:1.5px solid var(--fd-line-strong);border-radius:var(--fd-radius-sm);overflow:hidden}
.fd-seg__btn{flex:1;padding:9px 8px;border:0;background:var(--fd-surface);color:var(--fd-text-mid);font:inherit;font-size:var(--fd-text-sm);cursor:pointer}
.fd-seg__btn + .fd-seg__btn{border-left:1.5px solid var(--fd-line-strong)}
.fd-seg__btn:hover{background:var(--fd-teal-wash);color:var(--fd-teal-deep)}
.fd-seg__btn.is-active{background:var(--fd-teal);color:#fff}
@media (pointer:coarse){.fd-seg__btn{min-height:44px}}
```

- [ ] **Step 9: Verify contrast**

Run: `node tests/contrast-check.mjs`
Expected: PASS — `.fd-seg__btn.is-active` is white on `--fd-teal`, the same pairing `.fd-safetybtn` already ships, and `f34e5e4` darkened the primary specifically so white on the fill clears AA. If this reports a failure, use `--fd-teal-deep` for the active fill rather than lightening the text.

- [ ] **Step 10: Commit**

```bash
git add tests/fd-settings.test.mjs tests/fd-action-contract.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css
git commit -m "feat(settings): add the settings sheet with a three-way appearance control"
```

---

### Task 5: The You section — changing role

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js` (`fdSheetSettingsBody`)
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1996` (`fdLiveState`)
- Test: `tests/fd-settings.test.mjs`

**Interfaces:**
- Consumes: `fdSheetSettingsBody` (Task 4).
- Produces: `st.roles` (array of `{id,name,desc,hint}`) and `st.roleId` (raw id) on live state.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fd-settings.test.mjs`:

```js
const ROLES = [
  { id: 'student', name: 'Core rotation', desc: 'The six-week inpatient rotation', hint: 'most common' },
  { id: 'staff', name: 'Nursing · SW · family', desc: 'Unit staff and families', hint: '' },
];

test('role chips render from the supplied list and mark the stored id', () => {
  const h = F.fdSheetSettingsBody(s({ roles: ROLES, roleId: 'staff' }));
  assert.match(h, /data-fd-role="student"/);
  assert.match(h, /data-fd-role="staff"[^>]*aria-checked="true"/);
  assert.match(h, /data-fd-role="student"[^>]*aria-checked="false"/);
});

test('the role section is absent when the caller supplied no list', () => {
  assert.doesNotMatch(F.fdSheetSettingsBody(s({})), /data-fd-role=/);
});

// Author decision, 2026-09-10: role ships unexplained — no sublabel describing its effect, and
// therefore no save confirmation either. A visible "Saved" against a change the learner cannot
// find anywhere promises more than happened; the chip's own selected state is the feedback.
test('role offers no explanation and no save confirmation', () => {
  const h = F.fdSheetSettingsBody(s({ roles: ROLES, roleId: 'staff' }));
  assert.doesNotMatch(h, /greeting/i);
  assert.doesNotMatch(h, /\bSaved\b/);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-settings.test.mjs`
Expected: FAIL — no `data-fd-role` in the panel.

- [ ] **Step 3: Add the section**

In `fdSheetSettingsBody`, before the Appearance section:

```js
  var roles=st.roles||[];
  if(roles.length){
    var chips='<div class="fd-chips" role="radiogroup" aria-label="Who you are">';
    for(var i=0;i<roles.length;i++){
      var r=roles[i]||{}, on=(r.id===st.roleId);
      chips+='<button type="button" role="radio" class="fd-chip'+(on?' is-active':'')+'" '+
        'data-fd-role="'+fdEsc(r.id)+'" aria-checked="'+(on?'true':'false')+'">'+
        fdEsc(r.name)+'</button>';
    }
    out+=fdSettingsSection('You', chips+'</div>');
  }
```

- [ ] **Step 4: Supply the state**

`spa_index.html:1996` currently reads `out.role=fdRoleName(out.role)||out.role;`. The raw id must be captured **before** that line overwrites it:

```js
    out.roleId=out.role;
    out.roles=FD_ROLES;
    out.role=fdRoleName(out.role)||out.role;
```

- [ ] **Step 5: Confirm the dispatch already works**

`fd_wire.js:348` already handles `data-fd-role` — but it also patches `screen:'setup-week'`, which would throw the learner into the wizard. Change it to respect where it was invoked from:

```js
  if(fdOwn(a,'data-fd-role')){
    var picked=String(a['data-fd-role']||'');
    /* From the panel the learner is changing a setting, not walking the wizard: stay put. The
       wizard's own chips reach this with screen==='setup-role', and only those advance. */
    if(s.screen==='setup-role') return {patch:{role:picked,screen:'setup-week'},route:null,effect:null};
    return {patch:{role:picked},route:null,effect:null};
  }
```

- [ ] **Step 6: Repair the existing assertion this breaks**

`tests/fd-wire.test.mjs:186-187` asserts the patch deep-equals `{role:'second-role',
screen:'setup-week'}` while passing `{}` as state — so `s.screen` is `undefined` and the new fork
returns `{role:'second-role'}` alone. The old assertion was testing the wizard while describing
neither screen, which is why it silently covered both paths. Give it the screen it means:

```js
  assert.deepEqual(F.fdDispatch({ 'data-fd-role': 'second-role' }, { screen: 'setup-role' }, roleContext).patch,
    { role: 'second-role', screen: 'setup-week' });
```

- [ ] **Step 7: Write the regression test for that fork**

Append to `tests/fd-wire.test.mjs`:

```js
test('picking a role in the wizard advances; picking one in settings does not', () => {
  const wizard = F.fdDispatch({ 'data-fd-role': 'subi' }, { screen: 'setup-role' }, {});
  assert.equal(wizard.patch.screen, 'setup-week');

  const panel = F.fdDispatch({ 'data-fd-role': 'subi' }, { screen: 'app', sheet: 'settings' }, {});
  assert.equal(panel.patch.role, 'subi');
  assert.equal(panel.patch.screen, undefined, 'changing a setting must not reopen the wizard');
});
```

- [ ] **Step 8: Run and commit**

Run: `node --test tests/fd-settings.test.mjs tests/fd-wire.test.mjs`
Expected: PASS.

```bash
git add tests/fd-settings.test.mjs tests/fd-wire.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor/ 13_Faculty_Resources/_automation/site_build/spa_index.html
git commit -m "feat(settings): let a learner change role without clearing site data"
```

---

### Task 6: The Pacing section — move the exam date out of Progress

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js` (dispatch + effect)
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1730` (remove), `:2300` (handler), `fdLiveState`
- Test: `tests/fd-settings.test.mjs`

**Interfaces:**
- Consumes: `fdSheetSettingsBody` (Task 4).
- Produces: `st.examDate` (an ISO `YYYY-MM-DD` string or `''`); effect `{type:'set-exam-date', date:<string>}`.

- [ ] **Step 1: Write the failing tests**

```js
test('the exam date renders as a date input carrying the stored value', () => {
  const h = F.fdSheetSettingsBody(s({ examDate: '2026-10-30' }));
  assert.match(h, /type="date"/);
  assert.match(h, /value="2026-10-30"/);
  assert.match(h, /data-fd-exam-date/);
});

test('an unset exam date renders an empty input, not a guess', () => {
  assert.match(F.fdSheetSettingsBody(s({})), /data-fd-exam-date[^>]*value=""/);
});

// Copy rule: these strings ship to both sites. "Exam", never "Shelf".
test('pacing copy stays audience-neutral', () => {
  const h = F.fdSheetSettingsBody(s({ examDate: '' }));
  assert.doesNotMatch(h, /shelf|clerkship|resident|student/i);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-settings.test.mjs`
Expected: FAIL — no `data-fd-exam-date`.

- [ ] **Step 3: Add the section**

In `fdSheetSettingsBody`, after the You section:

```js
  out+=fdSettingsSection('Pacing',
    '<label class="fd-set__label" for="fdSetExam">Exam date</label>'+
    '<input id="fdSetExam" class="fd-set__date" type="date" data-fd-exam-date '+
    'value="'+fdEsc(st.examDate||'')+'">'+
    '<p class="fd-set__note">Used on this device to pace what Today suggests.</p>');
```

- [ ] **Step 4: Wire the change event**

`data-fd-exam-date` is an `<input>`, not a button, so it needs a `change` listener rather than the delegated click handler. In `fdWire`'s event setup, alongside the existing search-input listener:

```js
    if(root&&root.addEventListener){
      root.addEventListener('change',function(ev){
        var t=ev&&ev.target;
        if(!t||!t.getAttribute||t.getAttribute('data-fd-exam-date')===null) return;
        apply(fdDispatch({'data-fd-exam-date':String(t.value||'')},state,context()),null);
      });
    }
```

Register `'data-fd-exam-date'` in `FD_HANDLED_ATTRS`, add `'data-fd-exam-date':'set exam date'` to `FD_ACTION_SEMANTICS`, and add it to `tests/fd-action-contract.test.mjs:36` in alphabetical position. Note that array pins
**emitted** attributes, and `data-fd-close-settings` no longer exists — Task 3 removed it as dead
registration, so do not look for it as an anchor.

- [ ] **Step 5: Add dispatch and effect**

Dispatch:

```js
  if(fdOwn(a,'data-fd-exam-date')){
    var raw=String(a['data-fd-exam-date']||'');
    /* Only an ISO calendar date or the empty string reaches storage. phase_policy.js parses this
       as the repo's single sanctioned local-midnight site; anything else would make it NaN and
       silently disable pacing rather than failing visibly. */
    var ok=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:'';
    return {patch:{examDate:ok},route:null,effect:{type:'set-exam-date',date:ok}};
  }
```

Effect, in `fdApplyEffect`:

```js
    } else if(effect.type==='set-exam-date'){
      try{
        if(effect.date) localStorage.setItem('cw_shelf_date',effect.date);
        else localStorage.removeItem('cw_shelf_date');
      }catch(_){}
```

- [ ] **Step 6: Supply the state and remove the Progress copy**

In `fdLiveState`, beside `out.roleId`:

```js
    out.examDate=LS('cw_shelf_date')||'';
```

Delete the `fd-examdate` block at `spa_index.html:1730` and replace it with a link:

```js
    h+='<div class="hm-sec"><h2>Exam date</h2><div class="sub">Set it in Settings — the gear in the top bar.</div></div>';
```

Then delete the `pa==='save-exam'` branch at `spa_index.html:2300`, leaving the `pa==='progress'` branch intact.

- [ ] **Step 7: Prove the old control is gone**

Append to `tests/fd-settings.test.mjs`:

```js
// Two homes for one key silently desync — fd_state.js:17 records the same rule for progress.
// This is the assertion that keeps the move a move rather than a copy.
test('the exam date has exactly one home', () => {
  const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /id="fdExamDate"/, 'the Progress input must be gone, not hidden');
  assert.doesNotMatch(shell, /save-exam/, 'and its handler with it');
});
```

- [ ] **Step 8: Run and commit**

Run: `node --test tests/*.test.mjs`
Expected: PASS.

```bash
git add tests/ 13_Faculty_Resources/_automation/site_build/
git commit -m "feat(settings): move the exam date from Progress into Settings"
```

---

### Task 7: Your data — export link and a two-tap clear

This is the task that costs a baseline bump. Read the spec's ratchet section before starting.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js`, `frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/qa-baseline.json`
- Test: `tests/fd-settings.test.mjs`, `tests/fd-wire.test.mjs`

**Interfaces:**
- Consumes: `fdSheetSettingsBody` (Task 4).
- Produces: `st.settingsConfirmClear` (boolean); effects `{type:'clear-device-data'}` and the confirm patch.

- [ ] **Step 1: Write the failing renderer tests**

```js
test('clearing is two-tap: the confirm replaces the button rather than sitting beside it', () => {
  const calm = F.fdSheetSettingsBody(s({}));
  assert.match(calm, /data-fd-clear-ask/);
  assert.doesNotMatch(calm, /data-fd-clear-confirm/, 'no armed control before the first tap');

  const armed = F.fdSheetSettingsBody(s({ settingsConfirmClear: true }));
  assert.match(armed, /data-fd-clear-confirm/);
  assert.doesNotMatch(armed, /data-fd-clear-ask/, 'the first button must be replaced, not kept');
  assert.match(armed, /data-fd-clear-cancel/);
});

test('the confirm names what will be destroyed', () => {
  const armed = F.fdSheetSettingsBody(s({ settingsConfirmClear: true }));
  for (const word of ['progress', 'cards', 'answers']) {
    assert.match(armed, new RegExp(word, 'i'), `the confirm must name ${word}`);
  }
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-settings.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the section**

```js
  var danger=st.settingsConfirmClear
    ?('<p class="fd-set__note fd-set__note--warn">This erases your progress, practice answers, '+
      'review cards and preferences on this device. It cannot be undone.</p>'+
      '<div class="fd-set__row">'+
      '<button type="button" class="fd-btn--ghost" data-fd-clear-cancel>Keep my data</button>'+
      '<button type="button" class="fd-set__danger" data-fd-clear-confirm>Erase everything</button>'+
      '</div>')
    :'<button type="button" class="fd-set__danger" data-fd-clear-ask>Clear everything on this device</button>';

  out+=fdSettingsSection('Your data',
    '<button type="button" class="fd-set__link" data-fd-progress>Export my anonymous progress</button>'+
    danger);
```

- [ ] **Step 4: Register the three attributes**

Add `'data-fd-clear-ask'`, `'data-fd-clear-confirm'`, `'data-fd-clear-cancel'` to `FD_HANDLED_ATTRS`, the semantics map (`'arm device data erase'`, `'erase device data'`, `'cancel device data erase'`), the delegated selector string, and `tests/fd-action-contract.test.mjs:36` in alphabetical position.

- [ ] **Step 5: Add dispatch — and disarm the confirm on the ONLY close path**

Task 3 established that the settings sheet has exactly one close route: the shared
`data-fd-close-sheet`, emitted by `fdSheetHead` and by the backdrop. There is no
`data-fd-close-settings` — Task 3 removed that registration precisely because nothing emits it.

So the `data-fd-close-sheet` dispatch must also clear `settingsConfirmClear`. Without it, a learner
arms "Erase everything", closes the panel by any route, reopens it, and finds the destructive
confirm still armed — one stray tap from a wipe they never re-authorised. Add
`settingsConfirmClear:false` to that branch's patch, and pin it:

```js
test('closing the panel disarms the erase confirm', () => {
  const r = F.fdDispatch({ 'data-fd-close-sheet': '' }, { sheet: 'settings', settingsConfirmClear: true }, {});
  assert.equal(r.patch.settingsConfirmClear, false,
    'a destructive confirm must never survive a close and reopen');
});
```

Then the panel's own three:

```js
  if(fdOwn(a,'data-fd-clear-ask')) return {patch:{settingsConfirmClear:true},route:null,effect:null};
  if(fdOwn(a,'data-fd-clear-cancel')) return {patch:{settingsConfirmClear:false},route:null,effect:null};
  if(fdOwn(a,'data-fd-clear-confirm')){
    return {patch:{settingsConfirmClear:false},route:null,effect:{type:'clear-device-data'}};
  }
```

- [ ] **Step 6: Write the completeness test — the load-bearing one**

Append to `tests/fd-wire.test.mjs`:

```js
// This is the test that makes "cleared" true rather than asserted. It seeds a cw_* key that
// appears in NO source file: an implementation that enumerates known literals would pass every
// other assertion here and still leave this one behind, which is the silent-shrink class in
// docs/SILENT_SHRINK_CHECKLIST.md — a check reporting success over a smaller set than it claims.
test('clearing removes every namespaced key, including one no source file mentions', () => {
  const store = {
    cw_progress_v1: '{}', cw_srs_v1: '{}', rp_flags: '[]',
    cw_a_key_invented_by_a_future_feature_v9: '1',
    'unrelated-third-party': 'keep me',
  };
  const fake = {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i],
    getItem: (k) => (k in store ? store[k] : null),
    removeItem: (k) => { delete store[k]; },
  };
  F.fdClearDeviceData(fake);
  assert.deepEqual(Object.keys(store), ['unrelated-third-party'],
    'every cw_*/rp_* key must go, and nothing else may');
});

test('clearing survives a browser that throws on storage access', () => {
  const hostile = { get length() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => F.fdClearDeviceData(hostile));
});
```

- [ ] **Step 7: Implement the clear**

In `frontdoor/fd_wire.js`, as a top-level function so the test can reach it:

```js
/* Collects first, deletes second: removeItem() reindexes the store, so deleting inside a forward
   walk of localStorage.key(i) skips every other match.

   The computed removeItem() below is deliberate and costs a qa-baseline.json bump (see
   docs/superpowers/specs/2026-09-10-settings-panel-design.md). The alternative -- a literal list
   of the twenty-six keys reachable as literals today -- would silently miss every key added
   later and still report success, which is a privacy bug, not a style choice. */
function fdClearDeviceData(store){
  var doomed=[], i, k;
  try{
    for(i=0;i<store.length;i++){
      k=store.key(i);
      if(typeof k==='string'&&(k.indexOf('cw_')===0||k.indexOf('rp_')===0)) doomed.push(k);
    }
    for(i=0;i<doomed.length;i++) store.removeItem(doomed[i]);
  }catch(_){ }
}
```

Add the effect in `fdApplyEffect`:

```js
    } else if(effect.type==='clear-device-data'){
      fdClearDeviceData(localStorage);
      if(win&&win.location&&win.location.reload) win.location.reload();
```

- [ ] **Step 8: Pin the faculty-preview safety property**

`meaningfulResult()` exempts only `set-theme`, so `clear-device-data` is blocked under faculty preview for free. Pin it so a future refactor cannot quietly change that:

```js
test('erasing device data is blocked in faculty preview', () => {
  const r = F.fdDispatch({ 'data-fd-clear-confirm': '' }, {}, {});
  assert.equal(r.effect.type, 'clear-device-data');
  assert.equal(F.meaningfulResult(r), true,
    'must be "meaningful" so previewActive() locks it — only set-theme is exempt');
});
```

Export `meaningfulResult` from the test harness's `return {...}` if it is not already reachable; if it is module-private, assert instead that `fd_wire.js` source still reads `r.effect.type!=='set-theme'` and nothing broader.

- [ ] **Step 9: Build, then bump the baseline deliberately**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```

Expected: HARD failure naming `computed-key` — count 8 against baseline 7. That failure is the design working. Record the new counts:

```bash
UPDATE_BASELINE=1 bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
UPDATE_BASELINE=1 bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git diff 13_Faculty_Resources/_automation/site_build/qa-baseline.json
```

The diff must be exactly `+1` on `computed-key` for each site — ms3 7→8, res 10→11. **Any other change means something else regressed and the bump is hiding it.** Stop and investigate rather than committing.

- [ ] **Step 10: Commit**

```bash
git add tests/ 13_Faculty_Resources/_automation/site_build/
git commit -m "feat(settings): add a two-tap clear for device data

Costs one computed-key on the qa-baseline ratchet. Paid deliberately: an
enumerated literal list would miss keys added later and still report
success, which is the silent-shrink class, not a style preference."
```

---

### Task 8: The Usage section — conditional and honest

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js`, `frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (`fdLiveState`)
- Test: `tests/fd-settings.test.mjs`

**Interfaces:**
- Consumes: `fdSheetSettingsBody` (Task 4).
- Produces: `st.analytics` — either `null` (emitter absent) or `{optedIn:boolean, privacySignal:boolean}`.

- [ ] **Step 1: Write the failing tests**

```js
test('no usage section when the emitter did not ship', () => {
  assert.doesNotMatch(F.fdSheetSettingsBody(s({ analytics: null })), /data-fd-analytics/);
  assert.doesNotMatch(F.fdSheetSettingsBody(s({})), /usage/i);
});

test('an opted-in learner can opt out', () => {
  const h = F.fdSheetSettingsBody(s({ analytics: { optedIn: true, privacySignal: false } }));
  assert.match(h, /data-fd-analytics="off"/);
});

test('an opted-out learner can opt back in', () => {
  const h = F.fdSheetSettingsBody(s({ analytics: { optedIn: false, privacySignal: false } }));
  assert.match(h, /data-fd-analytics="on"/);
});

// enabled() is false for two different reasons and the panel must not conflate them: a learner
// excluded by their browser's DNT/GPC did not make that choice here and cannot change it here.
test('a browser privacy signal is explained, not rendered as an unchecked box', () => {
  const h = F.fdSheetSettingsBody(s({ analytics: { optedIn: false, privacySignal: true } }));
  assert.match(h, /browser/i, 'must say the browser is the one deciding');
  assert.doesNotMatch(h, /data-fd-analytics=/, 'and must offer no control it cannot honour');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/fd-settings.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the section**

```js
  var an=st.analytics;
  if(an){
    var usage;
    if(an.privacySignal){
      usage='<p class="fd-set__note">Your browser asks sites not to measure usage, so this '+
        'device is already excluded. Nothing is counted.</p>';
    } else {
      usage='<p class="fd-set__note">Anonymous counts of which pages get opened, by week. '+
        'No identity, no text, nothing you typed.</p>'+
        '<button type="button" class="fd-set__link" data-fd-analytics="'+
        (an.optedIn?'off':'on')+'">'+
        (an.optedIn?'Stop counting my visits':'Count my visits')+'</button>';
    }
    out+=fdSettingsSection('Usage', usage);
  }
```

- [ ] **Step 4: Register and dispatch**

Add `'data-fd-analytics'` to `FD_HANDLED_ATTRS`, `'data-fd-analytics':'set usage measurement'` to the semantics map, the selector string, and `tests/fd-action-contract.test.mjs:36` (alphabetically first among the new ones — before `data-fd-back`).

```js
  if(fdOwn(a,'data-fd-analytics')){
    return {patch:{},route:null,
      effect:{type:'set-analytics',on:String(a['data-fd-analytics'])==='on'}};
  }
```

Effect:

```js
    } else if(effect.type==='set-analytics'){
      /* Delegated to the emitter rather than writing cw_analytics_optout_v1 directly: analytics.js
         owns that key's shape, and a second writer is how the two drift. */
      if(win&&win.cwAnalytics){
        if(effect.on) win.cwAnalytics.optIn(); else win.cwAnalytics.optOut();
      }
```

- [ ] **Step 5: Supply the state**

In `fdLiveState`:

```js
    /* null when CLERKSHIP_ANALYTICS left the emitter out of this build entirely — the panel then
       says nothing at all, rather than describing collection that is not happening. */
    out.analytics=window.cwAnalytics
      ?{optedIn:window.cwAnalytics.enabled(),
        privacySignal:(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)}
      :null;
```

- [ ] **Step 6: Run everything**

```bash
node --test tests/*.test.mjs
bash bin/verify.sh
```

Expected: both PASS. `verify.sh` takes ~90s; background it to a log and poll.

- [ ] **Step 7: Build both sites and check the gate**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: PASS on both, with `computed-key` at its newly recorded baseline.

- [ ] **Step 8: Run the smoke suite — with one exposure already named**

```bash
cd tests/smoke && npm ci && npx playwright test
```

Expected: PASS — **except** that `rotation-edition-v2.spec.js` may be red for a reason this plan
already knows about, and it must not be read as unrelated flake.

Task 1's review established the chain: `rotation-edition-v2.spec.js:2044-2047` opens browser
contexts with `colorScheme:'dark'`, and `rotation-edition-fixture.js:297-311` seeds
`cw_rotation_start`, `cw_frontdoor_v1` and `cw_progress_v1` — **not** `cw_theme`.
`rotation-curator.html` contains no `cw_theme`, so `apply_dark_mode()` injects the new `THEME_INIT`
into it, and since Task 1 that resolves unset through `prefers-color-scheme`. Those contexts
therefore paint **dark** where they used to paint light, and the spec's `renderedContrast(...) >= 4.5`
assertions at `:2148-2152`, `:2176-2180` and `:2210-2212` will measure the dark palette for the
first time.

Decide, do not guess:
- **Seed it** — add `cw_theme: 'light'` to the dark contexts' seed, preserving what those tests
  were actually written to measure (edition/layout behaviour, not theme), or
- **Accept the coverage** — let them measure dark and fix any real contrast failures they find.

The second is more valuable and more expensive. Note the branch's three commits before this work
were palette edits (`f34e5e4 a11y(palette): darken --primary so white on the fill clears AA`), so
dark-theme contrast is not a settled surface. Either way, say in the PR body which you chose.

- [ ] **Step 9: Commit**

```bash
git add tests/ 13_Faculty_Resources/_automation/site_build/
git commit -m "feat(settings): surface the analytics opt-out where the emitter actually ships"
```

---

## Done when

- `node --test tests/*.test.mjs` passes.
- `bash bin/verify.sh` passes.
- Both builds pass `build_and_check.sh` with `qa-baseline.json` changed by exactly `computed-key +1` per site.
- `cd tests/smoke && npx playwright test` passes.
- The PR body states the baseline bump and why, per the spec's ratchet section.
