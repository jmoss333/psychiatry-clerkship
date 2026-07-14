# Alex Tour Standardized-Patient Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Alex test the live standardized-patient interview while ensuring the separately shared
passcode survives only for the current browser tab, can be cleared visibly, and is never written to
the tour or persistent browser storage.

**Architecture:** Keep the public proxy endpoint in `localStorage`, migrate the passcode to
`sessionStorage`, remove the legacy persistent key on every initialization, and expose a clear action
inside the existing setup panel. Apply the same behavior to the canonical and preview HTML copies,
then enforce it with a zero-dependency source-contract test and the existing simulation suites.

**Tech Stack:** Single-file React 18 UMD, raw `React.createElement`, browser Storage APIs, Node.js 18+
built-ins, existing shell test harness, canonical MS3/resident site builders.

## Global Constraints

- Never place the real passcode in source, URLs, shell history, test fixtures, screenshots, logs,
  commits, browser automation, or agent output.
- Joshua sends the passcode to Alex separately and performs the final live-credential connection
  check manually.
- Keep `https://sp-interview-proxy.netlify.app/api/sp` as the public prefilled endpoint.
- Keep Live mode as the default and keep setup auto-opening when a fresh tab has no passcode.
- Do not change the simulated case, gate logic, scoring, PHI heuristic, or proxy behavior.
- Do not weaken the current leak or client/server parity tests.
- Closing the tab, selecting **Clear passcode**, or starting in a fresh tab must remove credential
  availability without removing the saved endpoint.
- Advise Joshua to rotate the shared student passcode after the external demonstration window.

---

## File Structure

- Modify: `_prototypes/sp-interview/sp-interview.html`
- Modify: `_prototypes/sp-interview/sp-interview.preview.html`
- Modify: `_prototypes/sp-interview/tests/smoke.test.js`
- Modify: `_prototypes/sp-interview/tests/parity.test.mjs`
- Modify: `_prototypes/sp-interview/tests/run-all.sh`
- Create: `_prototypes/sp-interview/tests/storage.test.mjs`

---

## Task 1: Reconfirm the Existing Simulation Baseline

**Files:** Read only.

- [ ] **Step 1: Inspect repository state**

Run:

```bash
cd "/Users/jm/Psychiatry-Clerkship-Library-alex-tour"
git status --short --branch
git diff -- _prototypes/sp-interview
```

Expected: no unplanned changes in the standardized-patient files.

- [ ] **Step 2: Run the existing suite before edits**

Run:

```bash
bash _prototypes/sp-interview/tests/run-all.sh
```

Expected:

```text
ALL SUITES PASSED
```

- [ ] **Step 3: Capture the current unsafe storage contract**

Run:

```bash
rg -n "localStorage.*cw_sp_passcode|cw_sp_passcode.*localStorage" \
  _prototypes/sp-interview/sp-interview.html \
  _prototypes/sp-interview/sp-interview.preview.html
```

Expected: both files currently read and write the passcode through `localStorage`. This is the defect
the new test must catch.

---

## Task 2: Add a Failing Passcode-Storage Contract Test

**Files:**

- Create: `_prototypes/sp-interview/tests/storage.test.mjs`
- Modify: `_prototypes/sp-interview/tests/run-all.sh`

- [ ] **Step 1: Write the source-contract test**

Create `_prototypes/sp-interview/tests/storage.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['sp-interview.html', 'sp-interview.preview.html'];

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const label = `${file}:`;

  assert.match(
    html,
    /localStorage\.getItem\(\s*['"]cw_sp_endpoint['"]\s*\)/,
    `${label} endpoint must persist`,
  );
  assert.match(
    html,
    /localStorage\.setItem\(\s*['"]cw_sp_endpoint['"]/,
    `${label} endpoint must persist`,
  );
  assert.match(
    html,
    /sessionStorage\.getItem\(\s*['"]cw_sp_passcode['"]\s*\)/,
    `${label} passcode must load from sessionStorage`,
  );
  assert.match(
    html,
    /sessionStorage\.setItem\(\s*['"]cw_sp_passcode['"]/,
    `${label} passcode must save to sessionStorage`,
  );
  assert.match(
    html,
    /sessionStorage\.removeItem\(\s*['"]cw_sp_passcode['"]\s*\)/,
    `${label} passcode must have a clear path`,
  );
  assert.match(
    html,
    /localStorage\.removeItem\(\s*['"]cw_sp_passcode['"]\s*\)/,
    `${label} legacy persistent passcode must be deleted`,
  );
  assert.match(
    html,
    /useEffect\(function\(\)\{[\s\S]{0,240}clearLegacyPasscode\(\)/,
    `${label} legacy passcode cleanup must run on initialization`,
  );
  assert.doesNotMatch(
    html,
    /localStorage\.(?:getItem|setItem)\(\s*['"]cw_sp_passcode['"]/,
    `${label} passcode must never be read from or written to localStorage`,
  );
  assert.match(html, /Clear passcode/, `${label} clear action must be visible`);
  if (file === 'sp-interview.html') {
    assert.match(
      html,
      /https:\/\/sp-interview-proxy\.netlify\.app\/api\/sp/,
      `${label} production endpoint must remain prefilled`,
    );
  }
}

console.log('PASS — passcode is tab-scoped in canonical and preview tools');
```

- [ ] **Step 2: Register the test in the suite**

Add before the leak check in `run-all.sh`:

```bash
echo "── tab-scoped credential storage ──"; node storage.test.mjs
```

- [ ] **Step 3: Run the new test and verify red**

Run:

```bash
node _prototypes/sp-interview/tests/storage.test.mjs
```

Expected: failure on the first missing `sessionStorage` assertion.

---

## Task 3: Teach the Existing Node Harnesses About Session Storage

**Files:**

- Modify: `_prototypes/sp-interview/tests/smoke.test.js`
- Modify: `_prototypes/sp-interview/tests/parity.test.mjs`

- [ ] **Step 1: Expand the smoke-test storage stubs**

Replace the current `localStorage` stub with:

```javascript
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
```

- [ ] **Step 2: Expand the parity-test storage stubs**

Use the same two lines in `parity.test.mjs` immediately before the React stubs.

- [ ] **Step 3: Run the original suites**

Run:

```bash
node _prototypes/sp-interview/tests/smoke.test.js
node _prototypes/sp-interview/tests/parity.test.mjs
node _prototypes/sp-interview/tests/leak.test.mjs
```

Expected: the existing simulation behavior remains green. The new storage test remains red until the
application code changes.

---

## Task 4: Implement Tab-Scoped Passcode Helpers

**Files:**

- Modify: `_prototypes/sp-interview/sp-interview.html`
- Modify: `_prototypes/sp-interview/sp-interview.preview.html`

- [ ] **Step 1: Add storage helpers beside the current configuration code**

Add the same helpers in both files:

```javascript
function clearLegacyPasscode(){
  try{localStorage.removeItem('cw_sp_passcode');}catch(x){}
}
function readPasscode(){
  try{return sessionStorage.getItem('cw_sp_passcode')||'';}catch(x){return '';}
}
function writePasscode(value){
  try{
    if(value){sessionStorage.setItem('cw_sp_passcode',value);}
    else{sessionStorage.removeItem('cw_sp_passcode');}
  }catch(x){}
}
```

These helpers deliberately do not migrate an old secret into the new store. They delete the old
persistent value and require re-entry.

- [ ] **Step 2: Replace `loadCfg()` without erasing preview-specific behavior**

In `sp-interview.html`, use:

```javascript
function loadCfg(){
  var ep='',pc='';
  clearLegacyPasscode();
  try{
    ep=localStorage.getItem('cw_sp_endpoint')||
      'https://sp-interview-proxy.netlify.app/api/sp';
  }catch(x){}
  pc=readPasscode();
  return {ep:ep,pc:pc,msg:''};
}
```

In `sp-interview.preview.html`, preserve its intentionally empty draft endpoint:

```javascript
function loadCfg(){
  var ep='',pc='';
  clearLegacyPasscode();
  try{ep=localStorage.getItem('cw_sp_endpoint')||'';}catch(x){}
  pc=readPasscode();
  return {ep:ep,pc:pc,msg:''};
}
```

Do not copy the production file wholesale over the preview. The preview intentionally keeps Mock as
its default and embeds a draft pack; only the storage boundary, explanatory copy, and clear action
should match.

- [ ] **Step 3: Replace the storage lines in `saveAndTest()`**

Use:

```javascript
try{localStorage.setItem('cw_sp_endpoint',ep);}catch(x){}
writePasscode(cfg.pc||'');
```

Do not log the passcode or include it in an error message.

- [ ] **Step 4: Update initialization without changing preview defaults**

In `sp-interview.html`, replace the current Live-mode effect with:

```javascript
useEffect(function(){
  clearLegacyPasscode();
  if(provMode==='live'&&!readPasscode()){openSettings();}
},[]);
```

In `sp-interview.preview.html`, add only legacy cleanup on initialization:

```javascript
useEffect(function(){clearLegacyPasscode();},[]);
```

Do not auto-open Live setup in the preview; its intentional default remains Mock mode.

- [ ] **Step 5: Replace credential reads in `makeProvider()`**

Use:

```javascript
var ep=null,pc=null;
try{ep=localStorage.getItem('cw_sp_endpoint');}catch(x){}
pc=readPasscode();
```

The provider receives the credential only in memory for the current request. No new persistence or
logging is added.

---

## Task 5: Add the Visible Clear-Passcode Action

**Files:**

- Modify: `_prototypes/sp-interview/sp-interview.html`
- Modify: `_prototypes/sp-interview/sp-interview.preview.html`

- [ ] **Step 1: Add the clear handler beside `saveAndTest()`**

Use:

```javascript
function clearPasscode(){
  writePasscode('');
  clearLegacyPasscode();
  if(E&&E.provider&&('passcode' in E.provider)){E.provider.passcode='';}
  setCfg(function(c){
    return Object.assign({},c,{pc:'',msg:'Passcode cleared for this browser tab.'});
  });
  announce('Passcode cleared for this browser tab.');
}
```

Clearing the active `ProxyProvider.passcode` prevents an encounter that was already instantiated from
continuing to use an in-memory copy after the visible clear action.

- [ ] **Step 2: Add a visible button to the setup action row**

Place the secondary action beside **Save & test connection**:

```javascript
e('button',{className:'btn',type:'button',onClick:clearPasscode},'Clear passcode')
```

Keep the save button primary. Do not hide the clear button when the field is empty; its presence
teaches the storage model.

- [ ] **Step 3: Add concise storage guidance below the passcode field**

Use this visible text:

```text
The passcode is kept only for this browser tab. Close the tab or select Clear passcode to remove it.
```

Do not imply that `sessionStorage` is authentication or that it protects a compromised device.

- [ ] **Step 4: Keep setup discoverable**

Confirm the existing `⚙ setup` badge remains in Live mode and the setup panel still opens
automatically when `readPasscode()` is empty.

---

## Task 6: Verify Source Contracts and Simulation Behavior

**Files:** All files in this plan.

- [ ] **Step 1: Run the full SP suite**

Run:

```bash
bash _prototypes/sp-interview/tests/run-all.sh
```

Expected: every scenario, client/server parity check, storage contract, and gated-content leak check
passes, ending with `ALL SUITES PASSED`.

- [ ] **Step 2: Prove no persistent passcode read/write remains**

Run:

```bash
if rg -n "localStorage\.(getItem|setItem)\('cw_sp_passcode'" \
  _prototypes/sp-interview/sp-interview.html \
  _prototypes/sp-interview/sp-interview.preview.html; then
  exit 1
fi
rg -n "sessionStorage\.(getItem|setItem|removeItem)\('cw_sp_passcode'" \
  _prototypes/sp-interview/sp-interview.html \
  _prototypes/sp-interview/sp-interview.preview.html
```

Expected: the first search returns no match; the second shows get, set, and remove paths in both
files.

- [ ] **Step 3: Run both canonical site builds**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git diff --check
```

Expected: both builds pass. Preserve and report the known unrelated `rapid_review.md` metadata
warning if it appears.

- [ ] **Step 4: Commit the safety change separately**

Run:

```bash
git add \
  _prototypes/sp-interview/sp-interview.html \
  _prototypes/sp-interview/sp-interview.preview.html \
  _prototypes/sp-interview/tests/smoke.test.js \
  _prototypes/sp-interview/tests/parity.test.mjs \
  _prototypes/sp-interview/tests/storage.test.mjs \
  _prototypes/sp-interview/tests/run-all.sh
git commit -m "fix(sp-interview): scope passcode to browser tab"
```

---

## Task 7: Browser Verification Without Capturing a Credential

- [ ] **Step 1: Verify the no-credential setup path**

Open:

```text
https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html
```

Before production deployment, use the locally built or branch-preview equivalent. In a fresh tab,
verify:

1. Live mode is selected.
2. The setup panel opens automatically.
3. `⚙ setup` remains visible after closing the panel.
4. The endpoint is prefilled.
5. The passcode field is empty.
6. The tab-scoped storage explanation and **Clear passcode** action are visible.

- [ ] **Step 2: Verify wrong-key handling with a synthetic value**

Enter a deliberately invalid synthetic value such as `not-a-real-passcode`, select **Save & test
connection**, and verify the tool rejects it without a console error or UI disclosure. Clear it
immediately. Never use or record the real passcode in automation.

- [ ] **Step 3: Verify the storage lifecycle manually**

Using only the synthetic invalid value:

1. Confirm the endpoint exists in `localStorage`.
2. Confirm `cw_sp_passcode` does not exist in `localStorage`.
3. Confirm the synthetic value exists in `sessionStorage` only until **Clear passcode** is selected.
4. Confirm closing the tab and reopening the tool yields an empty passcode field.

- [ ] **Step 4: Joshua performs the live connection check**

Joshua enters the separately held passcode himself and verifies **Connected**, then starts either
**Supported** or **Realistic** mode. The agent does not inspect, copy, log, or retain the credential.

- [ ] **Step 5: Record the operational follow-through**

Add to the handoff, not the public page:

```text
Rotate the shared student passcode after Alex's demonstration window closes.
```

This is the concrete next security step after the tour is sent.
