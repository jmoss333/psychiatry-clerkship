# Mobile Reading Shell Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared MS3/resident phone experience smoother by preventing fixed controls from obscuring navigation or reading, identifying the current page while scrolling, and making wide tables clearly usable.

**Architecture:** Keep `spa_index.html` as the single source of phone behavior. Add a mobile-only chrome bar and safe-area-aware layout rules, enhance the existing contextual tool bar/sheet without changing its registry or routes, and decorate rendered Markdown tables after parsing. Extend the existing visual Playwright suite with behavioral mobile checks so CI runs the new coverage with the current visual project.

**Tech Stack:** Vanilla HTML/CSS/JS in `spa_index.html`; Python build scripts; Node 18 static QA; Playwright 1.46 smoke tests.

## Global Constraints

- Preserve canonical clinical content, markdown source files, `topic_meta.json`, and all existing `?page=` / `?tool=` links.
- Keep the shared SPA dependency-free and offline-safe; do not introduce a CDN, framework, network request, or persistent state key.
- Preserve desktop layout at widths above 820 px and existing dark-theme/reduced-motion behavior.
- Phone targets must be at least 44 px high; top and bottom fixed UI must respect `env(safe-area-inset-*)`.
- The generated `_build/` directories are not source; change only source files and regenerate them for checks.
- Validate both `ms3` and `res` with `build_and_check.sh`; report the existing six metadata warnings separately from any new failure.

## File Structure

- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html`: mobile shell CSS, markup, route-title helper, contextual-tool sheet behavior, and post-render table enhancement.
- Modify `tests/smoke/visual-regression.spec.js`: mobile interaction coverage under the already-CI-executed `visual` project.
- Update `tests/smoke/baseline/sidebar-mobile.png` and `tests/smoke/baseline/topic-mobile.png`: approved visual snapshots after inspection.
- Create `docs/superpowers/specs/2026-07-11-mobile-reading-shell-design.md`: the approved scope and acceptance criteria.

---

### Task 1: Add failing mobile-shell behavior coverage

**Files:**
- Modify: `tests/smoke/visual-regression.spec.js` after the existing screenshot loop.

**Interfaces:**
- Consumes: resident build on `baseURL`, the existing `waitForSpaReady(page)` helper, `#menuBtn`, `#side`, and rendered SPA routes.
- Produces: behavior assertions that require `#mobileTitle`, `.table-scroll-viewport`, `.tl-sheet__close`, safe drawer clearance, and 3-plus-More toolbar density at 320 px.

- [ ] **Step 1: Add the failing test block**

Append this exact block after the existing `for (const vp of VIEWPORTS)` loop:

```js
test.describe('mobile shell ergonomics', () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test('keeps navigation, contextual tools, and the current page usable', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?page=t_mood.md`, { waitUntil: 'domcontentloaded' });
    await waitForSpaReady(page);

    await expect(page.locator('#mobileTitle')).toContainText('Mood Disorders');
    await expect(page.locator('.tl-bar')).toBeVisible();
    await expect(page.locator('.tl-bar__item[data-tool]')).toHaveCount(3);

    await page.locator('#menuBtn').click();
    const drawerPadding = await page.locator('#side').evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).paddingBottom),
    );
    expect(drawerPadding).toBeGreaterThanOrEqual(90);
    await page.locator('#drawerBackdrop').click();

    const more = page.locator('.tl-bar__more');
    await more.click();
    await expect(page.locator('.tl-sheet')).toBeVisible();
    await expect(page.locator('.tl-sheet__close')).toBeFocused();
    await page.locator('.tl-sheet__close').click();
    await expect(page.locator('.tl-sheet')).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test('marks a wide Markdown table as an accessible scroll region', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?page=pg_interview.md`, { waitUntil: 'domcontentloaded' });
    await waitForSpaReady(page);

    const viewport = page.locator('.table-scroll-viewport').first();
    await expect(viewport).toHaveAttribute('role', 'region');
    await expect(viewport).toHaveAttribute('tabindex', '0');
    await expect(viewport).toHaveAttribute('aria-label', /table/i);
    await expect(viewport.locator('table')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the focused test to prove the baseline is missing the feature**

Run from `tests/smoke` while serving `_build/res` at port 4201:

```bash
npx playwright test visual-regression.spec.js --project=visual --grep='mobile shell ergonomics'
```

Expected: FAIL because `#mobileTitle` and `.table-scroll-viewport` do not exist yet.

### Task 2: Build the safe mobile shell and contextual-tool improvements

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` around the current mobile CSS, the `<main>` opening markup, `showPath()`, `show()`, and the `openSheet()` / `mountBar()` helpers.

**Interfaces:**
- Consumes: existing `currentItem`, `relatedTools(item)`, `LAB`, `SAFE`, `ICON`, `barEl`, `menuBtn`, and `setDrawer(open)` behavior.
- Produces: `#mobileTitle`, a safe-area-aware drawer/content layout, `mobileToolKeys(keys)`, and an accessible close/focus lifecycle for `.tl-sheet`.

- [ ] **Step 1: Add mobile chrome markup**

Replace the standalone mobile menu button inside `<main>` with:

```html
    <div class="mobile-chrome" id="mobileChrome">
      <button class="menubtn" id="menuBtn" type="button" aria-controls="side" aria-expanded="false">&#9776;<span>Menu</span></button>
      <span class="mobile-title" id="mobileTitle" aria-live="polite">Inpatient Psychiatry</span>
      <span class="mobile-chrome-spacer" aria-hidden="true"></span>
    </div>
```

Leave the banner and `#content` directly after this bar.

- [ ] **Step 2: Add CSS for the chrome and fixed-control clearance**

Replace the current `.menubtn` / `@media(max-width:820px)` block with these rules, keeping the surrounding desktop rules unchanged:

```css
  .mobile-chrome{display:none}
  .menubtn{display:none}
  @media(max-width:820px){
    :root{--mobile-bottom-clearance:calc(84px + env(safe-area-inset-bottom,0px))}
    .layout{grid-template-columns:1fr}
    .mobile-chrome{position:sticky;top:0;z-index:18;display:grid;grid-template-columns:minmax(44px,auto) minmax(0,1fr) minmax(44px,auto);align-items:center;gap:8px;min-height:56px;padding:calc(6px + env(safe-area-inset-top,0px)) 12px 6px;background:var(--bg);border-bottom:1px solid var(--border)}
    .menubtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;border:none;border-radius:9px;padding:8px 12px;background:var(--primary-dark);color:#fff;font:inherit;font-weight:700;cursor:pointer}
    .mobile-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:var(--text);font-family:var(--font-head);font-size:1rem;font-weight:600}
    .mobile-chrome-spacer{display:block;min-width:44px;min-height:44px}
    aside{position:fixed;left:0;top:0;width:84%;max-width:300px;z-index:20;height:100vh;height:100dvh;padding-bottom:18px;overflow-y:auto;overscroll-behavior:contain;transform:translateX(-100%);transition:transform .2s;box-shadow:0 0 30px rgba(0,0,0,.2)}
    body.has-tlbar aside{padding-bottom:calc(var(--mobile-bottom-clearance) + 18px)}
    aside.open{transform:translateX(0)}
    body.has-tlbar #content{padding-bottom:var(--mobile-bottom-clearance)}
  }
```

Change the existing mobile tool-bar content padding rule to use `var(--mobile-bottom-clearance)` rather than its fixed `78px` value.

- [ ] **Step 3: Update the mobile title whenever the route changes**

Immediately after the `pageTitle(it)` helper, add:

```js
  function setMobileTitle(item){
    var title=document.getElementById('mobileTitle');
    if(!title)return;
    if(!item){title.textContent='Inpatient Psychiatry';return;}
    title.textContent=item.f==='__home__'?'Today / Progress':(item.f==='__start__'?'Start here':item.t);
  }
```

Call `setMobileTitle({t:'Learning Path',f:'__path__'})` at the end of `showPath()` and call `setMobileTitle(item)` as the first statement in `show(item, btn, opts)`.

- [ ] **Step 4: Make the More sheet explicitly closable and focus-safe**

Replace the current `closeSheet()` / `openSheet()` functions with:

```js
  var sheetInvoker=null;
  function closeSheet(){
    var sh=document.querySelector('.tl-sheet'), bd=document.querySelector('.tl-sheet-backdrop');
    if(sh&&sh.parentNode)sh.parentNode.removeChild(sh);
    if(bd&&bd.parentNode)bd.parentNode.removeChild(bd);
    if(sheetInvoker&&sheetInvoker.isConnected){sheetInvoker.setAttribute('aria-expanded','false');sheetInvoker.focus();}
    sheetInvoker=null;
  }
  function openSheet(invoker){
    closeSheet();
    sheetInvoker=invoker||null;
    if(sheetInvoker)sheetInvoker.setAttribute('aria-expanded','true');
    var keys=Object.keys(LAB);
    var bd=document.createElement('div'); bd.className='tl-sheet-backdrop';
    var sh=document.createElement('div'); sh.className='tl-sheet'; sh.setAttribute('role','dialog'); sh.setAttribute('aria-modal','true'); sh.setAttribute('aria-labelledby','tlSheetTitle');
    sh.innerHTML='<div class="tl-sheet__head"><h2 id="tlSheetTitle">All tools</h2><button type="button" class="tl-sheet__close" aria-label="Close all tools">Close</button></div><div class="tl-sheet__grid">'+keys.map(function(k){ var s=SAFE[k]?' is-safety':''; return '<a class="tl-sheet__item'+s+'" href="?tool='+k+'" data-tool="'+k+'" aria-label="Open the '+(LAB[k]||k)+' tool">'+svg(ICON[k])+'<span>'+(LAB[k]||k)+'</span></a>'; }).join('')+'</div>';
    document.body.appendChild(bd); document.body.appendChild(sh);
    bd.addEventListener('click',closeSheet);
    sh.querySelector('.tl-sheet__close').addEventListener('click',closeSheet);
    requestAnimationFrame(function(){var close=sh.querySelector('.tl-sheet__close');if(close)close.focus();});
  }
```

Add a `.tl-sheet__head` flex row and a 44 px `.tl-sheet__close` button styled with existing `--border`, `--surface`, and `--accent-dark` tokens.

- [ ] **Step 5: Make the narrow tool bar denser only when needed**

Immediately before `mountBar(keys)`, add:

```js
  function mobileToolKeys(keys){
    return keys.slice(0,window.matchMedia('(max-width:360px)').matches?3:4);
  }
```

Within `mountBar(keys)`, replace `var pick=keys.slice(0,4);` with `var pick=mobileToolKeys(keys);`, add `aria-expanded="false"` to the More button markup, and change the listener to `moreBtn.addEventListener('click',function(){openSheet(moreBtn);});`.

- [ ] **Step 6: Run the failing-focused test again**

Run the command from Task 1. Expected: the first test passes through the title, safe drawer padding, tool count, and sheet close; the table test still fails because table enhancement is not implemented yet.

### Task 3: Give Markdown tables a visible, accessible horizontal-scroll affordance

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` near `.md-body table` CSS and beside `makeCollapsible(body)`.

**Interfaces:**
- Consumes: rendered Markdown `table` elements inside `#content`.
- Produces: `.table-scroll > .table-scroll-hint + .table-scroll-viewport[role=region][tabindex=0] > table`; the outer wrapper gains `is-scrollable` only if its viewport overflows.

- [ ] **Step 1: Replace the old table overflow CSS**

Replace the one-line `.md-body table` scroll rule with:

```css
  .md-body table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92rem}
  .md-body .table-scroll{position:relative;margin:1em 0}
  .md-body .table-scroll-viewport{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
  .md-body .table-scroll table{width:max-content;min-width:100%;margin:0}
  .table-scroll-hint{display:none;margin:0 0 5px;color:var(--text-light);font-size:.78rem;font-weight:700;letter-spacing:.02em}
  @media(max-width:820px){
    .md-body .table-scroll.is-scrollable .table-scroll-hint{display:block}
    .md-body .table-scroll.is-scrollable::after{content:"";position:absolute;right:1px;bottom:1px;width:28px;height:calc(100% - 24px);pointer-events:none;background:linear-gradient(90deg,transparent,var(--surface))}
    .md-body .table-scroll th,.md-body .table-scroll td{min-width:9rem}
    .md-body .table-scroll th:first-child,.md-body .table-scroll td:first-child{min-width:7rem}
  }
```

Keep the existing shared `th` / `td` border and padding rules directly after this replacement.

- [ ] **Step 2: Add post-render enhancement helpers**

Immediately after `makeCollapsible(body)`, add:

```js
  function tableLabel(table,index){
    var heading=table.previousElementSibling;
    while(heading&&heading.tagName!=='H1'&&heading.tagName!=='H2'&&heading.tagName!=='H3')heading=heading.previousElementSibling;
    return (heading&&heading.textContent?heading.textContent.trim()+' table':'Scrollable table '+(index+1));
  }
  function refreshTableScrollCues(){
    [].forEach.call(document.querySelectorAll('.table-scroll'),function(shell){
      var viewport=shell.querySelector('.table-scroll-viewport');
      shell.classList.toggle('is-scrollable',!!viewport&&viewport.scrollWidth>viewport.clientWidth+1);
    });
  }
  function enhanceTables(body){
    if(!body)return;
    [].forEach.call(body.querySelectorAll('table'),function(table,index){
      if(table.parentNode&&table.parentNode.classList.contains('table-scroll-viewport'))return;
      var shell=document.createElement('div'); shell.className='table-scroll';
      var hint=document.createElement('p'); hint.className='table-scroll-hint'; hint.setAttribute('aria-hidden','true'); hint.textContent='Swipe to see all columns';
      var viewport=document.createElement('div'); viewport.className='table-scroll-viewport'; viewport.tabIndex=0; viewport.setAttribute('role','region'); viewport.setAttribute('aria-label',tableLabel(table,index));
      table.parentNode.insertBefore(shell,table); shell.appendChild(hint); shell.appendChild(viewport); viewport.appendChild(table);
    });
    requestAnimationFrame(refreshTableScrollCues);
  }
  window.addEventListener('resize',refreshTableScrollCues);
```

- [ ] **Step 3: Invoke table enhancement after Markdown is rendered**

In the markdown fetch success path, change:

```js
      makeCollapsible(contentEl); if(rv&&rv.status==='reviewed'){
```

to:

```js
      makeCollapsible(contentEl); enhanceTables(contentEl); if(rv&&rv.status==='reviewed'){
```

- [ ] **Step 4: Run the focused mobile behavior test**

Run the Task 1 Playwright command. Expected: PASS, including the table region assertions.

### Task 4: Rebuild, inspect, and preserve visual regression coverage

**Files:**
- Modify: `tests/smoke/baseline/sidebar-mobile.png` and `tests/smoke/baseline/topic-mobile.png` only through Playwright snapshot update.

**Interfaces:**
- Consumes: rebuilt `_build/ms3`, rebuilt `_build/res`, and the completed source shell.
- Produces: new approved narrow-screen screenshots and passing build/static/smoke verification.

- [ ] **Step 1: Rebuild both site variants**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both end `✓ PASS (hard:0 ...)`; six pre-existing metadata soft warnings remain, and no new hard failure appears.

- [ ] **Step 2: Serve the rebuilt variants**

Run in separate terminals:

```bash
python3 -m http.server 4200 --directory _build/ms3
python3 -m http.server 4201 --directory _build/res
```

- [ ] **Step 3: Update screenshots and inspect the mobile captures**

Run from `tests/smoke`:

```bash
npx playwright test --project=visual --update-snapshots
```

Inspect `baseline/sidebar-mobile.png` and `baseline/topic-mobile.png`. Accept only if the header is readable, the tool bar does not hide the reading end, the open drawer can scroll above it, and no desktop snapshot has regressed.

- [ ] **Step 4: Run the complete existing smoke coverage**

Run:

```bash
npx playwright test --project=nav-ms3 --project=nav-res --project=visual
```

Expected: all nav and visual tests pass. The LFS deploy-preview test remains excluded locally because it needs a deployed preview URL.

- [ ] **Step 5: Review the source diff and commit only phone-shell files**

Run:

```bash
git diff --check
git diff -- 13_Faculty_Resources/_automation/site_build/spa_index.html tests/smoke/visual-regression.spec.js tests/smoke/baseline docs/superpowers
git status --short
```

Stage only the listed source, test, baseline, and documentation files. Commit with:

```bash
git commit -m "feat(mobile): smooth phone reading shell"
```
