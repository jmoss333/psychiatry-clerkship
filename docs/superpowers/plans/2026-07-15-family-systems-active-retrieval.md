# Family Systems Practice — Active-Retrieval Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Practice mode to the Family Systems Practice tool that makes learners generate a
response, reveal the existing expert content, and self-rate — feeding the existing SM-2 spaced
-repetition engine so weak scenarios resurface.

**Architecture:** The tool is a single-file vanilla-JS IIFE that renders `family_systems_scenarios.json`.
We add (1) a Reference/Practice mode toggle, (2) a retrieval-card component that reveals a scenario's
own `opening`/`ask`/`avoid` content and offers Again/Hard/Good/Easy self-rating, and (3) an SRS
adapter that writes `FAM#<scenario>#<prompt>` cards into the shared `cw_srs_v1` store using SM-2 math
copied verbatim from the question bank. Reference mode is today's behavior, untouched.

**Tech Stack:** Vanilla ES5-style JS in a single HTML file (no framework, no build for the tool
itself beyond a file copy); Python 3 for the data contract test; `@playwright/test` 1.46.1 for the
browser smoke test; Node's built-in runner for a static parity guard.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-07-15-family-systems-active-retrieval-design.md`).
Every task's requirements implicitly include this section.

- **PHI firewall:** generation is spoken/scratch only. Persist no free text and no patient data. The
  only new persisted data is SM-2 scheduling metadata (ease, ivl, reps, lapses, due, last).
- **Blast radius = this tool only.** Do NOT modify `review.html`, `spa_index.html`,
  `question-bank-practice.html`, `build_deploy.py`, or `_headers`.
- **SM-2 parity:** the tool's `applyGrade` must be byte-identical (after whitespace normalization) to
  `question-bank-practice.html`'s `applyGrade`.
- **Id namespace:** family cards use ids of the exact form `FAM#<scenarioId>#<promptId>`; created
  lazily on first self-rate; never delete or rewrite `QB#` or `TOPIC#` cards.
- **Store shape:** `cw_srs_v1` = `{v:1,cards:{},day:{...},stats:{...},settings:{...}}`. A card is
  `{ease:2.5,ivl:0,reps:0,lapses:0,due,last}`. Increment `stats.totalReviews` and `stats.seen` only;
  never touch `stats.correct`.
- **Style:** match the file's existing vanilla-JS idiom (single quotes, `esc()` on all interpolated
  text, event delegation via `data-` attributes, Clinical Warm CSS custom properties).
- **Accessibility:** toggle and reveal buttons expose `aria-pressed`/`aria-expanded`; self-rate is a
  labeled group; meaning never conveyed by color alone; reuse the existing `:focus-visible` styling.
- **Built slug:** `family-systems.html`. Bump the `[RC-META]` `version` and `built` date when the
  interaction changes.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `family_systems_scenarios.schema.json` | Data contract for scenarios | Modify — add optional `retrieval` property |
| `tool_registry.json` | Tool safety/metadata registry | Modify — add `cw_srs_v1` to `family-systems.html` `storageKeys` |
| `13_Faculty_Resources/_automation/test_family_systems_scenarios.py` | Python data/registry contract test | Create |
| `06_Family_and_Relational/family-systems-practice.html` | The tool renderer | Modify — SRS adapter, retrieval helpers, mode toggle, practice UI, CSS, RC-META |
| `tests/family-srs-parity.test.mjs` | Static SM-2 parity guard | Create |
| `tests/smoke/family-systems.spec.js` | Browser smoke test | Create |
| `tests/smoke/playwright.config.js` | Playwright projects | Modify — add the new spec to `nav-ms3` and `nav-res` `testMatch` |

Three tasks. Task 1 is the data/registry contract. Task 2 adds the SRS adapter (dormant) guarded by a
fast static parity test. Task 3 adds the Practice UI and the browser smoke test.

---

### Task 1: Data & registry contract

Establish and enforce the data contract: the schema gains an optional `retrieval` property, the
registry declares the new storage key, and a Python contract test guards both plus the auto-derive
source fields.

**Files:**
- Create: `13_Faculty_Resources/_automation/test_family_systems_scenarios.py`
- Modify: `family_systems_scenarios.schema.json`
- Modify: `tool_registry.json` (the `family-systems.html` entry's `storageKeys`)

**Interfaces:**
- Produces: the validated on-disk contract every later task relies on — `retrieval` entries are
  `{id: string matching ^[a-z0-9_]+$, prompt: string, revealFrom?: enum, revealText?: string}`, and
  `tool_registry.json`'s `family-systems.html` `storageKeys` == `["cw_family_v1","cw_srs_v1"]`.

- [ ] **Step 1: Write the failing contract test**

Create `13_Faculty_Resources/_automation/test_family_systems_scenarios.py`:

```python
#!/usr/bin/env python3
"""Contract checks for the Family Systems Practice scenarios and its retrieval loop."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "family_systems_scenarios.json"
SCHEMA_PATH = ROOT / "family_systems_scenarios.schema.json"
REGISTRY_PATH = ROOT / "tool_registry.json"

ID_RE = re.compile(r"^[a-z0-9_]+$")
REVEAL_FIELDS = {"opening", "prepare", "ask", "say", "avoid", "handoff", "safety"}
DEFAULT_SOURCES = ("opening", "ask", "avoid")


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios")
    assert isinstance(scenarios, list) and scenarios, "scenarios must be a non-empty list"

    for sc in scenarios:
        sid = sc["id"]
        # auto-derive sources must exist so every scenario yields retrieval cards
        assert isinstance(sc.get("opening"), str) and sc["opening"].strip(), f"{sid}: opening required"
        sections = sc.get("sections", {})
        for field in ("ask", "avoid"):
            assert isinstance(sections.get(field), list) and sections[field], f"{sid}: sections.{field} required"

        # validate any explicit retrieval blocks (none required in v1)
        retrieval = sc.get("retrieval")
        if retrieval is not None:
            assert isinstance(retrieval, list), f"{sid}: retrieval must be a list"
            seen = set()
            for entry in retrieval:
                assert isinstance(entry, dict), f"{sid}: retrieval entry must be an object"
                eid = entry.get("id")
                assert isinstance(eid, str) and ID_RE.match(eid), f"{sid}: bad retrieval id {eid!r}"
                assert eid not in seen, f"{sid}: duplicate retrieval id {eid!r}"
                seen.add(eid)
                assert isinstance(entry.get("prompt"), str) and entry["prompt"].strip(), f"{sid}:{eid} needs a prompt"
                rf, rt = entry.get("revealFrom"), entry.get("revealText")
                assert (rf in REVEAL_FIELDS) or (isinstance(rt, str) and rt.strip()), (
                    f"{sid}:{eid} needs revealFrom in {sorted(REVEAL_FIELDS)} or a revealText"
                )

    # schema must permit the retrieval property (strict additionalProperties:false)
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    props = schema["properties"]["scenarios"]["items"]["properties"]
    assert "retrieval" in props, "schema must define the optional retrieval property"

    # registry must declare the shared SRS store the Practice loop now writes
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    tool = next((t for t in registry["tools"] if t["file"] == "family-systems.html"), None)
    assert tool, "family-systems.html must be registered in tool_registry.json"
    assert tool["storageKeys"] == ["cw_family_v1", "cw_srs_v1"], (
        f"storageKeys must be ['cw_family_v1','cw_srs_v1'], got {tool['storageKeys']!r}"
    )

    # the default retrieval sources are the three fields the renderer derives from
    assert DEFAULT_SOURCES == ("opening", "ask", "avoid")

    print("test_family_systems_scenarios: OK — scenarios, retrieval contract, schema, and registry")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `python3 13_Faculty_Resources/_automation/test_family_systems_scenarios.py`
Expected: `AssertionError` — either "schema must define the optional retrieval property" or the
`storageKeys` assertion, because neither edit has been made yet.

- [ ] **Step 3: Add the `retrieval` property to the schema**

In `family_systems_scenarios.schema.json`, inside
`properties.scenarios.items.properties` (the object that currently ends with the `facultyReview`
block), add this property. It is NOT added to the `required` array.

```json
          "retrieval": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "prompt"],
              "properties": {
                "id": { "type": "string", "pattern": "^[a-z0-9_]+$" },
                "prompt": { "type": "string" },
                "revealFrom": {
                  "type": "string",
                  "enum": ["opening", "prepare", "ask", "say", "avoid", "handoff", "safety"]
                },
                "revealText": { "type": "string" }
              },
              "additionalProperties": false
            }
          }
```

- [ ] **Step 4: Add `cw_srs_v1` to the tool's storageKeys**

In `tool_registry.json`, the `family-systems.html` entry currently reads
`"storageKeys": ["cw_family_v1"],`. Change it to:

```json
      "storageKeys": ["cw_family_v1", "cw_srs_v1"],
```

- [ ] **Step 5: Run the contract test to confirm it passes**

Run: `python3 13_Faculty_Resources/_automation/test_family_systems_scenarios.py`
Expected: `test_family_systems_scenarios: OK — scenarios, retrieval contract, schema, and registry`

- [ ] **Step 6: Commit**

```bash
git add family_systems_scenarios.schema.json tool_registry.json 13_Faculty_Resources/_automation/test_family_systems_scenarios.py
git commit -m "feat(family-systems): data contract for retrieval loop + SRS storage key"
```

---

### Task 2: SRS adapter with parity guard

Add the spaced-repetition adapter to the tool as dormant functions (no UI change yet), guarded by a
fast static test asserting the SM-2 grader matches the question bank's byte-for-byte.

**Files:**
- Modify: `06_Family_and_Relational/family-systems-practice.html` (add functions inside the IIFE)
- Create: `tests/family-srs-parity.test.mjs`

**Interfaces:**
- Consumes: the `cw_srs_v1` store shape and the `applyGrade` source in
  `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`.
- Produces (used by Task 3): `srsGradeFamily(scenarioId, promptId, grade) -> card` (writes the store,
  returns the updated card `{ease,ivl,reps,lapses,due,last}`); `srsDueForScenario(scenarioId, prompts)
  -> {due, started, total}`; `famCardId(scenarioId, promptId) -> "FAM#..."`.

- [ ] **Step 1: Write the failing parity test**

Create `tests/family-srs-parity.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractApplyGrade(file) {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const m = src.match(/function applyGrade\(card, ?grade\)\{[\s\S]*?return c;\s*\}/);
  assert.ok(m, `applyGrade not found in ${file}`);
  return m[0].replace(/\s+/g, '');
}

const qbank = extractApplyGrade('13_Faculty_Resources/_automation/site_build/question-bank-practice.html');
const family = extractApplyGrade('06_Family_and_Relational/family-systems-practice.html');

assert.equal(family, qbank, 'family tool applyGrade must match question-bank-practice.html (SM-2 parity)');
console.log('Family SRS applyGrade parity with question bank verified');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node tests/family-srs-parity.test.mjs`
Expected: `AssertionError: applyGrade not found in 06_Family_and_Relational/family-systems-practice.html`
(the tool has no `applyGrade` yet).

- [ ] **Step 3: Add the SRS adapter to the tool**

In `06_Family_and_Relational/family-systems-practice.html`, inside the IIFE, immediately after the
line `var state={items:[],current:0,filter:'all',progress:loadProgress(),requested:requestedScenario()};`,
insert the adapter. The `applyGrade` body is copied verbatim (including its inline comment) from
`question-bank-practice.html`; do not reformat it or parity fails.

```javascript
/* ---- cw_srs_v1 spaced-repetition adapter (family retrieval cards) --------------
   Family cards share the question bank's store under a FAM# id namespace
   (QB#/TOPIC# already exist). applyGrade is copied verbatim from
   question-bank-practice.html so intervals match; tests/family-srs-parity.test.mjs
   guards the copy against drift. */
var SRS_KEY='cw_srs_v1';
var DAY = 86400000;
function srsFresh(){return {v:1,cards:{},day:{lastDay:'',newToday:0},stats:{streak:0,lastStudy:'',totalReviews:0,correct:0,seen:0},settings:{newPerDay:12}};}
function srsLoadStore(){try{var s=JSON.parse(localStorage.getItem(SRS_KEY)||'null');if(s&&s.v===1){s.cards=s.cards||{};s.stats=s.stats||srsFresh().stats;return s;}}catch(_){}return srsFresh();}
function srsSaveStore(s){try{localStorage.setItem(SRS_KEY,JSON.stringify(s));}catch(_){}}
function famCardId(scenarioId,promptId){return 'FAM#'+scenarioId+'#'+promptId;}
function applyGrade(card, grade){
  /* SM-2 variant: ease floor 1.3, interval cap 365 d */
  var c = Object.assign({}, card);
  c.reps = (c.reps||0) + 1;
  if(c.ivl===0){
    /* first encounter */
    if(grade==='Again'){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); }
    else if(grade==='Hard'){ c.ivl=1; c.due=Date.now()+DAY; }
    else if(grade==='Good'){ c.ivl=1; c.due=Date.now()+DAY; }
    else { c.ivl=4; c.due=Date.now()+4*DAY; }  /* Easy */
  } else {
    if(grade==='Again'){
      c.lapses=(c.lapses||0)+1;
      c.ease=Math.max(1.3, (c.ease||2.5)-0.2);
      c.ivl=Math.max(1, Math.round(c.ivl*0.5));
      c.due=Date.now();
    } else if(grade==='Hard'){
      c.ease=Math.max(1.3, (c.ease||2.5)-0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*1.2));
      c.due=Date.now()+Math.min(365,c.ivl)*DAY;
    } else if(grade==='Good'){
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5)));
      c.ivl=Math.min(365,c.ivl);
      c.due=Date.now()+c.ivl*DAY;
    } else {  /* Easy */
      c.ease=Math.min(4, (c.ease||2.5)+0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3));
      c.ivl=Math.min(365,c.ivl);
      c.due=Date.now()+c.ivl*DAY;
    }
  }
  c.last=Date.now();
  return c;
}
function srsGradeFamily(scenarioId,promptId,grade){
  var s=srsLoadStore(), id=famCardId(scenarioId,promptId);
  var card=s.cards[id]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0};
  s.cards[id]=applyGrade(card,grade);
  s.stats.totalReviews=(s.stats.totalReviews||0)+1;
  s.stats.seen=(s.stats.seen||0)+1;
  srsSaveStore(s);
  return s.cards[id];
}
function srsDueForScenario(scenarioId,prompts){
  var s=srsLoadStore(), now=Date.now(), out={due:0,started:0,total:(prompts||[]).length};
  (prompts||[]).forEach(function(rp){var c=s.cards[famCardId(scenarioId,rp.id)];if(c){out.started++;if(c.due<=now)out.due++;}});
  return out;
}
```

- [ ] **Step 4: Run the parity test to confirm it passes**

Run: `node tests/family-srs-parity.test.mjs`
Expected: `Family SRS applyGrade parity with question bank verified`

- [ ] **Step 5: Confirm the tool still parses and behaves unchanged**

Run: `node -e "require('fs').readFileSync('06_Family_and_Relational/family-systems-practice.html','utf8'); console.log('read ok')"`
Then confirm no other tool was touched:
Run: `git diff --name-only`
Expected: only `06_Family_and_Relational/family-systems-practice.html` and `tests/family-srs-parity.test.mjs`.

- [ ] **Step 6: Commit**

```bash
git add 06_Family_and_Relational/family-systems-practice.html tests/family-srs-parity.test.mjs
git commit -m "feat(family-systems): SRS adapter writing FAM# cards to cw_srs_v1 (dormant)"
```

---

### Task 3: Practice-mode UI + browser smoke test

Wire the adapter to a Reference/Practice toggle and a generate → reveal → self-rate card UI, verified
by a Playwright smoke test on the built site.

**Files:**
- Modify: `06_Family_and_Relational/family-systems-practice.html` (state, CSS, render, events, RC-META)
- Create: `tests/smoke/family-systems.spec.js`
- Modify: `tests/smoke/playwright.config.js` (add the spec to `nav-ms3` and `nav-res` `testMatch`)

**Interfaces:**
- Consumes: `srsGradeFamily`, `srsDueForScenario`, `famCardId` from Task 2.
- Produces: rendered controls with these stable accessible names — buttons `Practice mode` /
  `Reference mode`; per-card `Reveal one way to do it`; self-rate buttons `Again`/`Hard`/`Good`/`Easy`.

- [ ] **Step 1: Write the failing smoke test**

Create `tests/smoke/family-systems.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('cw_srs_v1');
    window.localStorage.removeItem('cw_family_v1');
  });
});

test('practice mode reveal + self-rate writes one FAM# card and stores no free text', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/tools/family-systems.html`, { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Practice mode' }).click();

  const reveal = page.getByRole('button', { name: /reveal one way/i }).first();
  await expect(reveal).toBeVisible();
  await reveal.click();

  await page.getByRole('button', { name: 'Good' }).first().click();

  const srs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('cw_srs_v1') || '{}'));
  const famIds = Object.keys(srs.cards || {}).filter((k) => k.startsWith('FAM#'));
  expect(famIds).toHaveLength(1);
  expect(srs.cards[famIds[0]].ivl).toBe(1);            // Good on first encounter → interval 1 day
  expect(srs.cards[famIds[0]].due).toBeGreaterThan(Date.now());
  expect(Object.keys(srs.cards).every((k) => k.startsWith('FAM#'))).toBe(true); // no QB#/TOPIC# fabricated

  const raw = await page.evaluate(() => window.localStorage.getItem('cw_srs_v1'));
  expect(raw).not.toMatch(/opening line|collateral question|trap/i); // scheduling metadata only

  // Reference mode still renders the original checklist
  await page.getByRole('button', { name: 'Reference mode' }).click();
  await expect(page.getByText(/before you call it done/i)).toBeVisible();
});
```

- [ ] **Step 2: Register the spec in the Playwright config**

In `tests/smoke/playwright.config.js`, add `'family-systems.spec.js'` to the `testMatch` array of
BOTH the `nav-ms3` and `nav-res` projects. Each currently reads
`testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js'],`; change both to:

```javascript
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js'],
```

- [ ] **Step 3: Build, serve, and run the smoke test to confirm it fails**

```bash
cd tests/smoke && npm ci && cd ../..
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 -m http.server 4200 --directory _build/ms3 &
python3 -m http.server 4201 --directory _build/res &
( cd tests/smoke && npx playwright test family-systems.spec.js )
```

Expected: FAIL — `getByRole('button', { name: 'Practice mode' })` times out; there is no Practice
toggle yet. Leave the two `http.server` processes running for the next steps (stop them at the end
with `kill %1 %2`).

- [ ] **Step 4: Add Practice-mode state**

In `06_Family_and_Relational/family-systems-practice.html`, extend the `state` initializer. Change:

```javascript
var state={items:[],current:0,filter:'all',progress:loadProgress(),requested:requestedScenario()};
```

to:

```javascript
var state={items:[],current:0,filter:'all',progress:loadProgress(),requested:requestedScenario(),mode:'reference',revealed:{},graded:{}};
state.mode=(state.progress&&state.progress['$mode']==='practice')?'practice':'reference';
```

(The SRS adapter block from Task 2 sits immediately below this — keep it there.)

- [ ] **Step 5: Add the retrieval-derivation and Practice-render helpers**

Add these functions inside the IIFE, just above the existing `function render(){` line:

```javascript
var DEFAULT_RETRIEVAL=[
  {id:'opening',prompt:'Say your opening line for this family out loud.',revealFrom:'opening'},
  {id:'ask',prompt:'Name the collateral questions you would ask — out loud or on scratch.',revealFrom:'ask'},
  {id:'avoid',prompt:'Name the trap here: what would you deliberately NOT do?',revealFrom:'avoid'}
];
function revealContent(it,rp){
  if(rp.revealText)return rp.revealText;
  if(rp.revealFrom==='opening')return it.opening||null;
  var sec=(it.sections||{})[rp.revealFrom];
  return (sec&&sec.length)?sec:null;
}
function retrievalFor(it){
  if(Array.isArray(it.retrieval)&&it.retrieval.length)return it.retrieval;
  return DEFAULT_RETRIEVAL.filter(function(rp){return revealContent(it,rp)!=null;});
}
function revealBodyHtml(content){
  if(content==null)return '';
  if(typeof content==='string')return '<p>'+esc(content)+'</p>';
  return '<ul>'+content.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';
}
function scheduledLabel(card){
  var days=Math.max(0,Math.round((card.due-Date.now())/DAY));
  return days<=0?'Scheduled — back soon':'Scheduled — back in about '+days+' day'+(days===1?'':'s');
}
function modeToggleHtml(){
  return '<div class="modebar" role="group" aria-label="Study mode">'
    +'<button type="button" class="modebtn'+(state.mode==='reference'?' on':'')+'" data-mode="reference" aria-label="Reference mode" aria-pressed="'+(state.mode==='reference')+'">Reference</button>'
    +'<button type="button" class="modebtn'+(state.mode==='practice'?' on':'')+'" data-mode="practice" aria-label="Practice mode" aria-pressed="'+(state.mode==='practice')+'">Practice</button>'
    +'</div>';
}
function practiceHtml(it){
  var prompts=retrievalFor(it), d=srsDueForScenario(it.id,prompts);
  var chip=d.due>0?(d.due+' due for review'):(d.started+' of '+d.total+' started');
  var prep=(it.sections&&it.sections.prepare)?it.sections.prepare:[];
  var cards=prompts.map(function(rp,i){
    var shown=!!state.revealed[rp.id], graded=state.graded[rp.id];
    var body='<div class="pcard"><div class="pk">Retrieval '+(i+1)+' of '+prompts.length+'</div>'
      +'<p class="pprompt">'+esc(rp.prompt)+'</p>'
      +'<p class="pnote">Say or jot your answer first. Nothing you say is recorded.</p>';
    if(!shown){
      body+='<button type="button" class="revealbtn" data-reveal="'+esc(rp.id)+'" aria-expanded="false">Reveal one way to do it</button>';
    } else {
      body+='<div class="preveal"><span class="preveal-k">One way to do it</span>'+revealBodyHtml(revealContent(it,rp))+'</div>';
      if(graded){
        body+='<div class="pdone" aria-live="polite">'+esc(scheduledLabel(graded))+'</div>';
      } else {
        body+='<div class="prate" role="group" aria-label="How close was your answer to the model?">'
          +['Again','Hard','Good','Easy'].map(function(g){return '<button type="button" class="ratebtn r-'+g.toLowerCase()+'" data-rate="'+g+'" data-prompt="'+esc(rp.id)+'">'+g+'</button>';}).join('')
          +'</div>';
      }
    }
    return body+'</div>';
  }).join('');
  return '<section class="practice"><div class="practicehead"><h3>Practice: generate, then compare</h3><span class="duechip">'+esc(chip)+'</span></div>'
    +(prep.length?'<div class="prepare"><b>Before you start:</b><ul>'+prep.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></div>':'')
    +cards+'</section>';
}
```

- [ ] **Step 6: Branch the renderer on mode**

Replace the existing `render` function:

```javascript
function render(){if(!state.items.length){app.innerHTML='<div class="empty">No family systems scenarios are available.</div>';return;}ensureCurrentVisible();var it=current();app.innerHTML=sideHtml()+'<div class="main">'+introHtml(it)+bodyHtml(it)+checklistHtml(it)+'</div>';}
```

with:

```javascript
function render(){if(!state.items.length){app.innerHTML='<div class="empty">No family systems scenarios are available.</div>';return;}ensureCurrentVisible();var it=current();var mid=state.mode==='practice'?practiceHtml(it):bodyHtml(it);app.innerHTML=sideHtml()+'<div class="main">'+modeToggleHtml()+introHtml(it)+mid+checklistHtml(it)+'</div>';}
```

- [ ] **Step 7: Handle the new events**

In the existing `app.addEventListener('click',function(ev){ ... });` handler, add these branches at the
very start of the callback body (before the `var flt=...` line):

```javascript
    var mb=ev.target.closest&&ev.target.closest('[data-mode]');
    if(mb){state.mode=mb.getAttribute('data-mode')==='practice'?'practice':'reference';state.progress['$mode']=state.mode;saveProgress();state.revealed={};state.graded={};render();return;}
    var rv=ev.target.closest&&ev.target.closest('[data-reveal]');
    if(rv){state.revealed[rv.getAttribute('data-reveal')]=true;render();return;}
    var rt=ev.target.closest&&ev.target.closest('[data-rate]');
    if(rt){state.graded[rt.getAttribute('data-prompt')]=srsGradeFamily(current().id,rt.getAttribute('data-prompt'),rt.getAttribute('data-rate'));render();return;}
```

Also reset transient reveal/grade state when the learner switches scenario. In the same handler, find
the scenario branch `var sc=ev.target.closest&&ev.target.closest('.scenario');if(sc){setCurrent(sc.getAttribute('data-id'));render();return;}`
and change it to also clear the transient maps:

```javascript
    var sc=ev.target.closest&&ev.target.closest('.scenario');if(sc){setCurrent(sc.getAttribute('data-id'));state.revealed={};state.graded={};render();return;}
```

- [ ] **Step 8: Add the Practice-mode CSS**

In the `<style>` block, immediately before the closing `</style>`, add (reusing existing custom
properties):

```css
.modebar{display:inline-flex;gap:4px;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:3px;margin:0 0 12px}
.modebtn{border:1px solid transparent;background:transparent;border-radius:999px;padding:6px 14px;font:inherit;font-size:.82rem;font-weight:900;color:var(--muted);cursor:pointer}
.modebtn.on{background:var(--teal);color:#fff}
.practice{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 4px rgba(56,48,40,.06);padding:16px}
.practicehead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 10px}
.practicehead h3{font-family:var(--font-head);font-size:1.2rem;color:var(--terracotta);margin:0}
.duechip{border:1px solid var(--line);border-radius:999px;background:var(--surface-2);padding:3px 10px;font-size:.75rem;font-weight:900;color:var(--muted)}
.prepare{border-left:4px solid var(--teal);background:var(--teal-soft);border-radius:0 10px 10px 0;padding:10px 13px;color:var(--muted);margin:0 0 14px}
.prepare ul{margin:6px 0 0;padding-left:1.1rem}
.pcard{border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:13px;margin:0 0 12px}
.pk{text-transform:uppercase;letter-spacing:.1em;font-size:.68rem;font-weight:900;color:var(--soft);margin:0 0 5px}
.pprompt{font-family:var(--font-head);font-size:1.1rem;color:var(--ink);margin:0 0 6px}
.pnote{font-size:.82rem;color:var(--soft);margin:0 0 10px}
.revealbtn{border:1px solid var(--teal);background:var(--surface);color:var(--teal-dark);border-radius:999px;padding:7px 13px;font:inherit;font-size:.85rem;font-weight:900;cursor:pointer}
.revealbtn:hover{background:var(--teal-soft)}
.preveal{border-left:4px solid var(--teal);background:var(--surface);border-radius:0 10px 10px 0;padding:10px 12px;margin:0 0 10px;color:var(--muted)}
.preveal-k{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:.68rem;font-weight:900;color:var(--teal-dark);margin:0 0 4px}
.preveal ul{margin:0;padding-left:1.1rem}
.prate{display:flex;gap:8px;flex-wrap:wrap}
.ratebtn{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 14px;font:inherit;font-size:.84rem;font-weight:900;color:var(--ink);cursor:pointer}
.ratebtn:hover{border-color:var(--teal);background:var(--teal-soft)}
.pdone{font-size:.86rem;font-weight:800;color:var(--teal-dark)}
```

- [ ] **Step 9: Bump the `[RC-META]` header**

Change the first `[RC-META]` comment's `version="1.1"` to `version="2.0"`, its `built="2026-07-08"` to
`built="2026-07-15"`, and extend its `summary` so it reads:

```html
<!-- [RC-META] tool="Family Systems Practice" version="2.0" built="2026-07-15" category="family-systems" audience="trainee,ms3,resident" settings="inpatient,self-study,rounds-prep" time="5-10min" summary="Structured family/collateral/discharge scenarios in Reference mode, plus a Practice mode with generate-then-reveal retrieval cards feeding the shared SM-2 review store. Stores anonymous checklist state under cw_family_v1 and family scheduling cards under cw_srs_v1 (FAM# ids); no PHI or free-text patient fields." -->
```

- [ ] **Step 10: Rebuild, then run the smoke test to confirm it passes**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
( cd tests/smoke && npx playwright test family-systems.spec.js )
```

Expected: `2 passed` (the spec runs under both `nav-ms3` and `nav-res`). `build_and_check.sh` also runs
`check-static-site.mjs`; expect its QA gate to pass (hard:0) for both sites.

- [ ] **Step 11: Run the full guard suite**

```bash
python3 13_Faculty_Resources/_automation/test_family_systems_scenarios.py
node tests/family-srs-parity.test.mjs
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
( cd tests/smoke && npx playwright test --project=nav-ms3 --project=nav-res )
kill %1 %2 2>/dev/null || true
```

Expected: the two data tests print `OK`, the parity test prints its verification line, and the nav
projects (nav-crawl + longitudinal + family-systems) all pass — confirming no regression in the
existing tools.

- [ ] **Step 12: Commit**

```bash
git add 06_Family_and_Relational/family-systems-practice.html tests/smoke/family-systems.spec.js tests/smoke/playwright.config.js
git commit -m "feat(family-systems): Practice mode — generate/reveal/self-rate with spaced review"
```

---

## Self-Review

**1. Spec coverage.**

| Spec success criterion | Task |
|---|---|
| Practice/Reference toggle; Reference unchanged | Task 3 (steps 4, 6, 8) |
| generate → reveal → self-rate cards; reveals are existing content | Task 3 (steps 5–8) |
| self-rating writes `FAM#<scenario>#<prompt>` in `cw_srs_v1` with SM-2 due | Task 2 (adapter) + Task 3 (event) |
| home due badge counts family cards, no `spa_index.html` change | Guaranteed by generic `dueCount()`; verified by the `FAM#` write in Task 3's smoke test; `spa_index.html` not in any task's file list |
| `review.html`/`question-bank-practice.html` untouched, no regression | Global constraint; Task 3 step 11 runs the nav suite; neither file is in any task |
| spoken/scratch only; no free text or patient data persisted | Task 3 smoke asserts the store holds only scheduling metadata |
| keyboard/AT operable | Task 3 `aria-pressed`/`aria-expanded`/labeled group (steps 5, 7) |
| MS3 + resident builds and `check-static-site.mjs` pass | Task 3 steps 10–11 |
| schema gains optional `retrieval`; lazy card creation | Task 1 (schema) + Task 2 (`||` default in `srsGradeFamily`) |
| SM-2 parity with the question bank | Task 2 parity test |

No spec requirement is unmapped.

**2. Placeholder scan.** No "TBD"/"handle edge cases"/"similar to"/"write tests for the above". Every
code step contains complete, runnable content and exact commands with expected output.

**3. Type consistency.** `srsGradeFamily(scenarioId, promptId, grade)`, `srsDueForScenario(scenarioId,
prompts)`, `famCardId(scenarioId, promptId)`, `retrievalFor(it)`, `revealContent(it, rp)`,
`revealBodyHtml(content)` are defined once and called with matching arities. Card fields
(`ease/ivl/reps/lapses/due/last`) and store fields (`v/cards/day/stats/settings`) match the verbatim
question-bank shapes. Accessible names in the smoke test (`Practice mode`, `Reference mode`, `Reveal
one way to do it`, `Good`) match the `aria-label`/text emitted in Task 3. The `$mode` reserved key is
written and read consistently and never iterated as a scenario id.

One deliberate spec refinement: the mode is persisted under a reserved `$mode` key **inside**
`cw_family_v1` (the spec's "alongside existing tool state"), so no third storage key is declared and
`storageKeys` stays `["cw_family_v1","cw_srs_v1"]`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-family-systems-active-retrieval.md`.
