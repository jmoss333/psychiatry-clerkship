# Ward Mode Sidebar Panel — Collapse to a Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the sidebar's always-expanded "Ward mode" panel into a single toggle button that
reveals the mode switcher and recommendations only on click, so the nav tree isn't pushed below the
fold by default.

**Architecture:** `renderModeCompanion()` in the shared SPA shell (`spa_index.html`) gains a new
`<button class="mc-toggle">` header that wraps its existing output in a `<div id="mcBody" hidden>`.
An in-memory `mcOpen` boolean (not persisted) tracks open/closed state; the toggle button flips it
and shows/hides `#mcBody` directly, while mode-pill clicks continue to fully re-render the panel as
they do today, reading `mcOpen` so switching modes never collapses an open panel.

**Tech Stack:** Vanilla ES5-style JS + CSS inside one HTML file (no framework, no build step for the
shell itself beyond the existing `build_and_check.sh` copy); `@playwright/test` 1.46.1 for browser
verification, run against the built sites via `tests/smoke/start-local-servers.sh`.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-07-23-ward-mode-sidebar-button-design.md`). Every
task's requirements implicitly include this section.

- **No persistence.** `mcOpen` is an in-memory variable only — never written to localStorage. Every
  fresh page load starts collapsed.
- **The toggle's label always reflects the current mode**, e.g. `Ward mode` / `Shelf mode` — same
  text `cfg.label + ' mode'` the old `.mc-title` used to show.
- **Disclosure pattern:** a real `<button>` + `aria-expanded`/`aria-controls` + a rotating chevron —
  matching this file's existing `makeCollapsible()`/`.sec-c` pattern. Do NOT use the native
  `<details>/<summary>` element.
- **Switching mode never collapses an open panel.** `mcOpen` is read, not reset, by every
  `renderModeCompanion()` call (mode-pill clicks fully re-render the panel's HTML).
- **Blast radius:** `13_Faculty_Resources/_automation/site_build/spa_index.html` and
  `tests/smoke/{mode-companion.spec.js,playwright.config.js,faculty-console.spec.js}` only. Do NOT
  modify `dashboardMode()`, `DASH_CONFIG`, `renderWardDashboard()`, or any mobile-drawer logic.
- **Visual regression baselines will go stale — that's expected, not a bug to fix here.**
  `tests/smoke/baseline/sidebar-desktop.png` and `sidebar-mobile.png` are NOT part of this plan.
  Regenerating them requires the "Refresh visual baselines" GitHub Actions `workflow_dispatch`
  (Ubuntu/Chromium) run manually against this branch after it's pushed — never a local Playwright
  run (font rendering differs enough to produce false diffs).
- **Style:** match the file's existing idiom — single-quoted JS string literals, `esc()` on every
  interpolated value, `+=`-built HTML strings, one delegated `click` listener per section, and the
  existing Clinical Warm CSS custom properties (`var(--text)`, `var(--text-light)`,
  `var(--accent-light)`, `var(--accent-dark)`, `var(--border)`, `var(--surface)`).

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `13_Faculty_Resources/_automation/site_build/spa_index.html` | Shared SPA shell — mode-companion CSS + `renderModeCompanion()` | Modify |
| `tests/smoke/mode-companion.spec.js` | Browser coverage for collapse/expand/mode-switch/reload behavior | Create |
| `tests/smoke/playwright.config.js` | Registers the new spec under the `nav-ms3`/`nav-res` projects | Modify |
| `tests/smoke/faculty-console.spec.js` | Two learner-preview tests that touch `#modeCompanion` directly and assume it's always expanded | Modify |

Two tasks. Task 1 builds the feature and its own dedicated coverage. Task 2 repairs the two
pre-existing tests Task 1's behavior change breaks, then runs the full relevant regression.

---

### Task 1: Collapsible toggle for the mode-companion panel

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:41-43` (CSS), `:1269-1284`
  (`renderModeCompanion()` + its click handler)
- Create: `tests/smoke/mode-companion.spec.js`
- Modify: `tests/smoke/playwright.config.js:41,46`

**Interfaces:**
- Produces: `#modeCompanion .mc-toggle` (a `<button>` with `aria-expanded` and
  `aria-controls="mcBody"`), `.mc-toggle .mc-toggle-t` (the `<span>` holding the text
  `"{Mode} mode"`), `#mcBody.mc-body` (the collapsible wrapper — carries a `hidden` attribute when
  collapsed), and a module-scope `mcOpen` boolean that `renderModeCompanion()` reads on every call.

- [ ] **Step 1: Write the failing spec**

Create `tests/smoke/mode-companion.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('cw_dashboard_v1');
  });
});

async function gotoReady(page, baseURL) {
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#nav .navitem', { timeout: 15_000 });
  await page.waitForTimeout(400);
}

test('mode companion starts collapsed and expands/collapses on click', async ({ page, baseURL }) => {
  await gotoReady(page, baseURL);

  const toggle = page.locator('#modeCompanion .mc-toggle');
  const body = page.locator('#modeCompanion .mc-body');

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle.locator('.mc-toggle-t')).toHaveText('Ward mode');
  await expect(body).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toBeVisible();
  await expect(page.locator('#modeCompanion [data-mc-mode="ward"]')).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();
});

test('switching mode while expanded stays expanded and updates the toggle label', async ({ page, baseURL }) => {
  await gotoReady(page, baseURL);

  const toggle = page.locator('#modeCompanion .mc-toggle');
  await toggle.click();
  await expect(page.locator('#modeCompanion .mc-body')).toBeVisible();

  await page.locator('#modeCompanion [data-mc-mode="shelf"]').click();

  await expect(toggle.locator('.mc-toggle-t')).toHaveText('Shelf mode');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#modeCompanion .mc-body')).toBeVisible();
  await expect(page.locator('#modeCompanion [data-mc-mode="shelf"]')).toHaveClass(/on/);
});

test('a fresh reload always starts collapsed, even after a prior session expanded it', async ({ page, baseURL }) => {
  await gotoReady(page, baseURL);

  await page.locator('#modeCompanion .mc-toggle').click();
  await expect(page.locator('#modeCompanion .mc-body')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav .navitem', { timeout: 15_000 });
  await page.waitForTimeout(400);

  await expect(page.locator('#modeCompanion .mc-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#modeCompanion .mc-body')).toBeHidden();
});
```

- [ ] **Step 2: Register the spec in the Playwright config**

In `tests/smoke/playwright.config.js`, the `nav-ms3` project currently reads:

```javascript
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'qbank-retired.spec.js', 'aria-live.spec.js'],
```

Change it to:

```javascript
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'qbank-retired.spec.js', 'aria-live.spec.js', 'mode-companion.spec.js'],
```

The `nav-res` project currently reads:

```javascript
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js'],
```

Change it to:

```javascript
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'mode-companion.spec.js'],
```

- [ ] **Step 3: Build both sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both print `build_and_check: <site> OK`.

- [ ] **Step 4: Install Playwright deps and start local servers**

```bash
cd tests/smoke && npm ci && cd ../..
bash tests/smoke/start-local-servers.sh
```

Expected: ends with three `Ready` lines (ms3/res/faculty) and a `Stop with: kill <pid> <pid> <pid>`
line — copy those PIDs, they're needed in Step 10.

- [ ] **Step 5: Run the new spec to confirm it fails**

```bash
cd tests/smoke && npx playwright test mode-companion.spec.js --project=nav-ms3 --project=nav-res && cd ../..
```

Expected: FAIL — `#modeCompanion .mc-toggle` matches 0 elements, so
`expect(toggle).toHaveAttribute('aria-expanded', 'false')` times out. The panel doesn't have a
toggle yet.

- [ ] **Step 6: Implement the CSS**

In `13_Faculty_Resources/_automation/site_build/spa_index.html`, the mode-companion CSS block opens
with these three rules:

```css
  .mode-companion{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:10px;margin:0 0 12px;box-shadow:0 1px 3px rgba(59,51,44,.08)}
  .mc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
  .mc-title{font-size:.68rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--text-light)}
```

Replace those three lines with:

```css
  .mode-companion{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:0;margin:0 0 12px;box-shadow:0 1px 3px rgba(59,51,44,.08);overflow:hidden}
  .mc-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;border:none;background:transparent;color:var(--text);font:inherit;font-weight:900;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;padding:10px;cursor:pointer}
  .mc-toggle:hover{background:var(--accent-light);color:var(--accent-dark)}
  .mc-chev{display:inline-block;color:var(--text-light);transition:transform .15s}
  .mc-toggle[aria-expanded="true"] .mc-chev{transform:rotate(90deg)}
  .mc-body{padding:0 10px 10px}
  .mc-body[hidden]{display:none}
  .mc-head{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:0 0 8px}
```

(`.mc-title` is deleted outright — nothing emits that class after Step 7. `.mc-head` is kept, just
right-aligned now that it holds only the "Progress" button. `padding:0` moves onto `.mc-toggle`/
`.mc-body` so the toggle can span the full card edge-to-edge; `overflow:hidden` keeps the toggle's
hover background from squaring off the card's rounded corners.)

- [ ] **Step 7: Implement the JS**

In the same file, `renderModeCompanion()` and its click handler currently read:

```javascript
  function renderModeCompanion(){
    var root=document.getElementById('modeCompanion'); if(!root)return;
    var mode=dashboardMode(), cfg=dashCfg(mode), modes=[['ward','Ward'],['shelf','Shelf'],['family','Family'],['safety','Safety'],['5min','5 min']];
    var matches=itemsForMode(mode), tools=toolsForMode(mode,matches), pages=matches.slice(0,3);
    var h='<div class="mc-head"><div class="mc-title">'+esc(cfg.label)+' mode</div><button type="button" class="mc-home" data-mc-home="1">Progress</button></div>';
    h+='<div class="mc-modes">'+modes.map(function(m){return '<button type="button" class="mc-mode'+(mode===m[0]?' on':'')+'" data-mc-mode="'+m[0]+'" aria-pressed="'+(mode===m[0]?'true':'false')+'">'+m[1]+'</button>';}).join('')+'</div>';
    h+='<div class="mc-section"><div class="mc-label">Pages</div><div class="mc-list">'+(pages.length?pages.map(function(x){return companionButton(x,'page');}).join(''):'<div class="mc-empty">Recommendations load after navigation data is ready.</div>')+'</div></div>';
    h+='<div class="mc-section"><div class="mc-label">Tools</div><div class="mc-list">'+(tools.length?tools.slice(0,3).map(function(x){return companionButton(x,'tool');}).join(''):'<div class="mc-empty">No mode tools yet.</div>')+'</div></div>';
    root.innerHTML=h;
  }
  window.__renderModeCompanion=renderModeCompanion;
  (function(){ var root=document.getElementById('modeCompanion'); if(!root)return; root.addEventListener('click',function(e){
    var mb=e.target.closest?e.target.closest('[data-mc-mode]'):null; if(mb){ setDashboardMode(mb.getAttribute('data-mc-mode')); if(currentItem&&currentItem.f==='__home__'&&window.renderHome){ contentEl.innerHTML=window.renderHome(); try{window.__afterSpecial('__home__');}catch(_){ } } else if(currentItem&&currentItem.k==='md'){ var nb=null, all=navEl.querySelectorAll('.navitem'); for(var i=0;i<all.length;i++){ if(all[i].getAttribute('data-f')===currentItem.f){ nb=all[i]; break; } } show(currentItem,nb,{replace:true}); } return; }
    var home=e.target.closest?e.target.closest('[data-mc-home]'):null; if(home){ navClick('__home__'); return; }
    var item=e.target.closest?e.target.closest('[data-mc-f]'):null; if(item){ navClick(item.getAttribute('data-mc-f')); }
  }); })();
```

Replace that whole block with:

```javascript
  var mcOpen=false;
  function renderModeCompanion(){
    var root=document.getElementById('modeCompanion'); if(!root)return;
    var mode=dashboardMode(), cfg=dashCfg(mode), modes=[['ward','Ward'],['shelf','Shelf'],['family','Family'],['safety','Safety'],['5min','5 min']];
    var matches=itemsForMode(mode), tools=toolsForMode(mode,matches), pages=matches.slice(0,3);
    var h='<button type="button" class="mc-toggle" aria-expanded="'+(mcOpen?'true':'false')+'" aria-controls="mcBody"><span class="mc-toggle-t">'+esc(cfg.label)+' mode</span><span class="mc-chev" aria-hidden="true">▸</span></button>';
    h+='<div id="mcBody" class="mc-body"'+(mcOpen?'':' hidden')+'>';
    h+='<div class="mc-head"><button type="button" class="mc-home" data-mc-home="1">Progress</button></div>';
    h+='<div class="mc-modes">'+modes.map(function(m){return '<button type="button" class="mc-mode'+(mode===m[0]?' on':'')+'" data-mc-mode="'+m[0]+'" aria-pressed="'+(mode===m[0]?'true':'false')+'">'+m[1]+'</button>';}).join('')+'</div>';
    h+='<div class="mc-section"><div class="mc-label">Pages</div><div class="mc-list">'+(pages.length?pages.map(function(x){return companionButton(x,'page');}).join(''):'<div class="mc-empty">Recommendations load after navigation data is ready.</div>')+'</div></div>';
    h+='<div class="mc-section"><div class="mc-label">Tools</div><div class="mc-list">'+(tools.length?tools.slice(0,3).map(function(x){return companionButton(x,'tool');}).join(''):'<div class="mc-empty">No mode tools yet.</div>')+'</div></div>';
    h+='</div>';
    root.innerHTML=h;
  }
  window.__renderModeCompanion=renderModeCompanion;
  (function(){ var root=document.getElementById('modeCompanion'); if(!root)return; root.addEventListener('click',function(e){
    var tg=e.target.closest?e.target.closest('.mc-toggle'):null; if(tg){ mcOpen=!mcOpen; var bd=document.getElementById('mcBody'); if(bd){ if(mcOpen){bd.removeAttribute('hidden');}else{bd.setAttribute('hidden','');} } tg.setAttribute('aria-expanded',mcOpen?'true':'false'); return; }
    var mb=e.target.closest?e.target.closest('[data-mc-mode]'):null; if(mb){ setDashboardMode(mb.getAttribute('data-mc-mode')); if(currentItem&&currentItem.f==='__home__'&&window.renderHome){ contentEl.innerHTML=window.renderHome(); try{window.__afterSpecial('__home__');}catch(_){ } } else if(currentItem&&currentItem.k==='md'){ var nb=null, all=navEl.querySelectorAll('.navitem'); for(var i=0;i<all.length;i++){ if(all[i].getAttribute('data-f')===currentItem.f){ nb=all[i]; break; } } show(currentItem,nb,{replace:true}); } return; }
    var home=e.target.closest?e.target.closest('[data-mc-home]'):null; if(home){ navClick('__home__'); return; }
    var item=e.target.closest?e.target.closest('[data-mc-f]'):null; if(item){ navClick(item.getAttribute('data-mc-f')); }
  }); })();
```

(The toggle branch is checked first in the delegated click handler, flips `mcOpen`, and mutates the
`hidden` attribute + `aria-expanded` directly — it does not call `renderModeCompanion()` again, so
it never disturbs the mode-pill/page/tool markup already in the DOM. Mode-pill clicks still go
through `setDashboardMode()` → `renderModeCompanion()` exactly as before, and now read `mcOpen` so
an open panel stays open across a mode switch.)

- [ ] **Step 8: Rebuild both sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both print `build_and_check: <site> OK` again (the servers from Step 4 are still running
and serve the rebuilt files immediately — no restart needed).

- [ ] **Step 9: Run the new spec to confirm it passes**

```bash
cd tests/smoke && npx playwright test mode-companion.spec.js --project=nav-ms3 --project=nav-res && cd ../..
```

Expected: `6 passed` (3 tests × 2 projects).

- [ ] **Step 10: Stop the local servers**

```bash
kill <the three PIDs printed in Step 4>
```

- [ ] **Step 11: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/smoke/mode-companion.spec.js tests/smoke/playwright.config.js
git commit -m "feat(sidebar): collapse the ward-mode panel behind a toggle button"
```

---

### Task 2: Fix the dependent faculty-console specs + full regression

**Files:**
- Modify: `tests/smoke/faculty-console.spec.js` (two one-line insertions)

**Interfaces:**
- Consumes: `#modeCompanion .mc-toggle` (produced by Task 1).

- [ ] **Step 1: Build both sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- [ ] **Step 2: Install deps and start local servers**

```bash
cd tests/smoke && npm ci && cd ../..
bash tests/smoke/start-local-servers.sh
```

Copy the three PIDs from the `Stop with: kill ...` line for Step 7. These two tests navigate
directly to `MS3_URL` (port 4200) regardless of the `faculty-console` project's own baseURL, so both
the `ms3` and `faculty` servers must be up.

- [ ] **Step 3: Confirm the two dependent tests currently fail**

```bash
cd tests/smoke && npx playwright test faculty-console.spec.js --project=faculty-console -g "blocks parent-document companion links from leaving a ready page|keeps the exact-question iframe and route when Practice Questions is opened again" && cd ../..
```

Expected: FAIL — both tests time out locating `.mc-item`/`[data-mc-mode="shelf"]` inside
`#modeCompanion`, because Task 1 made the panel start collapsed and neither test opens it first.

- [ ] **Step 4: Fix the two tests**

In `tests/smoke/faculty-console.spec.js`, the first affected test currently reads:

```javascript
    const companionTool = page.locator('#modeCompanion .mc-item.is-tool').first();
    await expect(companionTool).toBeVisible();
    await companionTool.click();
```

Change it to:

```javascript
    await page.locator('#modeCompanion .mc-toggle').click();
    const companionTool = page.locator('#modeCompanion .mc-item.is-tool').first();
    await expect(companionTool).toBeVisible();
    await companionTool.click();
```

The second affected test currently reads:

```javascript
    await page.locator('#modeCompanion [data-mc-mode="shelf"]').click();
    const shelfQuestionBank = page.locator(
```

Change it to:

```javascript
    await page.locator('#modeCompanion .mc-toggle').click();
    await page.locator('#modeCompanion [data-mc-mode="shelf"]').click();
    const shelfQuestionBank = page.locator(
```

- [ ] **Step 5: Confirm the two tests now pass**

```bash
cd tests/smoke && npx playwright test faculty-console.spec.js --project=faculty-console -g "blocks parent-document companion links from leaving a ready page|keeps the exact-question iframe and route when Practice Questions is opened again" && cd ../..
```

Expected: `2 passed`.

- [ ] **Step 6: Run the full relevant regression**

```bash
cd tests/smoke && npx playwright test --project=nav-ms3 --project=nav-res --project=faculty-console && cd ../..
```

Expected: all pass — this re-runs Task 1's `mode-companion.spec.js` under `nav-ms3`/`nav-res` (it's
now registered in the config), the rest of `faculty-console.spec.js` (confirming no other test
touches `#modeCompanion`), and the full nav-crawl/longitudinal-case/family-systems/qbank-retired/
aria-live suites as a general no-regression check.

- [ ] **Step 7: Stop the local servers**

```bash
kill <the three PIDs printed in Step 2>
```

- [ ] **Step 8: Commit**

```bash
git add tests/smoke/faculty-console.spec.js
git commit -m "test(smoke): open the mode-companion toggle before asserting on its contents"
```

---

## Self-Review

**1. Spec coverage.**

| Spec decision (design doc) | Task |
|---|---|
| Inline accordion, collapsed by default | Task 1 Steps 6–7 (`mcOpen=false` initial state, `hidden` attribute) |
| No persistence — always starts collapsed on a fresh load | Task 1 Step 7 (`mcOpen` is a plain `var`, never touches localStorage); verified by Task 1's spec, test 3 |
| Toggle label reflects current mode dynamically | Task 1 Step 7 (`esc(cfg.label)+' mode'` inside `.mc-toggle-t`); verified by Task 1's spec, tests 1 & 2 |
| Reuse existing disclosure convention, not `<details>` | Task 1 Step 6–7 (`<button>` + `aria-expanded`/`aria-controls` + `.mc-chev`, mirroring `.sec-chev`) |
| Drop duplicate `.mc-title`; keep "Progress" button in place | Task 1 Steps 6–7 (`.mc-title` CSS deleted, `.mc-head` now holds only the Progress button, right-aligned) |
| Mode switch while expanded must not collapse the panel | Task 1 Step 7 (toggle click never calls `renderModeCompanion()`; mode-pill click reads `mcOpen`); verified by Task 1's spec, test 2 |
| Two dependent Playwright tests need updating | Task 2 Steps 3–5 |
| Full regression after the behavior change | Task 2 Step 6 |
| Visual baselines will go stale — not fixed here | Global Constraints (explicitly out of task scope; called out for the human operator) |
| `dashboardMode()`/`DASH_CONFIG`/`renderWardDashboard()`/mobile untouched | Global Constraints "Blast radius"; no task's file list includes them |

No spec decision is unmapped.

**2. Placeholder scan.** No "TBD"/"handle edge cases"/"similar to"/"write tests for the above". Every
code step contains complete, runnable content; every command has its expected output stated.

**3. Type consistency.** `mcOpen` is declared once (Task 1 Step 7) and only ever read/written inside
`renderModeCompanion()` and the toggle's click branch — no other function introduces a
same-purpose variable under a different name. Selectors are consistent across all three files:
`#modeCompanion .mc-toggle` / `.mc-toggle-t` / `#mcBody.mc-body` are produced once (Task 1 Step 7)
and consumed with those exact strings in Task 1's spec (Step 1) and Task 2's edits (Step 4). The
toggle's `aria-expanded` values are always the literal strings `'true'`/`'false'` (matching the
existing `aria-pressed` convention two lines below it in the same function), never a bare boolean —
checked in both the JS (`mcOpen?'true':'false'`) and the spec's `toHaveAttribute` assertions.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-ward-mode-sidebar-button.md`. Two
execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks,
fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with
checkpoints

**Which approach?**
