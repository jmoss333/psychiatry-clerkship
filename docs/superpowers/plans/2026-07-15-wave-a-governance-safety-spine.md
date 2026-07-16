# Wave A — Governance & Safety Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the write path that changes live clinical content safe — every push to `main` runs CI, the practice bank stops serving retired items, and the sites emit baseline security headers.

**Architecture:** Three independent, small changes to (1) the GitHub Actions workflow, (2) one tool HTML file, (3) the Python build's `_headers` writer. No data contracts, localStorage keys, or visual layout change.

**Tech stack:** GitHub Actions YAML, vanilla JS in a single-file HTML tool, Python 3.11 build, Playwright 1.46.1 smoke tests, Node 20.

## Global Constraints

Inherited verbatim from `2026-07-15-audit-remediation-master.md` → "Global Constraints". Most relevant here: no external CDN; keep `cw_*`/`rp_*` keys; keep `<title>`/viewport/RC-META; dark mode must not regress; **done = `build_and_check.sh ms3` AND `... res` both exit 0** plus the package test.

**Decision applied:** un-attested **drafts stay served and marked**; only **retired** items are excluded (WP-02).

---

## File Structure

- `.github/workflows/ci.yml` — add a `push` trigger scoped to `main` (WP-01). One responsibility: CI trigger surface.
- `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` — add an `activeItems()` gate used by setup/queue/count (WP-02). One responsibility: which items the practice tool serves.
- `tests/smoke/qbank-retired.spec.js` — new Playwright spec proving retired exclusion (WP-02). 
- `tests/smoke/playwright.config.js` — register the new spec under the `nav-ms3` project (WP-02).
- `13_Faculty_Resources/_automation/site_build/build_deploy.py` — extend the `_headers` string with security headers (WP-09). One responsibility: emitted HTTP headers.
- `tests/check-security-headers.mjs` — new standalone check for the emitted headers (WP-09).

Merge order: **Task 1 (WP-01) first**, then Task 2 (WP-02) and Task 3 (WP-09) in parallel.

---

### Task 1: WP-01 — CI runs on push to `main`

**Files:**
- Modify: `.github/workflows/ci.yml:6-8`

**Interfaces:**
- Consumes: nothing.
- Produces: CI now also triggers on `push` to `main`. No new job names; `build-test-validate` and `smoke-tests` are unchanged.

**Context:** The faculty attestation console commits directly to `main` via the GitHub Contents API (`faculty-console/netlify/functions/attest.mjs:73-88`). CI currently triggers only on `pull_request` + `workflow_dispatch` (`ci.yml:6-8`), so those commits — and any direct push to `main` — run zero Actions checks. Adding a `main`-scoped `push` trigger closes that gap. (Netlify's build command still gates the deploy independently; this adds the Actions test layer.)

- [ ] **Step 1: Write the change to the trigger block**

Replace `.github/workflows/ci.yml` lines 6-8:

```yaml
on:
  pull_request:
  workflow_dispatch:
```

with:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
```

Leave `permissions: contents: read`, `concurrency` (group `ci-${{ github.ref }}`), and both jobs exactly as-is. The `concurrency` group keys on `github.ref`, which is correct for both PR and push events.

- [ ] **Step 2: Verify the YAML still parses**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml OK')"
```
Expected: `yaml OK` (no traceback).

- [ ] **Step 3: Verify the trigger is present**

Run:
```bash
grep -A4 '^on:' .github/workflows/ci.yml
```
Expected output contains `push:` and `branches: [main]`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run CI on push to main (close faculty-console direct-commit gap)"
```

- [ ] **Step 5: Confirm on merge**

After this PR merges to `main`, open the repo's Actions tab and confirm a "CI — build, test, validate" run appears for the merge commit (event = `push`). This is the acceptance proof; it can only be observed post-merge.

**Acceptance:** YAML parses; `push`/`branches: [main]` present; a push to `main` produces an Actions run.
**Regression risk:** low — additive. May produce one extra run on PR-merge (a PR run + a push run); acceptable.

---

### Task 2: WP-02 — Practice bank excludes retired items

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (lines 284, 291-294, 535, 558; add helper after line 274)
- Create: `tests/smoke/qbank-retired.spec.js`
- Modify: `tests/smoke/playwright.config.js:40`

**Interfaces:**
- Consumes: the shipped `question_bank.json` (served at site root; each item may carry `retired: true` + `retiredReason`).
- Produces: a JS helper `activeItems()` returning `BANK.items` with retired items removed, used by `renderSetup`, `startSession`→`buildQueue`, and `updateCount`. Drafts are unaffected (still served, still badged by `renderMeta`).

**Context:** The renderer filters only by category + difficulty (`buildQueue` line 265-274; `updateCount` line 533-544) and counts `items.length` (line 291), so the 3 retired items (`qb_pha_012`, `qb_sud_015`, `qb_sud_016`) are served with a "Pending faculty review" chip. Per `question_bank.schema.json:84`, retired items should be excluded from the served set. Fix at one source (`activeItems()`) so setup count, queue, and live count all agree.

- [ ] **Step 1: Write the failing test**

Create `tests/smoke/qbank-retired.spec.js`:

```js
import { test, expect } from '@playwright/test';

test('practice bank excludes retired items from the served pool', async ({ page, baseURL }) => {
  // Ground truth from the shipped data
  const res = await page.request.get(`${baseURL}/question_bank.json`);
  expect(res.ok()).toBeTruthy();
  const bank = await res.json();
  const items = bank.items || bank;
  const active = items.filter((it) => !it.retired);
  const retired = items.filter((it) => it.retired);
  // Guard: this test only proves something if the bank actually has retired items.
  expect(retired.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  await page.selectOption('#f-size', 'all');
  await expect(page.locator('#itemCount')).toContainText('match');

  const countText = (await page.locator('#itemCount').textContent()) || '';
  const shown = parseInt((countText.match(/\d+/) || ['0'])[0], 10);
  expect(shown).toBe(active.length);       // count reflects the retired-excluded pool
  expect(shown).not.toBe(items.length);    // proves retired were actually removed
});
```

- [ ] **Step 2: Register the spec and run it to verify it fails**

In `tests/smoke/playwright.config.js`, change the `nav-ms3` project's `testMatch` (line 40) from:

```js
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js'],
```
to:
```js
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'qbank-retired.spec.js'],
```

Then build + serve + run (from repo root):
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
python3 -m http.server 4200 --directory _build/ms3 &
cd tests/smoke && npm ci && npx playwright install chromium --with-deps
npx playwright test --project=nav-ms3 qbank-retired.spec.js
```
Expected: FAIL — `expect(shown).toBe(active.length)` fails because the tool currently shows `items.length` (192) not `active.length` (189).

- [ ] **Step 3: Add the `activeItems()` helper**

In `question-bank-practice.html`, immediately after `buildQueue` ends (after line 274 `}`), insert:

```js
/* Items eligible to serve to learners. Retired items (near-duplicate/redundant per
   question_bank.schema.json) are NEVER queued. Drafts ARE served and marked. */
function activeItems(){
  return (BANK && BANK.items ? BANK.items : []).filter(function(it){ return !it.retired; });
}
```

- [ ] **Step 4: Route setup, count, and queue through `activeItems()`**

Make these four edits in the same file:

1. `renderSetup` — line 284, change:
```js
  var items = BANK ? BANK.items : [];
```
to:
```js
  var items = activeItems();
```

2. Setup sub-text — line 294, change:
```js
    +'<p class="sub">'+total+' items across 12 categories. Select filters, then start. Draft items are included and marked; they teach well even before formal faculty attestation.</p>'
```
to:
```js
    +'<p class="sub">'+total+' items across 12 categories. Select filters, then start. Draft items are included and marked; they teach well even before formal faculty attestation. Retired near-duplicates are excluded.</p>'
```

3. `updateCount` — line 535, change:
```js
    var n = (BANK?BANK.items:[]).filter(function(it){
```
to:
```js
    var n = activeItems().filter(function(it){
```

4. `startSession` — line 558, change:
```js
  var queue = buildQueue(BANK.items, catFilter, diffFilter, sizeLimit);
```
to:
```js
  var queue = buildQueue(activeItems(), catFilter, diffFilter, sizeLimit);
```

- [ ] **Step 5: Rebuild and run the test to verify it passes**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
# (server from Step 2 still serving _build/ms3 on :4200; restart if needed)
cd tests/smoke && npx playwright test --project=nav-ms3 qbank-retired.spec.js
```
Expected: PASS — count shows 189 (= active), not 192.

- [ ] **Step 6: Run the full QA gate for both sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```
Expected: both exit 0 (no regression in the static QA harness; draft badge logic in `renderMeta` untouched).

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/question-bank-practice.html tests/smoke/qbank-retired.spec.js tests/smoke/playwright.config.js
git commit -m "fix(qbank): exclude retired items from practice bank (drafts still served + marked)"
```

**Acceptance:** retired items (`qb_pha_012`, `qb_sud_015`, `qb_sud_016`) are never queued or counted; setup/live count/queue all use the retired-excluded pool; drafts still appear with their badge; both builds green; new smoke test passes.
**Regression risk:** low. Confirm the "All categories / All levels / All matching" count dropped by exactly the retired count and the draft badge still renders on a draft item.

---

### Task 3: WP-09 — Baseline security headers

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py:380` (the `_headers` writer)
- Create: `tests/check-security-headers.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_build/<site>/_headers` gains a leading `/*` block with `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Content-Security-Policy`. Existing `Cache-Control` blocks are preserved and still apply (Netlify merges matching blocks).

**Context:** Live responses currently carry only HSTS. Content is author-controlled but rendered via `marked.parse()`→innerHTML, so defense-in-depth headers are cheap insurance. The build writes `_headers` at `build_deploy.py:380`; `resident_section.py` copies the ms3 build (`shutil.copytree`) so the same headers reach the resident site. **CSP must allow:** same-origin everything, inline style/script (tokens+JS are inline), `data:` images/fonts, and `connect-src` to the SP proxy `https://sp-interview-proxy.netlify.app` (the Interview Room endpoint), and same-origin framing (the SPA loads tools in an iframe).

- [ ] **Step 1: Write the failing check**

Create `tests/check-security-headers.mjs`:

```js
// Verifies the built _headers file emits baseline security headers.
// Usage: node tests/check-security-headers.mjs _build/ms3
import { readFileSync } from 'node:fs';

const dir = process.argv[2] || '_build/ms3';
const headers = readFileSync(`${dir}/_headers`, 'utf8');

const required = [
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: SAMEORIGIN',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy:',
  'Content-Security-Policy:',
  "connect-src 'self' https://sp-interview-proxy.netlify.app",
];

const missing = required.filter((h) => !headers.includes(h));
if (missing.length) {
  console.error('MISSING security header directives:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log('security headers OK (' + dir + ')');
```

- [ ] **Step 2: Run it against a fresh build to verify it fails**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
node tests/check-security-headers.mjs _build/ms3
```
Expected: FAIL — prints the missing directives and exits 1 (current `_headers` has only Cache-Control).

- [ ] **Step 3: Prepend the security block in the `_headers` writer**

In `build_deploy.py`, find the single line that writes `_headers` (line 380, begins `open(OUT+"/_headers","w",...).write("/*.html\n  Cache-Control...`). Change the written string so it STARTS with a `/*` security block, then the existing cache blocks. Replace:

```python
open(OUT+"/_headers","w",encoding="utf-8").write("/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n
```

(the opening of that `.write("...")` string) so the string now begins:

```python
open(OUT+"/_headers","w",encoding="utf-8").write("/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(), camera=(), microphone=(self)\n  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://sp-interview-proxy.netlify.app; frame-src 'self'; frame-ancestors 'self'\n/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n
```

Keep the remainder of the original string (the `/content/*`, `/audio/*`, … cache blocks) exactly as-is. Only the leading `/*` block and the reuse of the original `/*.html` block are involved. Do not change the `print(...)` line.

- [ ] **Step 4: Rebuild and run the check to verify it passes (both sites)**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
node tests/check-security-headers.mjs _build/ms3
node tests/check-security-headers.mjs _build/res
```
Expected: both `security headers OK` lines; both builds exit 0. (The resident site inherits `_headers` via copytree.)

- [ ] **Step 5: Local CSP smoke — serve and confirm nothing breaks**

Netlify's local dev applies `_headers`; a plain `http.server` does NOT, so verify CSP behavior against a Netlify context OR by reasoning through same-origin. At minimum, serve and confirm the app loads:
```bash
python3 -m http.server 4200 --directory _build/ms3 &
```
Open `http://localhost:4200/`, `?tool=question-bank-practice.html`, and `?tool=sp-interview.html`; confirm pages render and the SP setup panel appears. (Full CSP enforcement is verified post-deploy in Step 7.)

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_deploy.py tests/check-security-headers.mjs
git commit -m "sec: emit baseline security headers (CSP allows self + SP proxy) via build _headers"
```

- [ ] **Step 7: Post-deploy verification (merge gate)**

After deploy to a preview/prod, in the browser DevTools Network tab confirm on `une-ms3-psychiatry`: (a) topic pages render, (b) iframe tools load, (c) the Interview Room reaches `sp-interview-proxy.netlify.app` (no CSP `connect-src` violation in the console), (d) audio/video play, (e) no CSP violation errors in the console. **If any fail, roll back immediately** (Netlify → Deploys → last good → Publish) and widen the offending directive.

**Acceptance:** all five header families present in both builds' `_headers`; check script green; live site + SP proxy + iframe tools + audio all functional with no CSP console violations.
**Regression risk:** **medium — CSP can break loading.** The `connect-src` allowlist and `'unsafe-inline'` (required until tokens are extracted in WP-11) are the load-bearing parts; verify Step 7 before merge.

---

## Self-Review

**Spec coverage (Wave A packages):**
- WP-01 (CI on push) → Task 1 ✓
- WP-02 (exclude retired, keep drafts) → Task 2 ✓ (decision-log policy honored: drafts served + marked, retired excluded)
- WP-09 (security headers) → Task 3 ✓

**Placeholder scan:** No "TBD/handle-appropriately" steps; every code step shows exact code; every run step shows the command + expected result. ✓

**Type/name consistency:** `activeItems()` is defined once (Task 2 Step 3) and referenced by name in Steps 4.1/4.3/4.4 and the test count assertion. `BANK` is the existing module global (used at lines 284/535/558 pre-change). The check script path `tests/check-security-headers.mjs` and its arg (`_build/<site>`) match Steps 1/2/4. The Playwright spec filename `qbank-retired.spec.js` matches the `testMatch` registration and the `npx playwright test … qbank-retired.spec.js` invocations. ✓

**Cross-package:** Task 1 must merge before Tasks 2/3's pushes to gain CI coverage, but the three are otherwise independent (different files). ✓
