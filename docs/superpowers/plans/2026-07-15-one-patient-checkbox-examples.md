# One Patient, Six Weeks Checkbox Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reveal one short, clinically cautious learner-voice model response after each of the 18 checkboxes in the One Patient, Six Weeks tool.

**Architecture:** Keep the curriculum copy in `longitudinal_case.json` by changing each checklist string into a `{prompt, example}` object. The static tool derives reveal visibility from the existing checkbox state, so the `cw_longitudinal_v1` storage shape and privacy boundary do not change. Extend the current Python data contract and Playwright smoke suite before changing their corresponding production files.

**Tech Stack:** Static HTML/CSS/JavaScript, JSON, Python 3 contract checks, Playwright 1.46.1, existing MS3/resident site-build pipeline.

## Global Constraints

- Keep exactly six weeks and exactly three checklist items per week.
- Label every revealed response **One way to say it**.
- Each response is one or two sentences written in the learner's voice.
- Preserve diagnostic uncertainty and distinguish patient report, collateral report, observation, and interpretation.
- Do not add patient-specific treatment recommendations, dosing, promised outcomes, scoring, analytics, or learner-authored free text.
- Safety-sensitive examples use direct suicide inquiry and explicitly preserve immediate supervision.
- Keep `cw_longitudinal_v1`; store only the current week, checkbox state, and completion date.
- Keep `reviewed.json` status unchanged as faculty review pending.
- Escape both `prompt` and `example` before inserting them into HTML.
- Use native checkboxes, visible labels, DOM reading order, and `aria-describedby` for checked-item examples.

## File map

- Modify `13_Faculty_Resources/_automation/test_longitudinal_case.py`: enforce the new structured checklist data contract.
- Modify `longitudinal_case.json`: pair each checklist prompt with its canonical model response.
- Create `tests/smoke/longitudinal-case.spec.js`: verify reveal, hide, accessibility, and local-storage behavior in a real browser.
- Modify `tests/smoke/playwright.config.js`: include the focused case test in both existing local-build navigation projects.
- Modify `08_Cases_and_Simulation/one-patient-six-weeks.html`: render and style the model response only when its checkbox is checked.

---

### Task 1: Make model responses part of the longitudinal-case data contract

**Files:**
- Modify: `13_Faculty_Resources/_automation/test_longitudinal_case.py:33-45`
- Modify: `longitudinal_case.json:17-145`

**Interfaces:**
- Consumes: each `weeks[*].checklist` array in `longitudinal_case.json`.
- Produces: exactly three objects per week, each with nonblank string properties `prompt` and `example`.

- [ ] **Step 1: Write the failing structured-checklist contract**

In `13_Faculty_Resources/_automation/test_longitudinal_case.py`, replace the current checklist-length assertion with this contract before the existing link loop:

```python
        checklist = week["checklist"]
        assert len(checklist) == 3, f"{week['id']} must contain exactly three checklist items"
        for index, item in enumerate(checklist):
            assert isinstance(item, dict), (
                f"{week['id']} checklist item {index} must be an object"
            )
            assert isinstance(item.get("prompt"), str) and item["prompt"].strip(), (
                f"{week['id']} checklist item {index} needs a nonblank prompt"
            )
            assert isinstance(item.get("example"), str) and item["example"].strip(), (
                f"{week['id']} checklist item {index} needs a nonblank example"
            )
```

- [ ] **Step 2: Run the contract and verify the expected red state**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
```

Expected: FAIL with `week1 checklist item 0 must be an object`. This confirms the test rejects the current string-only checklist data.

- [ ] **Step 3: Convert all 18 checklist entries to prompt/example objects**

In `longitudinal_case.json`, replace each week's `checklist` array with the corresponding array below.

Week 1:

```json
"checklist": [
  {
    "prompt": "I can state what changed, when it changed, and who noticed it.",
    "example": "Jordan reports several nights of very little sleep before admission. Jordan describes feeling exhausted, while the family noticed escalating mood and communication changes."
  },
  {
    "prompt": "I can name one alliance move that gives Jordan more control.",
    "example": "I might begin, \"I have read the admission note, but I want to understand what this was like for you. Would you rather start with the sleep changes or with what brought you here?\""
  },
  {
    "prompt": "I can separate observed MSE findings from my interpretation.",
    "example": "I observed brief answers and limited eye contact. I interpret this as guardedness, although fatigue or mistrust could also contribute."
  }
]
```

Week 2:

```json
"checklist": [
  {
    "prompt": "I can describe the syndrome without prematurely closing on a diagnosis.",
    "example": "Jordan has a syndrome of reduced sleep, racing thoughts, unusual confidence, and intermittently feeling watched. Whether this reflects a primary mood disorder, substance effects, or a medical contributor remains uncertain."
  },
  {
    "prompt": "I can name the data that would increase or decrease confidence in each leading explanation.",
    "example": "A prior episode with the same symptoms in the absence of substance exposure would increase my confidence in a primary mood disorder. A tight timeline with an exposure or a new medical finding would shift that confidence."
  },
  {
    "prompt": "I can ask collateral questions that clarify baseline and longitudinal course.",
    "example": "I would ask, \"Before this episode, what were Jordan's usual sleep, energy, speech, and daily functioning, and when did each of those begin to change?\""
  }
]
```

Week 3:

```json
"checklist": [
  {
    "prompt": "I can ask what improvement would matter most to Jordan.",
    "example": "I might ask, \"If treatment were helping in a way that mattered to you, what would you notice first—better sleep, clearer thinking, more energy, or something else?\""
  },
  {
    "prompt": "I can explain uncertainty and monitoring without promising a specific outcome.",
    "example": "We have seen your sleep improve, but we cannot know yet which changes will last or which burdens will ease. The supervising team will keep checking benefits and side effects with you as the plan evolves."
  },
  {
    "prompt": "I can bring medication questions to the supervising team instead of giving an unsupervised recommendation.",
    "example": "I would tell my supervisor, \"Jordan reports improved sleep but troubling slowing and is unsure about continuing. Could we review the likely benefits, adverse effects, alternatives, and monitoring together before I answer?\""
  }
]
```

Week 4:

```json
"checklist": [
  {
    "prompt": "I can explain the purpose and boundaries of family involvement.",
    "example": "I might say, \"A family meeting can help us understand what changed and plan support after discharge. I want to ask what you are comfortable discussing, and I will confirm the confidentiality boundaries with my supervisor before we meet.\""
  },
  {
    "prompt": "I can ask for observations rather than inviting labels or arguments.",
    "example": "I would ask, \"What specific changes did you notice in Jordan's sleep, speech, spending, or daily functioning, and when did they begin?\""
  },
  {
    "prompt": "I can turn family concerns into concrete questions for the team and discharge plan.",
    "example": "The family is worried about sleepless nights and medication support. I would ask the team who will monitor sleep, how medication access will be handled, and whom the family should contact if symptoms return."
  }
]
```

Week 5:

```json
"checklist": [
  {
    "prompt": "I can ask directly about suicidal thoughts, intent, plan, access, and immediate safety.",
    "example": "I would ask, \"When you say it might be easier to disappear, are you thinking about killing yourself? Do you have a plan, intent, access to what you would use, or concern that you might act right now?\""
  },
  {
    "prompt": "I can state what I heard and what I need to discuss with my supervisor now.",
    "example": "I might say, \"I am concerned by what you just told me. I need to bring my supervisor in now so we can help keep you safe, and I will stay with you while we do that.\""
  },
  {
    "prompt": "I can avoid treating a screening result as a complete risk formulation.",
    "example": "Jordan's screening response is one data point. I also need to integrate the exact statement, intent, plan, access, behavior, acute stressor, protective factors, and remaining uncertainty with my supervisor."
  }
]
```

Week 6:

```json
"checklist": [
  {
    "prompt": "I can explain how the working formulation changed as new data arrived.",
    "example": "I initially described a mood syndrome while keeping primary, substance-related, and medical causes open. Collateral and the observed course changed their relative likelihoods, and I would name which data drove each update rather than claim certainty."
  },
  {
    "prompt": "I can present current risks, strengths, needs, and unanswered questions without overclaiming.",
    "example": "Current concerns include recurrence after discharge and unresolved medication ambivalence; strengths include improved sleep and family involvement. We still need clarity about follow-up ownership and the response to early warning signs."
  },
  {
    "prompt": "I can name one relational skill I want to carry into the next rotation.",
    "example": "I want to carry forward the habit of naming uncertainty out loud while still offering the patient and team a clear next step."
  }
]
```

- [ ] **Step 4: Run the data contract and JSON parser to verify green**

Run:

```bash
python3 -m json.tool longitudinal_case.json >/dev/null
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
```

Expected: both commands exit 0, and the second prints `test_longitudinal_case: OK — six weeks, registered links, review metadata, and anonymous storage contract`.

- [ ] **Step 5: Review the clinical-copy boundary**

Run:

```bash
python3 - <<'PY'
import json

case = json.load(open("longitudinal_case.json", encoding="utf-8"))
items = [item for week in case["weeks"] for item in week["checklist"]]
assert len(items) == 18
assert all(set(item) == {"prompt", "example"} for item in items)
assert all(0 < len(item["example"].split()) <= 55 for item in items)
assert "supervisor" in case["weeks"][4]["checklist"][1]["example"].lower()
assert "killing yourself" in case["weeks"][4]["checklist"][0]["example"].lower()
print("18 concise examples; direct safety language and supervision preserved")
PY
```

Expected: `18 concise examples; direct safety language and supervision preserved`.

- [ ] **Step 6: Commit the data contract and curriculum copy**

```bash
git add 13_Faculty_Resources/_automation/test_longitudinal_case.py longitudinal_case.json
git commit -m "feat: add model responses to longitudinal checklist data"
```

---

### Task 2: Reveal and hide each model response accessibly

**Files:**
- Create: `tests/smoke/longitudinal-case.spec.js`
- Modify: `tests/smoke/playwright.config.js:31-43`
- Modify: `08_Cases_and_Simulation/one-patient-six-weeks.html:57-64,125`

**Interfaces:**
- Consumes: `{prompt: string, example: string}` entries from `weeks[*].checklist` and existing completion booleans named `c0`, `c1`, and `c2`.
- Produces: `check-<week-id>-<check-key>` checkbox IDs, checked-only `example-<week-id>-<check-key>` reveal IDs, and checked-only `aria-describedby` relationships.

- [ ] **Step 1: Write the failing browser behavior test**

Create `tests/smoke/longitudinal-case.spec.js` with:

```javascript
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('cw_longitudinal_v1');
  });
});

test('checked item reveals one accessible model response without storing its text', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/tools/one-patient-six-weeks.html?week=1`, {
    waitUntil: 'domcontentloaded',
  });

  const checkbox = page.getByLabel(
    'I can state what changed, when it changed, and who noticed it.',
  );
  const example = page.locator('#example-week1-c0');

  await expect(checkbox).toBeVisible();
  await expect(example).toHaveCount(0);

  await checkbox.check();

  await expect(example).toBeVisible();
  await expect(example.getByText('One way to say it', { exact: true })).toBeVisible();
  await expect(example).toContainText('Jordan reports several nights of very little sleep');
  await expect(checkbox).toHaveAttribute('aria-describedby', 'example-week1-c0');

  const stored = await page.evaluate(() => window.localStorage.getItem('cw_longitudinal_v1'));
  expect(stored).not.toContain('Jordan reports several nights');
  expect(JSON.parse(stored)).toMatchObject({
    version: 1,
    completed: { week1: { checks: { c0: true } } },
  });

  await checkbox.uncheck();

  await expect(example).toHaveCount(0);
  await expect(checkbox).not.toHaveAttribute('aria-describedby', 'example-week1-c0');
});
```

- [ ] **Step 2: Include the test in both local-build smoke projects**

In `tests/smoke/playwright.config.js`, change the two navigation projects to:

```javascript
    {
      name: 'nav-ms3',
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js'],
      use: { ...devices['Desktop Chrome'], baseURL: MS3_URL },
    },
    {
      name: 'nav-res',
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js'],
      use: { ...devices['Desktop Chrome'], baseURL: RES_URL },
    },
```

- [ ] **Step 3: Build the current page and verify the expected browser-test red state**

From the repository root, run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
python3 -m http.server 4200 --directory _build/ms3 >/tmp/one-patient-six-weeks-http.log 2>&1 &
SERVER_PID=$!
cd tests/smoke
npm ci
/usr/local/bin/node node_modules/@playwright/test/cli.js test longitudinal-case.spec.js --project=nav-ms3
TEST_STATUS=$?
kill "$SERVER_PID"
exit "$TEST_STATUS"
```

Expected: FAIL because the current renderer treats a checklist object as text, so the labeled checkbox cannot be found. If `/usr/local/bin/node` is unavailable, use `npx playwright test longitudinal-case.spec.js --project=nav-ms3`; do not change repository dependencies.

- [ ] **Step 4: Add the checked-item and example styles**

In `08_Cases_and_Simulation/one-patient-six-weeks.html`, replace the existing `.checks`, `.check`, `.check:hover`, `.check input`, and `.check.done` rules with:

```css
.checks{display:grid;gap:7px}
.checkitem{border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--muted);overflow:hidden}
.checkitem:hover{border-color:var(--teal)}
.checkitem.done{background:var(--teal-soft);color:var(--teal-dark)}
.check{display:flex;align-items:flex-start;gap:9px;padding:10px;color:inherit;cursor:pointer}
.check input{width:18px;height:18px;flex:none;margin:1px 0 0;accent-color:var(--teal)}
.example{border-top:1px solid #b9d5ce;border-left:4px solid var(--teal);background:var(--surface);padding:10px 12px;margin:0 10px 10px;color:var(--muted)}
.example-label{display:block;text-transform:uppercase;letter-spacing:.08em;color:var(--teal-dark);font-size:.7rem;font-weight:900;margin-bottom:3px}
.example p{margin:0}
```

- [ ] **Step 5: Render prompt objects and checked-only examples**

In `08_Cases_and_Simulation/one-patient-six-weeks.html`, replace the one-line `checklist(w)` function with:

```javascript
  function checklist(w){
    var r=record(w.id);
    return '<div><p class="check-title">Before you move on</p><div class="checks">'+w.checklist.map(function(item,i){
      var key='c'+i;
      var on=!!r.checks[key];
      var inputId='check-'+w.id+'-'+key;
      var exampleId='example-'+w.id+'-'+key;
      return '<div class="checkitem'+(on?' done':'')+'"><label class="check" for="'+inputId+'"><input id="'+inputId+'" type="checkbox" data-check="'+key+'" '+(on?'checked aria-describedby="'+exampleId+'"':'')+'> <span>'+esc(item.prompt)+'</span></label>'+(on?'<div class="example" id="'+exampleId+'"><span class="example-label">One way to say it</span><p>'+esc(item.example)+'</p></div>':'')+'</div>';
    }).join('')+'</div></div>';
  }
```

Do not change `record`, `complete`, `saveProgress`, the checkbox change handler, the storage key, or reset behavior. The reveal must remain a pure rendering consequence of the existing boolean.

- [ ] **Step 6: Rebuild and verify the focused test is green**

From the repository root, run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
python3 -m http.server 4200 --directory _build/ms3 >/tmp/one-patient-six-weeks-http.log 2>&1 &
SERVER_PID=$!
cd tests/smoke
/usr/local/bin/node node_modules/@playwright/test/cli.js test longitudinal-case.spec.js --project=nav-ms3
TEST_STATUS=$?
kill "$SERVER_PID"
exit "$TEST_STATUS"
```

Expected: `1 passed`. If `/usr/local/bin/node` is unavailable, use the `npx playwright` command from Step 3.

- [ ] **Step 7: Commit the accessible reveal interaction**

```bash
git add 08_Cases_and_Simulation/one-patient-six-weeks.html tests/smoke/longitudinal-case.spec.js tests/smoke/playwright.config.js
git commit -m "feat: reveal examples after longitudinal checkboxes"
```

---

### Task 3: Verify the complete learner-facing change

**Files:**
- Verify: `longitudinal_case.json`
- Verify: `08_Cases_and_Simulation/one-patient-six-weeks.html`
- Verify: `13_Faculty_Resources/_automation/test_longitudinal_case.py`
- Verify: `tests/smoke/longitudinal-case.spec.js`
- Verify: `tests/smoke/playwright.config.js`

**Interfaces:**
- Consumes: the complete data and UI changes from Tasks 1 and 2.
- Produces: evidence that the contract, both published builds, and the browser behavior pass without changing review or storage boundaries.

- [ ] **Step 1: Run the longitudinal contract and privacy assertions**

```bash
python3 -m json.tool longitudinal_case.json >/dev/null
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
rg -n 'cw_longitudinal_v1|No free-text patient data|Faculty review pending' 08_Cases_and_Simulation/one-patient-six-weeks.html longitudinal_case.json
```

Expected: JSON and contract checks exit 0; the search shows the unchanged storage key, privacy label, and pending-review label.

- [ ] **Step 2: Build and statically validate both learner sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both commands exit 0 and end with `build_and_check: ms3 OK` and `build_and_check: res OK`. Report any pre-existing soft metadata warnings separately from hard failures caused by this change.

- [ ] **Step 3: Run the focused browser test against both builds**

From the repository root, run:

```bash
python3 -m http.server 4200 --directory _build/ms3 >/tmp/one-patient-six-weeks-ms3.log 2>&1 &
MS3_PID=$!
python3 -m http.server 4201 --directory _build/res >/tmp/one-patient-six-weeks-res.log 2>&1 &
RES_PID=$!
cd tests/smoke
/usr/local/bin/node node_modules/@playwright/test/cli.js test longitudinal-case.spec.js --project=nav-ms3 --project=nav-res
TEST_STATUS=$?
kill "$MS3_PID" "$RES_PID"
exit "$TEST_STATUS"
```

Expected: `2 passed`. If `/usr/local/bin/node` is unavailable, use `npx playwright test longitudinal-case.spec.js --project=nav-ms3 --project=nav-res`.

- [ ] **Step 4: Review the final patch and repository state**

```bash
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted implementation files, and four focused commits: the approved design, implementation plan, structured checklist data, and accessible reveal interaction. The implementation does not modify `reviewed.json`, `tool_registry.json`, or the local-storage version.

## Concrete next best option

After this change receives faculty content review, add an optional **Say yours first** cue before reveal. Keep it stateless and do not collect learner speech or text.

## Innovative follow-up

Create a Week 6 retrieval challenge that selects earlier prompts, hides their models, and asks the learner to produce a concise longitudinal handoff before comparing with the examples. Treat that as a separate design because it introduces sequencing and assessment behavior beyond this feature.
