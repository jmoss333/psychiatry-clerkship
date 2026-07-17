# Wave B — Accessibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Bring the served surfaces to WCAG 2.1 AA on the gaps the audit found: announce dynamic feedback (`aria-live`), fix the light-mode `--primary` accent contrast, add skip-links + landmarks, raise mobile touch targets and expose toggle state, and make audio/video accessible.

**Architecture:** Reuse the patterns the codebase already ships in `sp-interview.html` (visually-hidden `aria-live` region + `announce()`) and `orientation-video.html` (`<video controls>`+`<track>`). Most edits are additive; the contrast edit is a token value change (the build already fixes `--text-light`).

**Tech stack:** vanilla JS + React UMD tool pages, the Python build polish pass, Playwright.

## Global Constraints
Inherited from the master plan. Do not regress dark mode; do not rename `cw_*`/`rp_*` keys; keep the QA gate green.

**Scope note (verified):** the build polish pass already rewrites `#87786a`→`#665a4f` (passing) and `<div id="root">`→`<main id="root">` for tools (`build_deploy.py:368,372`). So WP-03 targets only `--primary` (`#c25a3c`, confirmed failing live), and WP-05 targets skip-links + non-`#root` pages.

Merge order: WP-03, WP-04, WP-05 independent (parallel); WP-10 after WP-05 (both touch the shell/tool pages); WP-13 independent.

---

### Task 1: WP-03 — Fix the `--primary` accent contrast (light mode)

**Files:**
- Modify: served pages' inline `:root` where `--primary` is used as normal-size text/links (43 files), OR the token value at its definition.
- Create: `tests/contrast-check.mjs`

**Interfaces:** Produces an AA-compliant normal-size accent. `--primary #c25a3c` (3.94:1 on `#f6f3ee`) → `--primary-dark #a84830` for text/link usage (the token `--primary-dark` already exists in the palette). Large display headings (≥24px / ≥18.66px bold) may keep `#c25a3c` (passes large-text 3:1).

**Context:** `--primary #c25a3c` fails AA for normal text/links (measured 3.94 light, e.g. the "Algorithms & Decision Aids" link and small "TOOL" tags). Dark mode uses `#d4896e` (6.41, passes) — do not touch it.

- [ ] **Step 1: Write the failing contrast check**

Create `tests/contrast-check.mjs`:
```js
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function rel(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) { const a = rel(fg), b = rel(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }

// The two light backgrounds the palette renders text on.
const BGS = ['#f6f3ee', '#ffffff'];
// Tokens that are used at NORMAL text size must clear 4.5:1 on both.
const NORMAL_TEXT_TOKENS = { '--primary-dark': '#a84830', '--text-light': '#665a4f', '--text-mid': '#64574b', '--text': '#3b332c' };

let failed = false;
for (const [tok, hex] of Object.entries(NORMAL_TEXT_TOKENS)) {
  for (const bg of BGS) {
    const r = ratio(hex, bg);
    if (r < 4.5) { failed = true; console.error(`FAIL ${tok} (${hex}) on ${bg} = ${r.toFixed(2)} (<4.5)`); }
    else console.log(`ok  ${tok} (${hex}) on ${bg} = ${r.toFixed(2)}`);
  }
}
// Guard: the OLD accent must NOT be used as a normal-text token value anymore.
if (ratio('#c25a3c', '#f6f3ee') >= 4.5) console.log('(note) #c25a3c now passes — unexpected');
process.exit(failed ? 1 : 0);
```
Run: `node tests/contrast-check.mjs` — this passes for the target values; its job is to lock them in. (It documents the contract; the behavioral proof is the manual/Lighthouse check in Step 4.)

- [ ] **Step 2: Repoint normal-size `--primary` usages to `--primary-dark`**

For text/links/small labels rendered in the accent at normal size, use `--primary-dark` (`#a84830`, 4.5:1+). Two acceptable strategies — pick the lower-risk one for this codebase:
   - **(a) Targeted:** in served pages, change `color:var(--primary)` on normal-size text/link/badge rules to `color:var(--primary-dark)`. Leave large headings and button backgrounds on `--primary`.
   - **(b) Token bump:** if the accent is acceptable slightly darker everywhere, set `--primary:#a84830` in the light `:root` (keep `--primary` for large headings visually similar). Re-check the visual baseline.
Prefer (a) to preserve the brand on large headings/buttons. Enumerate the normal-size `--primary`-as-text rules:
```bash
grep -rn "color:var(--primary)\b" 13_Faculty_Resources/_automation/site_build/*.html 0*_*/**/*.html --include="*.html" | head -60
```

- [ ] **Step 3: Build both sites + run the QA gate + contrast check**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
node tests/contrast-check.mjs
```
Expected: builds green; contrast check exits 0.

- [ ] **Step 4: Visual + live spot-check**

Serve `_build/ms3`, view the home tools row (the accent link) and a topic page in light mode; confirm the terracotta text now reads darker but on-brand, and dark mode is unchanged.

- [ ] **Step 5: Commit**

```bash
git add tests/contrast-check.mjs $(git diff --name-only)
git commit -m "a11y: normal-size accent text uses --primary-dark for WCAG AA (light mode)"
```

**Acceptance:** normal-size accent text ≥4.5:1 in light mode; large headings/buttons unchanged; dark mode untouched; contrast check green.
**Regression risk:** visual — spot-check light+dark. **Blocks:** WP-11 (token extraction uses these finalized values).

---

### Task 2: WP-04 — Announce dynamic feedback (aria-live)

**Files (all add a persistent visually-hidden `aria-live` region + populate it on feedback):**
- `07_Evidence_and_Reading/Landmark_Trials/review.html` (React; reveal at 227-229)
- `07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html` (React; result at 386-397)
- `02_Clinical_Skills/Screeners/screeners.html` (React; score at 97-101)
- `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html` (vanilla; render() at 139)
- `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (vanilla; showFeedback() at 719-730)

**Exemplar to copy (verbatim from `_prototypes/sp-interview/sp-interview.html`):**
- CSS (line 197): `.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`
- Region (line 212): `<div id="live" class="visually-hidden" aria-live="polite" aria-atomic="true"></div>`
- Util (line 219): `function announce(m){try{document.getElementById('live').textContent=m;}catch(x){}}`

None of the five files currently has any `sr-only`/`visually-hidden`/`aria-live` (grep = 0 each).

- [ ] **Step 1: Write the failing smoke test**

Create `tests/smoke/aria-live.spec.js`:
```js
import { test, expect } from '@playwright/test';

test('question bank announces the verdict in an aria-live region', async ({ page }) => {
  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  // start a session
  await page.getByRole('button', { name: /start practice/i }).click();
  // choose a confidence, then any answer option (A–E buttons)
  await page.getByRole('button', { name: /Likely/i }).click();
  const opt = page.locator('.qcard button').filter({ hasText: /^[A-E]\./ }).first();
  await opt.click();
  // a persistent live region should now carry a verdict
  const live = page.locator('[aria-live]');
  await expect(live).toHaveCount(1);
  await expect(live).toContainText(/correct|incorrect|reasoning/i);
});
```
Register it in `tests/smoke/playwright.config.js` `nav-ms3` `testMatch` (add `'aria-live.spec.js'`). Build, serve :4200, run:
```bash
cd tests/smoke && npx playwright test --project=nav-ms3 aria-live.spec.js
```
Expected: FAIL — no `[aria-live]` element exists yet.

- [ ] **Step 2: question-bank-practice.html (vanilla) — add region + announce in showFeedback**

1. In the `<style>` block, add: `.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`
2. In the tool's static body, as a sibling of the render root, add: `<div id="qb-live" class="visually-hidden" aria-live="polite" aria-atomic="true"></div>`
3. In `showFeedback()` (after the `qcard.insertAdjacentHTML('beforeend', fbHtml);` at line 726), add:
```javascript
    var _live=document.getElementById('qb-live');
    if(_live){ _live.textContent = (twoTierResult==='shaky'?'Right answer, shaky reasoning. ':correct?'Correct. ':'Incorrect. ') + (item.pearl||''); }
```

- [ ] **Step 3: diagnostic-reasoning.html (vanilla) — mirror rendered feedback into a live region**

1. Add the `.visually-hidden` CSS rule (line ~67 area).
2. Add `<div id="dr-live" class="visually-hidden" aria-live="polite" aria-atomic="true"></div>` in the static body (sibling of `app`).
3. In `render()` (line 139), after `app.innerHTML=...;` add:
```javascript
  var _live=document.getElementById('dr-live'); var _fb=app.querySelector('.feedback');
  if(_live) _live.textContent=_fb?_fb.textContent:'';
```
(The rendered `.feedback` already contains the quality label + text; mirroring it is exact.)

- [ ] **Step 4: React pages — add an always-present live region to the render tree**

For each React page, add the `.visually-hidden` CSS rule, then add a live region as a persistent sibling in the returned tree whose text reflects the current outcome:

- **review.html** — in the same array as the feedback (after line 229's node), add:
```javascript
          e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"},
            sess.revealed ? (gotIt?"Correct. ":"Not quite. ")+(fbOpt.fb||corrOpt.fb||"") : ""),
```
- **shelf-mode.html** — in the result view (after line 397), add:
```javascript
        e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"},
          R.correct+" of "+R.n+" correct, "+R.pct+" percent. "+msg),
```
- **screeners.html** — in the scorebar (after line 99), add:
```javascript
      e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"},
        complete ? ("Score "+total+" of "+(items.length*3)+", "+b[0]) : ""),
```
Add the `.visually-hidden` CSS to each file's `<style>`.

- [ ] **Step 5: Rebuild, run the test to verify it passes**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
cd tests/smoke && npx playwright test --project=nav-ms3 aria-live.spec.js
```
Expected: PASS — one `[aria-live]` region carries the verdict.

- [ ] **Step 6: Commit**

```bash
git add 07_Evidence_and_Reading/Landmark_Trials/review.html 07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html 02_Clinical_Skills/Screeners/screeners.html 02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html 13_Faculty_Resources/_automation/site_build/question-bank-practice.html tests/smoke/aria-live.spec.js tests/smoke/playwright.config.js
git commit -m "a11y: announce scored feedback via aria-live regions (review, shelf, screeners, reasoning, qbank)"
```

**Acceptance:** each scored surface has one persistent polite live region carrying the outcome; smoke test green; VoiceOver/NVDA hears results.
**Regression risk:** low. Verify no double-announce (regions are declarative/idempotent). **Depends on:** none.

---

### Task 3: WP-05 — Skip-link + landmarks

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (polish pass, ~lines 370-377)

**Context:** The build already converts `<div id="root">`→`<main id="root">` and injects favicon for tools (`build_deploy.py:370-374`). Skip-links are absent on tool pages and root; `spa_index.html` (the shell) already has one. Add skip-link injection to the polish pass.

- [ ] **Step 1: Extend the polish pass to inject a skip-link + skip-link CSS**

In `build_deploy.py`, in the tool loop (the block at lines 370-374 that already does the `#root`→`<main>` conversion), add skip-link injection. After the existing `_t=_t.replace('<div id="root"></div>','<main id="root"></main>')` line, add:
```python
    if 'class="skip-link"' not in _t and '<body' in _t:
        _t=_re.sub(r'(<body[^>]*>)', r'\1\n<a class="skip-link" href="#root">Skip to content</a>', _t, count=1)
    if '.skip-link{' not in _t and '</head>' in _t:
        _t=_t.replace('</head>', '<style>.skip-link{position:absolute;left:-999px;top:0;background:var(--surface,#fff);color:var(--primary-dark,#a84830);padding:8px 12px;z-index:1000}.skip-link:focus{left:8px}</style>\n</head>', 1)
```
Do the same for the built root `index.html` if it lacks a skip-link (the SPA shell already has one — guard with the `'class="skip-link"' not in _t` check so it is not double-injected).

- [ ] **Step 2: Ensure a `<main>` target exists on non-`#root` tool pages**

For tool pages that do NOT contain `<div id="root">` (so the existing conversion didn't create a `<main>`), the skip-link target `#root` won't exist. Add a fallback: if the page has no `<main` and no `id="root"`, wrap its primary container or point the skip-link at the first `<h1>`. Concretely, extend the injection to set the skip-link href to `#main` and, when no `<main`/`id="root"` is present, add `id="main"` to the first `<h1>`:
```python
    if '<main' not in _t and 'id="root"' not in _t:
        _t=_re.sub(r'(<h1\b)', r'<span id="main"></span>\1', _t, count=1)
        _t=_t.replace('href="#root"','href="#main"')
```

- [ ] **Step 3: Build + verify landmark/skip-link presence**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
node -e "const fs=require('fs'),g=require('glob'); for(const f of g.sync('_build/ms3/tools/*.html')){const h=fs.readFileSync(f,'utf8'); if(!/class=\"skip-link\"/.test(h)) {console.error('no skip-link: '+f); process.exit(1);} if(!/<main|id=\"root\"|id=\"main\"/.test(h)){console.error('no main target: '+f); process.exit(1);}} console.log('skip-link+main OK');"
```
Expected: `skip-link+main OK`. (If `glob` isn't available, use a bash `for f in _build/ms3/tools/*.html` loop with grep.)

- [ ] **Step 4: Smoke — first Tab focuses the skip link**

Add to `tests/smoke/aria-live.spec.js` (or a new `landmarks.spec.js`):
```js
test('tool page exposes a skip link as first focusable', async ({ page }) => {
  await page.goto('/tools/question-bank-practice.html');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.className);
  expect(focused).toContain('skip-link');
});
```

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_deploy.py tests/smoke/*.spec.js
git commit -m "a11y: inject skip-to-content link + ensure <main> target on all built tool pages"
```

**Acceptance:** every built tool page has a skip-link and a reachable main target; smoke green.
**Regression risk:** medium (build-pass touches all tools) — run full `build_and_check.sh ms3 && ... res`. **Feeds:** WP-10.

---

### Task 4: WP-10 — Touch targets + toggle state

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (`.mc-mode` line 47, `.wd-mode` line 372; add mobile min-height; add `aria-pressed` to the mode toggles in the JS that adds `.on`)
- Modify: `07_Evidence_and_Reading/Landmark_Library/_source/listening-guide-briefs.html` (expand buttons, line 185; `toggle()` line 1330) — **only if this file is served** (see Step 1)

- [ ] **Step 1: Confirm which surfaces are served**

```bash
grep -n "listening-guide-briefs\|landmark_trials\|Listen" 13_Faculty_Resources/_automation/site_build/site_manifest.json
```
`listening-guide-briefs.html` lives under `_source/` — if it is NOT in `site_manifest.json`, it is not served and its expand-button work is out of scope (note it and skip Steps 4-5). The mode chips in `spa_index.html` ARE served (the shell).

- [ ] **Step 2: Raise mode-chip touch targets on mobile**

In `spa_index.html`, inside the existing `@media(max-width:560px)` block (line 200) add:
```css
  .mc-mode,.wd-mode{min-height:44px;padding-top:10px;padding-bottom:10px}
```
(Keeps desktop density; only mobile grows to the 44px target.)

- [ ] **Step 3: Add `aria-pressed` to the mode toggles**

In `spa_index.html`, find where `.mc-mode`/`.wd-mode` buttons get the `on` class toggled in JS, and set `aria-pressed` in sync. When a chip is created, add `aria-pressed="false"`; when it gains `.on`, set `aria-pressed="true"` on it and `"false"` on its siblings. (Mirror the existing `classList.toggle('on')` logic with `btn.setAttribute('aria-pressed', String(isOn))`.)

- [ ] **Step 4: (if served) `aria-expanded` on the 50 expand buttons**

In `listening-guide-briefs.html`, add `aria-expanded="false"` to each `<button class="expand-btn">` (line 185 pattern), and in `toggle(id)` (line 1330) set it from the resulting state:
```javascript
function toggle(id) {
  var open = document.getElementById(id).classList.toggle('open');
  var btn = document.querySelector('button[onclick="toggle(\'' + id + '\')"]');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}
```
Also add `min-height:44px` to `.expand-btn` (line 86) for touch.

- [ ] **Step 5: Add `aria-current` where "current" is color-only**

Where a nav/week item signals "current" by a color class only (e.g. `one-patient-six-weeks.html` `.weekbtn.current`), set `aria-current="true"` on the active item in the JS that applies the class.

- [ ] **Step 6: Build, smoke, commit**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
git add 13_Faculty_Resources/_automation/site_build/spa_index.html 07_Evidence_and_Reading/Landmark_Library/_source/listening-guide-briefs.html 08_Cases_and_Simulation/one-patient-six-weeks.html
git commit -m "a11y: 44px mobile touch targets + aria-pressed/expanded/current on toggles"
```

**Acceptance:** mode chips ≥44px on mobile; toggles expose `aria-pressed`; expanders `aria-expanded`; current item `aria-current`.
**Regression risk:** low-moderate (CSS + attribute sync). **Depends on:** WP-05 (shell edits land first).

---

### Task 5: WP-13 — Accessible audio & video

**Files:**
- Modify (if served): `07_Evidence_and_Reading/Landmark_Library/_source/listening-guide-briefs.html` (add `<audio>`)
- Modify: the 6 tool-spotlight video pages (add `controls`/`<track>` or a text alternative)
- Create: `media_manifest.json`

**Context:** `listening-guide-briefs.html` lists 50 `.m4a` filenames as `<code>` with written briefs but no `<audio>` (grep `<audio>`=0). The 6 tool-spotlight videos are `muted loop playsinline` with an `aria-label` but no `controls`/`<track>`. `review.html:220` has `<audio controls>` for the overview but no transcript. Exemplar: `orientation-video.html:57-61` (`<video controls>`+`<track kind="captions">`).

The 6 videos (all `<video src="../media/tool-spotlight-*.mp4" muted loop playsinline aria-label="...">`):
- `02_Clinical_Skills/Interviewing/interview-circle.html:75`
- `04_Acute_and_Safety/Catatonia/bfcrs.html:103`
- `04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html:72`
- `04_Acute_and_Safety/Violence_Risk/violence-risk-one-pager.html:65`
- `04_Acute_and_Safety/Decision_Aids/decision-aids.html:115`
- `03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html:84`

- [ ] **Step 1: (if served) Give each audio brief a real player + download**

In `listening-guide-briefs.html`, for each paper card, add below the `<code>filename</code>` a real player and download link:
```html
<audio controls preload="none" src="./audio/01-CATIE-Lieberman-2005.m4a" aria-label="Audio overview: Lieberman 2005"></audio>
<a href="./audio/01-CATIE-Lieberman-2005.m4a" download>Download audio</a>
```
(Use the correct relative audio path for the served location; the written "Brief" beside it is the text alternative.) If the file is NOT served (Step 1 of WP-10), skip and record it in the manifest as source-only.

- [ ] **Step 2: Videos — add `controls` and a captions track (or visible text alternative)**

For each of the 6 tool-spotlight `<video>` tags, add `controls` and a `<track>`. These are silent UI screen-recordings, so the accessible need is (a) user control (not forced loop) and (b) a short text description. Minimum change — add `controls` and convert to child `<source>` with a text fallback, following the orientation-video pattern:
```html
<video controls muted playsinline
  aria-label="Tool spotlight: The Interview Circle — a browser recreation of the tool in use."
  style="...">
  <source src="../media/tool-spotlight-interview-circle.mp4" type="video/mp4">
  <p>Silent screen recording of the Interview Circle tool. <a href="../media/tool-spotlight-interview-circle.mp4">Download the clip.</a></p>
</video>
```
Keep the play-on-`<details>`-open JS. Drop `loop` (WCAG 2.2.2 — no un-pausable looping) or ensure `controls` lets the user stop it. If a real VTT caption/description track is authored later, add `<track kind="descriptions" srclang="en" src="...vtt">`.

- [ ] **Step 3: review.html — add a transcript/summary affordance**

For the `<audio>` at `review.html:220`, the paper's written overview already exists in the item data. Ensure the `<details>` also shows (or links to) the text overview as the transcript alternative next to the audio control.

- [ ] **Step 4: Create the media manifest**

Create `media_manifest.json` cataloguing each media asset and its text-alternative status:
```json
{ "_note": "Media accessibility manifest: text-alternative status per asset.",
  "audio": [ { "file": "audio/01-CATIE-Lieberman-2005.m4a", "textAlt": "written brief in listening-guide-briefs", "served": true } ],
  "video": [ { "file": "media/tool-spotlight-interview-circle.mp4", "captions": false, "textAlt": "aria-label + download fallback", "kind": "silent-screen-recording" } ] }
```
Mark any missing captions with `"captions": false` here (in the manifest) — never leave a TODO in learner-visible copy.

- [ ] **Step 5: Build, verify, commit**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
node -e "const fs=require('fs'),g=require('glob'); let bad=0; for(const f of ['02_Clinical_Skills/Interviewing/interview-circle.html','04_Acute_and_Safety/Catatonia/bfcrs.html']){const h=fs.readFileSync(f,'utf8'); if(!/\<video[^>]*controls/.test(h)){console.error('no controls: '+f); bad=1;}} process.exit(bad);"
git add $(git diff --name-only) media_manifest.json
git commit -m "a11y: real audio players + video controls/text-alternatives + media manifest"
```

**Acceptance:** audio briefs playable in-page with text alt; the 6 videos have user controls + a text alternative (no forced loop); manifest catalogues caption status.
**Regression risk:** low-medium (media loads). **Depends on:** can reuse WP-05 patterns.

## Self-Review
- WP-03 → Task 1 ✓ (only `--primary`, per verified build behavior on `--text-light`); WP-04 → Task 2 ✓ (exact insertion points per file, exemplar copied); WP-05 → Task 3 ✓ (build-pass injection); WP-10 → Task 4 ✓ (served-check gate, exact CSS lines); WP-13 → Task 5 ✓ (6 videos enumerated, exemplar pattern).
- Type/name consistency: `.visually-hidden` CSS + `[aria-live]` region names consistent across Task 2 files; `#qb-live`/`#dr-live` ids match their announce calls; skip-link class `skip-link` consistent between injection (Task 3) and the Tab test. ✓
- No placeholders: every insertion shows exact code at an exact line; the one conditional (listening-guide-briefs served?) is gated by a concrete grep, not left vague. ✓
