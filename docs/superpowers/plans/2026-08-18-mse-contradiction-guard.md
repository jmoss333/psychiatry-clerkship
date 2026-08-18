# Mental Status Exam Contradiction Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the MSE builder from retaining approved contradictory descriptor pairs while explaining each automatic replacement visibly and accessibly.

**Architecture:** Keep the feature inside the existing single-file React tool. A data-only pair registry and pure state-transition function own the clinical conflict contract; the current `pick()` adapter applies the result to React state and writes one polite status message. Dependency-free Node tests exercise the real state function, and Playwright verifies the built MS3 and resident tools through pointer, keyboard, draft, clipboard, reset, and accessibility journeys.

**Tech Stack:** React 18 UMD with ES5-style JavaScript, Node.js `node:test`, Playwright 1.62.1, Python static-site builders, Netlify-compatible static output.

**Spec:** `docs/superpowers/specs/2026-08-18-mse-contradiction-guard-design.md`

## Global Constraints

- Work only in the isolated `feat/mse-contradiction-guard` worktree created from current `origin/main`.
- Keep the MSE tool as one source HTML file; do not edit generated `_build/` output.
- Cover only the four approved conflict families: SI/HI absence versus positive findings, no delusions versus named delusions, no perceptual disturbance versus named/observed disturbances, and oriented x3 versus x4.
- Preserve `denies hallucinations` plus `responding to internal stimuli` as an allowed report-versus-observation combination.
- The newest selection wins; all older incompatible selections are removed in deterministic rule order.
- Do not change clinical teaching prose, add descriptors, infer diagnoses, score risk, recommend treatment, or alter disposition guidance.
- Do not change `reviewed.json`, `topic_meta.json`, attestation state, storage, analytics, server code, or deployment configuration.
- Keep pointer, touch, Enter, and Space on the same `pick()` path.
- Keep new JavaScript compatible with the file's `var`/`function` style; add no bundler or runtime dependency.
- Add exactly one persistent `role="status"` and `aria-live="polite"` region scoped to selection replacements; it must not receive focus.
- Follow red-green-refactor: observe each new test fail for the intended missing behavior before writing production code.
- Never generate or modify visual baselines on macOS.
- Do not push, merge, deploy, or claim faculty attestation as part of this plan.

---

## File Structure

- Modify: `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html`
  - Add conflict data, pure selection helpers, message helper, React status state, and the status region.
- Create: `tests/mse-builder.test.mjs`
  - Execute the real data and pure helpers extracted from the MSE source.
- Create: `tests/smoke/mse-builder.spec.js`
  - Exercise the built tool for both audiences.
- Modify: `tests/smoke/playwright.config.js`
  - Register the MSE smoke spec in `nav-ms3` and `nav-res`.

No other tracked file is in scope.

---

### Task 1: Pure Conflict State Machine

**Files:**
- Create: `tests/mse-builder.test.mjs`
- Modify: `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html:84-122`

**Interfaces:**
- Consumes: `DOMAINS`, whose records have `{key, options, single?}`.
- Produces: `MSE_CONFLICTS: Record<string, Array<[string,string]>>`.
- Produces: `applyMseSelection(selection, domainKey, option, singleChoice) -> {selection, removed}`.
- Guarantees: `selection` is copied and `removed` follows pair-registry order.

- [ ] **Step 1: Write the failing state-contract test**

Create `tests/mse-builder.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html',
  import.meta.url,
), 'utf8');

function make() {
  const start = source.indexOf('var DOMAINS = [');
  const end = source.indexOf('\nfunction App(){', start);
  assert.ok(start >= 0 && end > start, 'MSE helper boundary must remain extractable');
  const logic = source.slice(start, end);
  assert.match(logic, /var MSE_CONFLICTS\s*=/, 'the approved pair registry must exist');
  assert.match(logic, /function applyMseSelection\(/, 'the pure selection boundary must exist');
  // eslint-disable-next-line no-new-func
  return new Function(`${logic}\nreturn {DOMAINS:DOMAINS,MSE_CONFLICTS:MSE_CONFLICTS,applyMseSelection:applyMseSelection};`)();
}

const APPROVED_PAIRS = {
  thoughtContent: [
    ['no SI/HI', 'passive SI'],
    ['no SI/HI', 'active SI'],
    ['no SI/HI', 'homicidal ideation'],
    ['no delusions', 'paranoid delusions'],
    ['no delusions', 'grandiose delusions'],
  ],
  perception: [
    ['no perceptual disturbances', 'auditory hallucinations'],
    ['no perceptual disturbances', 'visual hallucinations'],
    ['no perceptual disturbances', 'responding to internal stimuli'],
  ],
  cognition: [['oriented x3', 'oriented x4']],
};

test('the registry contains exactly the approved pairs and every label exists', () => {
  const F = make();
  assert.deepEqual(F.MSE_CONFLICTS, APPROVED_PAIRS);
  for (const [domainKey, pairs] of Object.entries(F.MSE_CONFLICTS)) {
    const domain = F.DOMAINS.find((item) => item.key === domainKey);
    assert.ok(domain, `unknown conflict domain: ${domainKey}`);
    for (const pair of pairs) {
      assert.equal(pair.length, 2, `${domainKey} conflict entries must be pairs`);
      for (const label of pair) assert.ok(domain.options.includes(label), `${domainKey}: ${label}`);
    }
  }
});

test('each approved pair replaces in both selection orders', () => {
  const F = make();
  for (const [domainKey, pairs] of Object.entries(APPROVED_PAIRS)) {
    for (const [left, right] of pairs) {
      const forward = F.applyMseSelection({ [domainKey]: [left] }, domainKey, right, false);
      assert.deepEqual(forward.selection[domainKey], [right]);
      assert.deepEqual(forward.removed, [left]);
      const reverse = F.applyMseSelection({ [domainKey]: [right] }, domainKey, left, false);
      assert.deepEqual(reverse.selection[domainKey], [left]);
      assert.deepEqual(reverse.removed, [right]);
    }
  }
});

test('all stale conflicts are removed in registry order while unrelated findings survive', () => {
  const F = make();
  const input = {
    thoughtContent: ['active SI', 'homicidal ideation', 'obsessions', 'passive SI'],
    mood: ['"anxious"'],
  };
  const before = structuredClone(input);
  const result = F.applyMseSelection(input, 'thoughtContent', 'no SI/HI', false);
  assert.deepEqual(result.selection.thoughtContent, ['obsessions', 'no SI/HI']);
  assert.deepEqual(result.selection.mood, ['"anxious"']);
  assert.deepEqual(result.removed, ['passive SI', 'active SI', 'homicidal ideation']);
  assert.deepEqual(input, before, 'caller state must not be mutated');
  assert.notEqual(result.selection, input);
  assert.notEqual(result.selection.mood, input.mood);
});

test('report and observation remain allowed together', () => {
  const F = make();
  const result = F.applyMseSelection(
    { perception: ['denies hallucinations'] },
    'perception',
    'responding to internal stimuli',
    false,
  );
  assert.deepEqual(result.selection.perception, [
    'denies hallucinations',
    'responding to internal stimuli',
  ]);
  assert.deepEqual(result.removed, []);
});

test('ordinary multi-select and single-choice behavior are preserved', () => {
  const F = make();
  assert.deepEqual(
    F.applyMseSelection({ affect: ['labile'] }, 'affect', 'labile', false).selection.affect,
    [],
  );
  assert.deepEqual(
    F.applyMseSelection({ mood: ['"anxious"'] }, 'mood', '"angry"', true).selection.mood,
    ['"angry"'],
  );
  assert.deepEqual(
    F.applyMseSelection({ mood: ['"angry"'] }, 'mood', '"angry"', true).selection.mood,
    [],
  );
});

test('unknown selections and malformed conflict entries fail soft', () => {
  const F = make();
  assert.deepEqual(
    F.applyMseSelection({ cognition: ['alert'] }, 'unknown', 'unknown', false),
    { selection: { cognition: ['alert'] }, removed: [] },
  );
  F.MSE_CONFLICTS.cognition.push(['oriented x4'], null, ['oriented x4', 7]);
  assert.doesNotThrow(() => F.applyMseSelection(
    { cognition: ['oriented x3'] }, 'cognition', 'oriented x4', false,
  ));
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/mse-builder.test.mjs`

Expected: FAIL at `the approved pair registry must exist`; the current tool has neither required
interface.

- [ ] **Step 3: Add the minimal registry and pure state transition**

Insert after `DOMAINS` and before `function App()`:

```js
var MSE_CONFLICTS = {
  thoughtContent: [
    ['no SI/HI','passive SI'],
    ['no SI/HI','active SI'],
    ['no SI/HI','homicidal ideation'],
    ['no delusions','paranoid delusions'],
    ['no delusions','grandiose delusions']
  ],
  perception: [
    ['no perceptual disturbances','auditory hallucinations'],
    ['no perceptual disturbances','visual hallucinations'],
    ['no perceptual disturbances','responding to internal stimuli']
  ],
  cognition: [['oriented x3','oriented x4']]
};

function mseDomainByKey(domainKey){
  for(var i=0;i<DOMAINS.length;i++){
    if(DOMAINS[i].key===domainKey) return DOMAINS[i];
  }
  return null;
}

function applyMseSelection(selection, domainKey, option, singleChoice){
  var source=(selection&&typeof selection==='object')?selection:{};
  var next={};
  var key;
  for(key in source){
    if(Object.prototype.hasOwnProperty.call(source,key)){
      next[key]=Array.isArray(source[key])?source[key].slice():[];
    }
  }
  var domain=mseDomainByKey(domainKey);
  if(!domain||domain.options.indexOf(option)<0) return {selection:next,removed:[]};

  var cur=(next[domainKey]||[]).slice();
  var selectedIndex=cur.indexOf(option);
  var removed=[];
  if(singleChoice){
    cur=(selectedIndex===0)?[]:[option];
  }else if(selectedIndex>=0){
    cur.splice(selectedIndex,1);
  }else{
    var pairs=Array.isArray(MSE_CONFLICTS[domainKey])?MSE_CONFLICTS[domainKey]:[];
    for(var p=0;p<pairs.length;p++){
      var pair=pairs[p];
      if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||typeof pair[1]!=='string') continue;
      var other=null;
      if(pair[0]===option) other=pair[1];
      else if(pair[1]===option) other=pair[0];
      if(other===null) continue;
      var otherIndex=cur.indexOf(other);
      if(otherIndex>=0){ cur.splice(otherIndex,1); removed.push(other); }
    }
    cur.push(option);
  }
  next[domainKey]=cur;
  return {selection:next,removed:removed};
}
```

Do not wire `pick()` yet. This isolates the clinical state transition for review before it changes
learner-visible behavior.

- [ ] **Step 4: Run focused and full contract suites GREEN**

```bash
node --test tests/mse-builder.test.mjs
node --test tests/*.test.mjs
```

Expected: the focused file passes 6/6; the full suite passes 1,074/1,074—the 1,068-test baseline
plus six new contracts.

- [ ] **Step 5: Commit the state-machine unit**

```bash
git add tests/mse-builder.test.mjs \
  02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html
git commit -m "feat(mse): define contradiction state machine"
```

---

### Task 2: Accessible UI Wiring and Real-Browser Regression

**Files:**
- Modify: `tests/mse-builder.test.mjs`
- Create: `tests/smoke/mse-builder.spec.js`
- Modify: `tests/smoke/playwright.config.js:42-51`
- Modify: `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html:45-48,122-164,196-230`

**Interfaces:**
- Consumes: `applyMseSelection(selection, domainKey, option, singleChoice)` from Task 1.
- Produces: `mseReplacementMessage(option, removed) -> string`.
- Produces: `#mse-selection-status.selection-status[role="status"][aria-live="polite"]`.
- Preserves: `pick(dk,opt,single)`, `buildParagraph()`, `copyOut()`, and `reset()` entry points.

- [ ] **Step 1: Build the pre-wiring state and install pinned browser dependencies**

```bash
npm --prefix tests/smoke ci
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both builds pass. The built UI still reproduces the contradiction because `pick()` has
not yet been wired to Task 1.

- [ ] **Step 2: Write the failing browser contract**

Create `tests/smoke/mse-builder.spec.js`:

```js
import { test, expect } from '@playwright/test';

const TOOL = '/tools/mse.html';

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function observeAnnouncements(page) {
  await page.evaluate(() => {
    const status = document.querySelector('#mse-selection-status');
    window.__mseAnnouncements = [];
    new MutationObserver(() => {
      const text = status.textContent.trim();
      if (text) window.__mseAnnouncements.push(text);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
}

async function openBuilder(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(text) {
          window.__mseClipboard = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(TOOL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /2 · Build an MSE/i }).click();
  await expect(page.getByRole('checkbox', { name: 'no SI/HI', exact: true })).toBeVisible();
}

test('new contradictory finding replaces the old one in state, draft, status, and clipboard', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openBuilder(page);
  const absent = page.getByRole('checkbox', { name: 'no SI/HI', exact: true });
  const active = page.getByRole('checkbox', { name: 'active SI', exact: true });
  const status = page.locator('#mse-selection-status[role="status"][aria-live="polite"]');
  await expect(status).toHaveCount(1);
  await observeAnnouncements(page);
  await absent.click();
  await active.click();

  await expect(absent).toHaveAttribute('aria-checked', 'false');
  await expect(active).toHaveAttribute('aria-checked', 'true');
  await expect(status).toHaveText('Active SI replaced no SI/HI because these findings conflict.');
  await expect.poll(() => page.evaluate(() => window.__mseAnnouncements || [])).toContain(
    'Active SI replaced no SI/HI because these findings conflict.',
  );
  await expect(page.locator('.note')).toContainText('Thought content — active SI.');
  await expect(page.locator('.note')).not.toContainText('no SI/HI');

  await page.getByRole('button', { name: 'Copy as prose' }).click();
  await expect.poll(() => page.evaluate(() => window.__mseClipboard || '')).toContain('active SI');
  expect(await page.evaluate(() => window.__mseClipboard)).not.toContain('no SI/HI');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(active).toHaveAttribute('aria-checked', 'false');
  await expect(status).toBeEmpty();
  expect(errors).toEqual([]);
});

test('keyboard replacement matches pointer behavior and report-versus-observation remains allowed', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openBuilder(page);
  const none = page.getByRole('checkbox', { name: 'no delusions', exact: true });
  const paranoid = page.getByRole('checkbox', { name: 'paranoid delusions', exact: true });
  await none.focus();
  await page.keyboard.press('Space');
  await paranoid.focus();
  await page.keyboard.press('Enter');
  await expect(none).toHaveAttribute('aria-checked', 'false');
  await expect(paranoid).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#mse-selection-status')).toHaveText(
    'Paranoid delusions replaced no delusions because these findings conflict.',
  );

  const denied = page.getByRole('checkbox', { name: 'denies hallucinations', exact: true });
  const observed = page.getByRole('checkbox', { name: 'responding to internal stimuli', exact: true });
  await denied.click();
  await observed.click();
  await expect(denied).toHaveAttribute('aria-checked', 'true');
  await expect(observed).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.note')).toContainText(
    'Perception — denies hallucinations and responding to internal stimuli.',
  );
  expect(errors).toEqual([]);
});
```

Append `'mse-builder.spec.js'` to both `testMatch` arrays for `nav-ms3` and `nav-res` in
`tests/smoke/playwright.config.js`. Do not add it to unrelated projects.

- [ ] **Step 3: Run the browser contract against the pre-wiring build and verify RED**

```bash
mse_server_state="$(mktemp -d "${TMPDIR:-/tmp}/mse-smoke-red.XXXXXX")"
SMOKE_SERVER_STATE_DIR="$mse_server_state" bash tests/smoke/start-local-servers.sh
set +e
(
  cd tests/smoke
  npx playwright test mse-builder.spec.js --project=nav-ms3 --project=nav-res
)
mse_red_status=$?
set -e
while IFS=$'\t' read -r _ mse_pid _; do kill "$mse_pid"; done < "$mse_server_state/server-pids.tsv"
test "$mse_red_status" -ne 0
```

Expected: the contradiction journey fails because both chips remain checked and no
`#mse-selection-status` exists. The final command succeeds only when this intended RED occurs.

- [ ] **Step 4: Add and run a failing unit contract for replacement copy**

In `make()`, add
`assert.match(logic, /function mseReplacementMessage\(/, 'the replacement copy helper must exist');`
before `new Function`. Extend the harness return object with
`mseReplacementMessage:mseReplacementMessage`, then add:

```js
test('replacement copy is deterministic for one or several cleared findings', () => {
  const F = make();
  assert.equal(
    F.mseReplacementMessage('active SI', ['no SI/HI']),
    'Active SI replaced no SI/HI because these findings conflict.',
  );
  assert.equal(
    F.mseReplacementMessage('no SI/HI', ['passive SI', 'active SI', 'homicidal ideation']),
    'No SI/HI replaced passive SI, active SI, and homicidal ideation because these findings conflict.',
  );
  assert.equal(F.mseReplacementMessage('active SI', []), '');
});
```

Run: `node --test tests/mse-builder.test.mjs`

Expected: FAIL at `the replacement copy helper must exist`; this is the intended missing behavior,
not a harness error.

- [ ] **Step 5: Implement message helper, React wiring, status region, and reset behavior**

Add beside `applyMseSelection`:

```js
function mseJoinLabels(values){
  if(values.length>2) return values.slice(0,-1).join(', ')+', and '+values[values.length-1];
  return values.join(' and ');
}

function mseReplacementMessage(option, removed){
  if(!removed||!removed.length) return '';
  var subject=option.charAt(0).toUpperCase()+option.slice(1);
  return subject+' replaced '+mseJoinLabels(removed)+' because these findings conflict.';
}
```

Add status state beside `sel` and `copied`:

```js
var status = useState(''); var setStatus = status[1]; status = status[0];
```

Replace `pick()` and `reset()` with:

```js
function pick(dk, opt, single){
  var result=applyMseSelection(sel,dk,opt,!!single);
  setSel(result.selection);
  setCopied(false);
  setStatus(mseReplacementMessage(opt,result.removed));
}

function reset(){ setSel({}); setCopied(false); setStatus(''); }
```

Render immediately after the builder's introductory paragraph and before `DOMAINS.map(...)`:

```js
e('div',{
  id:'mse-selection-status',
  className:'selection-status',
  role:'status',
  'aria-live':'polite',
  'aria-atomic':'true'
},status),
```

Add beside `.count`:

```css
.selection-status{min-height:1.4em;margin:0 0 var(--sp2);font-size:.86rem;color:var(--accent-dark)}
```

Do not add timers, focus movement, disabled chips, or new clinical teaching copy.

- [ ] **Step 6: Run the focused unit suite GREEN**

Run: `node --test tests/mse-builder.test.mjs`

Expected: 7 tests, 7 pass, 0 fail.

- [ ] **Step 7: Rebuild both audiences and run the browser suite GREEN**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res

mse_server_state="$(mktemp -d "${TMPDIR:-/tmp}/mse-smoke-green.XXXXXX")"
SMOKE_SERVER_STATE_DIR="$mse_server_state" bash tests/smoke/start-local-servers.sh
set +e
(
  cd tests/smoke
  npx playwright test mse-builder.spec.js --project=nav-ms3 --project=nav-res
)
mse_green_status=$?
set -e
while IFS=$'\t' read -r _ mse_pid _; do kill "$mse_pid"; done < "$mse_server_state/server-pids.tsv"
test "$mse_green_status" -eq 0
```

Expected: 4 tests pass—two journeys in each audience—with no retries or runtime errors.

- [ ] **Step 8: Commit learner-visible behavior**

```bash
git add \
  02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html \
  tests/mse-builder.test.mjs \
  tests/smoke/mse-builder.spec.js \
  tests/smoke/playwright.config.js
git commit -m "fix(mse): prevent contradictory drafted findings"
```

---

### Task 3: Full Two-Site Verification and Scope Audit

**Files:**
- Verify only; no new tracked files.

**Interfaces:**
- Consumes: the implementation commits from Tasks 1 and 2.
- Produces: fresh root-contract, two-site build, full browser, and diff-scope evidence.

- [ ] **Step 1: Run the complete root contract suite**

Run: `node --test tests/*.test.mjs`

Expected: 1,075 tests, 1,075 pass, 0 fail—the baseline plus seven new MSE contracts.

- [ ] **Step 2: Run both authoritative build-and-static-QA gates sequentially**

Use the temporary virtual environment created for this worktree if system Python lacks pinned
`jsonschema`.

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both exit 0; schema, topic metadata, attestation, LFS, static QA, and search-quality
gates pass.

- [ ] **Step 3: Run both complete functional nav projects**

```bash
npm --prefix tests/smoke ci
mse_server_state="$(mktemp -d "${TMPDIR:-/tmp}/mse-smoke-final.XXXXXX")"
SMOKE_SERVER_STATE_DIR="$mse_server_state" bash tests/smoke/start-local-servers.sh
set +e
(
  cd tests/smoke
  npx playwright test --project=nav-ms3 --project=nav-res
)
mse_nav_status=$?
set -e
while IFS=$'\t' read -r _ mse_pid _; do kill "$mse_pid"; done < "$mse_server_state/server-pids.tsv"
test "$mse_nav_status" -eq 0
```

Expected: every MS3 and resident nav-project test passes without retry. Read the exact total from
fresh Playwright output because current main may add unrelated tests.

- [ ] **Step 4: Audit tracked scope and forbidden surfaces**

```bash
git diff --check origin/main...HEAD
git status --short --branch
git diff --name-only origin/main...HEAD
git diff --exit-code origin/main...HEAD -- \
  13_Faculty_Resources/reviewed.json \
  topic_meta.json \
  curriculum.json \
  curriculum.schema.json \
  CLAUDE.md \
  AGENTS.md
```

Expected:

- `git diff --check` prints nothing.
- The worktree has no uncommitted tracked or untracked files other than ignored build/dependency
  output.
- The name-only diff contains only the approved spec, this plan, the MSE source, Node contract,
  Playwright contract, and Playwright project registration.
- The forbidden-surface diff exits 0 and prints nothing.

- [ ] **Step 5: Review learner-facing source changes line by line**

```bash
git diff --word-diff=plain origin/main...HEAD -- \
  02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html
```

Confirm the diff contains only the approved pair registry, pure helpers, status state and
`pick()`/`reset()` wiring, one compact style, and one persistent status node. It must contain no
altered domain options, pearls, exemplar prose, attestation marker, version metadata, storage,
network call, or diagnostic/treatment language.

- [ ] **Step 6: Record evidence without pushing or deploying**

Report both implementation commit IDs, exact test/build counts, browser result, changed files, and
warnings separately from failures. Leave the branch local for explicit user review.

In layman's terms, completion means three independent things are true: the contradiction is
impossible in the state engine, a trainee cannot reproduce it with mouse or keyboard in either
site, and the rest of the library still builds and behaves as before.
