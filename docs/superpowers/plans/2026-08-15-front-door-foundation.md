# Front Door Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the validated data and pure-state foundation the Front Door shell needs, without changing anything a student sees.

**Architecture:** A new root `curriculum.json` holds week→item structure and library-column membership; a Python validator joins it against `site_manifest.json` so a ref to an unshipped page fails the build. Clinical protocol steps go into `topic_meta.json` (gaining faculty attestation), and `fd_state.js` — a marker-injected snippet in the repo's existing `SNIPPET_MARKERS` system — holds the front door's pure engagement functions with direct unit tests.

**Tech Stack:** Python 3 validators (stdlib only, no new deps), vanilla ES5-compatible JS snippets, `node:test` for JS, `unittest` for Python.

**Spec:** [`docs/superpowers/specs/2026-08-15-front-door-design.md`](../specs/2026-08-15-front-door-design.md). This plan covers §2.3, §4.1, §4.2, §4.3, and the `fd_state.js` row of §3. The shell surfaces (§3's other eight modules), deletions (§8), and test rewrites are Plan 2, written after this lands.

## Global Constraints

- **localStorage keys must be `cw_*` or `rp_*`.** `check-static-site.mjs:309,345` hard-fails any other prefix. The front door's key is exactly `cw_frontdoor_v1`.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`.** CI lints for this — derive paths from `__file__`.
- **Shared shell copy is audience-neutral.** No `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford` in strings shipping to both sites (`tests/shell-copy.test.mjs`). Say **"Exam"**, never "Shelf".
- **`spa_index.html` source must contain zero `+'T00:00:00'` literals** (`tests/phase-chip.test.mjs` test (c)). All date parsing goes through `phase_policy.js`.
- **No PHI.** Clinical content is synthetic / de-identified only.
- **`CLAUDE.md` and `AGENTS.md` stay byte-identical** — run `cp CLAUDE.md AGENTS.md` after any edit to either. CI fails divergence.
- **Every `topic_meta.json` edit goes through the `topic-meta-author` skill** (repo policy — the file has controlled vocabularies and conditional invariants that are silent to get wrong).
- **Python deps:** `python3 -m pip install -r requirements.txt` before running validators.

---

### Task 1: Local-day helpers in `phase_policy.js`

The prototype computes its day boundary in UTC (`new Date().toISOString().slice(0,10)`), so a US Eastern student's "daily pick" rotates at 7–8pm. `phase_policy.js` is the documented home of local-midnight date logic — the streak, the daily pick, and the exam countdown must roll over at the same instant, which is exactly the drift that file exists to prevent.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/phase_policy.js` (append after `shelfDaysUntil`)
- Test: `tests/phase-policy.test.mjs` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `localDayStr(nowMs) -> string` (local calendar date as `YYYY-MM-DD`) and `localDayIndex(nowMs) -> number` (integer day number in the local calendar, increments by exactly 1 per local midnight). Both take `nowMs` explicitly. Task 5 consumes both.

- [ ] **Step 1: Write the failing tests**

In `tests/phase-policy.test.mjs`, change the `make` factory's return object to expose the new helpers:

```js
// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `
  ${snippet}
  return {
    shelfDaysUntil: shelfDaysUntil,
    phasePolicy: phasePolicy,
    localDayStr: localDayStr,
    localDayIndex: localDayIndex,
  };
`);
```

Then append these tests at the end of the file:

```js
// ---- local-day helpers (front door day boundary) ------------------------------------
// Constructed with new Date(y, m, d, h, mi) — LOCAL construction on both sides of every
// assertion, the same timezone-robustness technique the shelfDaysUntil tests above use.

test('localDayStr returns the local calendar date, zero-padded', () => {
  const { localDayStr } = make(memStorage());
  assert.equal(localDayStr(new Date(2026, 0, 5, 12, 0, 0).getTime()), '2026-01-05');
  assert.equal(localDayStr(new Date(2026, 10, 30, 12, 0, 0).getTime()), '2026-11-30');
});

test('localDayStr does not roll over early in the evening (the UTC bug)', () => {
  const { localDayStr } = make(memStorage());
  // 23:30 local. new Date().toISOString().slice(0,10) reports the NEXT day here in every
  // zone west of UTC — that is the prototype defect this helper replaces.
  assert.equal(localDayStr(new Date(2026, 7, 15, 23, 30, 0).getTime()), '2026-08-15');
});

test('localDayIndex is constant across a single local day', () => {
  const { localDayIndex } = make(memStorage());
  const early = new Date(2026, 7, 15, 0, 5, 0).getTime();
  const late = new Date(2026, 7, 15, 23, 55, 0).getTime();
  assert.equal(localDayIndex(early), localDayIndex(late));
});

test('localDayIndex advances by exactly one across local midnight', () => {
  const { localDayIndex } = make(memStorage());
  const before = new Date(2026, 7, 15, 23, 59, 0).getTime();
  const after = new Date(2026, 7, 16, 0, 1, 0).getTime();
  assert.equal(localDayIndex(after) - localDayIndex(before), 1);
});

test('localDayIndex advances by exactly one per day across a month boundary', () => {
  const { localDayIndex } = make(memStorage());
  const aug31 = new Date(2026, 7, 31, 9, 0, 0).getTime();
  const sep1 = new Date(2026, 8, 1, 9, 0, 0).getTime();
  assert.equal(localDayIndex(sep1) - localDayIndex(aug31), 1);
});

```

Deliberately **no** audience-token test here. `AUDIENCE_TOKEN_RE` bans tokens in user-visible
*copy*, which is why the existing tests at `tests/phase-policy.test.mjs:193,200` apply it to
`p.label` values rather than to the file. A whole-file scan could never pass — `shelfDaysUntil`
and `cw_shelf_date` are identifiers in this very snippet — and these two helpers return a date
string and an integer, emitting no copy at all. There is nothing for a copy ban to check.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/phase-policy.test.mjs`
Expected: FAIL — `ReferenceError: localDayStr is not defined` (thrown from the `new Function` body).

- [ ] **Step 3: Write the implementation**

Append to `13_Faculty_Resources/_automation/site_build/phase_policy.js`:

```js
/* localDayStr()/localDayIndex() are the front door's day boundary, and they live here beside
   shelfDaysUntil() for the same reason the countdown and the phase chip do: a second
   day-boundary implementation is precisely the drift this file exists to prevent. The streak,
   the daily pick, and the exam countdown must roll over at the same instant.
   Both take nowMs explicitly so no test ever monkeypatches Date. Neither parses a string, so
   neither needs the 'T00:00:00' idiom above. */
function localDayStr(nowMs){
  var d=new Date(nowMs||Date.now());
  var m=d.getMonth()+1, day=d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
}
function localDayIndex(nowMs){
  var d=new Date(nowMs||Date.now());
  return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/phase-policy.test.mjs tests/phase-chip.test.mjs tests/phase-wiring.test.mjs`
Expected: PASS. All three phase suites must stay green — the snippet body is shared.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/phase_policy.js tests/phase-policy.test.mjs
git commit -m "feat(shell): local-day helpers beside shelfDaysUntil

localDayStr()/localDayIndex() give the front door a day boundary that
rolls over at local midnight. The prototype used UTC, which moves a US
Eastern student's daily pick to 7pm. They live in phase_policy.js so the
streak, daily pick, and exam countdown can never disagree at a boundary."
```

---

### Task 2: `curriculum.json` weeks + schema + validator

The week→item mapping already exists inside `01_Six_Week_Curriculum/learning-path.html` as a `WEEKS[]` array. This promotes it to validated root data so both the Path tab and Today can read it, and so a ref to an unshipped page fails the build rather than rendering a dead row.

**Files:**
- Create: `curriculum.json`
- Create: `curriculum.schema.json`
- Create: `13_Faculty_Resources/_automation/validate_curriculum.py`
- Test: `13_Faculty_Resources/_automation/test_validate_curriculum.py`

**Interfaces:**
- Consumes: `localDayStr`/`localDayIndex` — not used here, but Task 5 joins this data with them.
- Produces: `curriculum.json` with top-level keys `weeks`, `libraryColumns`, `libraryExclude`, `safetyKit`, `roles`, `synonyms`. Task 3 fills `libraryColumns`/`libraryExclude`; Task 4 uses `safetyKit`; Task 5 reads `weeks`. Validator entry point is `python3 13_Faculty_Resources/_automation/validate_curriculum.py [path]`, exiting non-zero on any violation.

- [ ] **Step 1: Write the failing test**

Create `13_Faculty_Resources/_automation/test_validate_curriculum.py`:

```python
#!/usr/bin/env python3
"""Contract tests for validate_curriculum.py.

Mirrors the harness convention of test_validate_registry_schemas.py: build a
minimal in-memory curriculum + manifest in a tmp dir, run the validator as a
subprocess, and assert on exit code and message. Nothing here touches the real
curriculum.json, so a content edit never turns these red.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HERE, "validate_curriculum.py")

MANIFEST = {
    "tools": [["src/a.html", "mse.html", "Mental Status Exam"]],
    "md": [["src/b.md", "welcome.md", "Welcome to the Rotation"]],
}


def _write(tmp, curriculum):
    cpath = os.path.join(tmp, "curriculum.json")
    mpath = os.path.join(tmp, "site_manifest.json")
    with open(cpath, "w", encoding="utf-8") as fh:
        json.dump(curriculum, fh)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(MANIFEST, fh)
    return cpath, mpath


def _run(cpath, mpath):
    return subprocess.run(
        [sys.executable, VALIDATOR, cpath, mpath],
        capture_output=True, text=True,
    )


def _curriculum(items):
    return {
        "weeks": [{"n": n, "title": "T%d" % n, "theme": "Th%d" % n,
                   "items": items if n == 1 else []} for n in range(1, 7)],
        "libraryColumns": [],
        "libraryExclude": [],
        "safetyKit": [],
        "roles": {"ms3": [], "resident": []},
        "synonyms": {},
    }


class ValidateCurriculumTest(unittest.TestCase):
    def test_accepts_refs_that_resolve_to_shipped_slugs(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "welcome.md", "kind": "read"},
                {"ref": "mse.html", "kind": "tool"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("OK", r.stdout)

    def test_rejects_a_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "does-not-exist.md", "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("does-not-exist.md", r.stdout)

    def test_rejects_kind_that_disagrees_with_the_slug_type(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "mse.html", "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("kind", r.stdout)

    def test_rejects_a_missing_or_duplicated_week_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["weeks"][5]["n"] = 5  # now 1,2,3,4,5,5 — week 6 missing
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("week", r.stdout.lower())

    def test_reports_every_violation_not_just_the_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "nope-one.md", "kind": "read"},
                {"ref": "nope-two.md", "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("nope-one.md", r.stdout)
            self.assertIn("nope-two.md", r.stdout)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py`
Expected: FAIL — every test errors because `validate_curriculum.py` does not exist (subprocess returns non-zero with "can't open file").

- [ ] **Step 3: Write the validator**

Create `13_Faculty_Resources/_automation/validate_curriculum.py`:

```python
#!/usr/bin/env python3
"""Validate curriculum.json — the front door's week/library structure.

curriculum.json holds STRUCTURE ONLY. Everything about an item (minutes,
summary, key points, attestation) joins from topic_meta.json at render time,
so this file must never duplicate those facts. What it must guarantee is that
every ref it names is a page the build actually ships:

  - weeks are exactly 1..6, each present once
  - every item ref resolves to a slug in site_manifest.json
  - item kind agrees with the slug's type (.html => tool, .md => read)
  - refs within a week are unique

Exits non-zero and prints every violation.
Usage:  python3 validate_curriculum.py [curriculum.json] [site_manifest.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

cur_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "curriculum.json")
man_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    REPO, "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json")

if not os.path.exists(cur_path):
    print("curriculum.json not found at %s — nothing to validate (skipping)." % cur_path)
    sys.exit(0)

cur = json.load(open(cur_path, encoding="utf-8"))
man = json.load(open(man_path, encoding="utf-8"))

tool_slugs = {e[1] for e in man.get("tools", [])}
md_slugs = {e[1] for e in man.get("md", [])}
shipped = tool_slugs | md_slugs

errs = []


def bad(where, msg):
    errs.append("%s: %s" % (where, msg))


# ---- weeks are exactly 1..6, each present once ----
weeks = cur.get("weeks")
if not isinstance(weeks, list):
    bad("weeks", "must be a list")
    weeks = []
seen_n = [w.get("n") for w in weeks if isinstance(w, dict)]
if sorted(seen_n) != [1, 2, 3, 4, 5, 6]:
    bad("weeks", "week numbers must be exactly 1..6 with no gaps or duplicates, got %s"
        % sorted(seen_n))

# ---- every item ref is shipped, and kind agrees with slug type ----
for w in weeks:
    if not isinstance(w, dict):
        bad("weeks", "each week must be an object")
        continue
    label = "week %s" % w.get("n")
    for field in ("title", "theme"):
        if not isinstance(w.get(field), str) or not w.get(field):
            bad(label, "'%s' must be a non-empty string" % field)
    items = w.get("items")
    if not isinstance(items, list):
        bad(label, "'items' must be a list")
        continue
    seen_refs = set()
    for it in items:
        if not isinstance(it, dict):
            bad(label, "each item must be an object")
            continue
        ref, kind = it.get("ref"), it.get("kind")
        if ref in seen_refs:
            bad(label, "duplicate ref '%s' within the week" % ref)
        seen_refs.add(ref)
        if ref not in shipped:
            bad(label, "ref '%s' is not a shipped slug in site_manifest.json" % ref)
            continue
        expected = "tool" if ref in tool_slugs else "read"
        if kind != expected:
            bad(label, "ref '%s' has kind '%s' but the manifest ships it as '%s'"
                % (ref, kind, expected))

if errs:
    print("curriculum.json INVALID — %d issue(s):" % len(errs))
    for e in errs:
        print("  -", e)
    sys.exit(1)

total = sum(len(w.get("items", [])) for w in weeks if isinstance(w, dict))
print("curriculum.json OK — 6 weeks, %d week items, all refs shipped." % total)
```

- [ ] **Step 4: Write `curriculum.json` and its schema**

Create `curriculum.json`. The `weeks` content is the existing `learning-path.html` `WEEKS[]` mapping, with each `kind:"recall"` entry replaced by the shipped `question-bank-practice.html` tool (the design's item model has only `read` and `tool`). Week titles and themes come from the handoff, with week 6's theme reworded per Global Constraints — **"Exam", never "Shelf"**.

```json
{
  "_note": "Front door structure ONLY — week ordering, library columns, safety-kit membership, per-site roles, search synonyms. Facts about an item (minutes, summary, key points, attestation) live in topic_meta.json and join at render time; never duplicate them here. Validated by 13_Faculty_Resources/_automation/validate_curriculum.py.",
  "weeks": [
    {
      "n": 1,
      "title": "Foundations & the MSE",
      "theme": "Orientation · interviewing · MSE",
      "items": [
        { "ref": "welcome.md", "kind": "read" },
        { "ref": "pg_interview.md", "kind": "read" },
        { "ref": "pg_suicide.md", "kind": "read" },
        { "ref": "agitation.md", "kind": "read" },
        { "ref": "delirium.md", "kind": "read" },
        { "ref": "withdrawal.html", "kind": "tool" },
        { "ref": "doc_oral.md", "kind": "read" },
        { "ref": "mse.html", "kind": "tool" },
        { "ref": "question-bank-practice.html", "kind": "tool" }
      ]
    },
    {
      "n": 2,
      "title": "Mood, Psychosis & Pharm",
      "theme": "Dx frameworks · the top-10 drugs",
      "items": [
        { "ref": "t_mood.md", "kind": "read" },
        { "ref": "t_psychosis.md", "kind": "read" },
        { "ref": "psychopharm_primer.md", "kind": "read" },
        { "ref": "ddx.md", "kind": "read" },
        { "ref": "question-bank-practice.html", "kind": "tool" }
      ]
    },
    {
      "n": 3,
      "title": "Psychotherapy & Personality",
      "theme": "Alliance · brief therapy · PDs",
      "items": [
        { "ref": "t_personality.md", "kind": "read" },
        { "ref": "exp_tx.md", "kind": "read" },
        { "ref": "brief_psychotherapy.md", "kind": "read" },
        { "ref": "reflection.html", "kind": "tool" },
        { "ref": "question-bank-practice.html", "kind": "tool" }
      ]
    },
    {
      "n": 4,
      "title": "Family Systems & EE",
      "theme": "Family meetings · collateral",
      "items": [
        { "ref": "exp_family.md", "kind": "read" },
        { "ref": "family_modalities.md", "kind": "read" },
        { "ref": "family_playbook.md", "kind": "read" },
        { "ref": "collateral_workflow.md", "kind": "read" },
        { "ref": "family-systems.html", "kind": "tool" },
        { "ref": "question-bank-practice.html", "kind": "tool" }
      ]
    },
    {
      "n": 5,
      "title": "Acute & Emergency",
      "theme": "Safety · agitation · withdrawal",
      "items": [
        { "ref": "suicide.md", "kind": "read" },
        { "ref": "agitation.md", "kind": "read" },
        { "ref": "delirium.md", "kind": "read" },
        { "ref": "catatonia.md", "kind": "read" },
        { "ref": "cssrs.html", "kind": "tool" },
        { "ref": "withdrawal.html", "kind": "tool" },
        { "ref": "capacity.html", "kind": "tool" },
        { "ref": "question-bank-practice.html", "kind": "tool" }
      ]
    },
    {
      "n": 6,
      "title": "Integration & Exam",
      "theme": "Exam · OSCE · putting it together",
      "items": [
        { "ref": "shelf.md", "kind": "read" },
        { "ref": "osce.md", "kind": "read" },
        { "ref": "cases.md", "kind": "read" },
        { "ref": "landmark_trials.md", "kind": "read" },
        { "ref": "oral.html", "kind": "tool" },
        { "ref": "one-patient-six-weeks.html", "kind": "tool" },
        { "ref": "question-bank-practice.html", "kind": "tool" }
      ]
    }
  ],
  "libraryColumns": [],
  "libraryExclude": [],
  "safetyKit": [],
  "roles": { "ms3": [], "resident": [] },
  "synonyms": {
    "etoh": "alcohol withdrawal ciwa",
    "si": "suicide risk ideation",
    "hi": "violence risk homicidal",
    "benzo": "withdrawal lorazepam agitation",
    "agitated": "agitation restraint de-escalation",
    "ams": "delirium confused altered",
    "sundowning": "delirium",
    "od": "toxidromes withdrawal",
    "bpad": "bipolar mood",
    "mdd": "mood depression",
    "szq": "psychosis schizophrenia",
    "sz": "psychosis schizophrenia",
    "bpd": "personality borderline",
    "cows": "opioid withdrawal",
    "ciwa": "alcohol withdrawal",
    "cap": "capacity",
    "mse": "mental status exam",
    "meds": "drug primer pharmacology",
    "pharm": "drug primer pharmacology"
  }
}
```

`libraryColumns`, `libraryExclude`, `safetyKit`, and `roles` stay empty here and are filled by Tasks 3 and 4 — the validator does not yet constrain them.

Create `curriculum.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "curriculum.json — front door structure",
  "type": "object",
  "required": ["weeks", "libraryColumns", "libraryExclude", "safetyKit", "roles", "synonyms"],
  "properties": {
    "_note": { "type": "string" },
    "weeks": {
      "type": "array",
      "minItems": 6,
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["n", "title", "theme", "items"],
        "additionalProperties": false,
        "properties": {
          "n": { "type": "integer", "minimum": 1, "maximum": 6 },
          "title": { "type": "string", "minLength": 1 },
          "theme": { "type": "string", "minLength": 1 },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["ref", "kind"],
              "additionalProperties": false,
              "properties": {
                "ref": { "type": "string", "minLength": 1 },
                "kind": { "type": "string", "enum": ["read", "tool"] }
              }
            }
          }
        }
      }
    },
    "libraryColumns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "accent", "refs"],
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "accent": { "type": "string", "enum": ["tool", "safety", "topic"] },
          "refs": { "type": "array", "items": { "type": "string", "minLength": 1 } }
        }
      }
    },
    "libraryExclude": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ref", "reason"],
        "additionalProperties": false,
        "properties": {
          "ref": { "type": "string", "minLength": 1 },
          "reason": { "type": "string", "minLength": 1 }
        }
      }
    },
    "safetyKit": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ref", "sub"],
        "additionalProperties": false,
        "properties": {
          "ref": { "type": "string", "minLength": 1 },
          "sub": { "type": "string", "minLength": 1 }
        }
      }
    },
    "roles": {
      "type": "object",
      "required": ["ms3", "resident"],
      "additionalProperties": false,
      "properties": {
        "ms3": { "$ref": "#/definitions/roleList" },
        "resident": { "$ref": "#/definitions/roleList" }
      }
    },
    "synonyms": { "type": "object", "additionalProperties": { "type": "string" } }
  },
  "definitions": {
    "roleList": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "desc"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "name": { "type": "string", "minLength": 1 },
          "desc": { "type": "string", "minLength": 1 },
          "hint": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run the tests and the validator against real data**

Run: `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py`
Expected: PASS — 5 tests.

Run: `python3 13_Faculty_Resources/_automation/validate_curriculum.py`
Expected: PASS — `curriculum.json OK — 6 weeks, 40 week items, all refs shipped.`

If any ref is reported unshipped, the fix is to correct the ref in `curriculum.json` against the manifest — never to loosen the validator.

- [ ] **Step 6: Commit**

```bash
git add curriculum.json curriculum.schema.json \
  13_Faculty_Resources/_automation/validate_curriculum.py \
  13_Faculty_Resources/_automation/test_validate_curriculum.py
git commit -m "feat(curriculum): promote the week mapping to validated root data

The six-week item mapping lived inside learning-path.html, unreachable
by the shell. curriculum.json holds it as structure only — facts about an
item still join from topic_meta.json — and the validator fails the build
on a ref to a page site_manifest.json does not ship.

Week 6's theme says 'Exam', not 'Shelf': curriculum copy reaches both
sites and tests/shell-copy.test.mjs bans audience tokens."
```

---

### Task 3: Library columns covering all 88 shipped pages

The spec commits to every shipped page staying one click away once the sidebar is deleted. This fills `libraryColumns` by a documented 12→5 mapping of the existing nav sections, and adds the totality check that keeps it true as content is added.

**Files:**
- Modify: `curriculum.json` (fill `libraryColumns`, `libraryExclude`)
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py` (add the totality check)
- Test: `13_Faculty_Resources/_automation/test_validate_curriculum.py` (extend)

**Interfaces:**
- Consumes: `curriculum.json` and the validator from Task 2.
- Produces: `libraryColumns` — five entries with `name`, `accent` (`tool`/`safety`/`topic`), `refs[]` — and `libraryExclude` — `{ref, reason}` entries. Plan 2's `fd_library.js` renders these directly, in array order.

- [ ] **Step 1: Write the failing tests**

**First, update the shared `_curriculum()` fixture helper.** It currently hardcodes
`"libraryColumns": []` and `"libraryExclude": []`, which was valid while nothing checked them.
The totality check added in Step 3 makes that default an *invalid* curriculum: `MANIFEST`'s
`mse.html` and `welcome.md` would be shipped-but-unplaced, so every test built on the helper
would fail for a reason unrelated to what it is testing. Give the helper default coverage so it
produces a valid curriculum, and let the tests that care about columns keep overriding it:

```python
def _curriculum(items):
    return {
        "weeks": [{"n": n, "title": "T%d" % n, "theme": "Th%d" % n,
                   "items": items if n == 1 else []} for n in range(1, 7)],
        # Default coverage keeps the fixture VALID under the totality check. Tests that
        # exercise column behaviour overwrite both keys wholesale (see LibraryTotalityTest._cur),
        # so this default never masks what they assert.
        "libraryColumns": [
            {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
            {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
        ],
        "libraryExclude": [],
        "safetyKit": [],
        "roles": {"ms3": [], "resident": []},
        "synonyms": {},
    }
```

Then append the new test classes:

```python
class LibraryTotalityTest(unittest.TestCase):
    """Every shipped slug is placed in a column or explicitly excluded with a reason.

    This is the front-door analogue of the build's orphaned-source check: adding a
    page and forgetting to place it must break the build, not silently orphan it.
    """

    def _cur(self, columns, exclude):
        c = _curriculum([])
        c["libraryColumns"] = columns
        c["libraryExclude"] = exclude
        return c

    def test_accepts_full_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
                 {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]}],
                []))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_accepts_a_slug_placed_only_in_the_exclude_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": "welcome.md", "reason": "surfaced by the Path tab"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_shipped_slug_that_is_neither_placed_nor_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}], []))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("welcome.md", r.stdout)

    def test_rejects_a_column_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html", "ghost.html"]}],
                [{"ref": "welcome.md", "reason": "n/a"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("ghost.html", r.stdout)

    def test_rejects_an_exclude_entry_with_an_empty_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": "welcome.md", "reason": ""}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("reason", r.stdout)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py`
Expected: FAIL — `test_rejects_a_shipped_slug_that_is_neither_placed_nor_excluded`, `test_rejects_a_column_ref_that_is_not_shipped`, and `test_rejects_an_exclude_entry_with_an_empty_reason` fail with returncode 0, because the validator does not check columns yet.

- [ ] **Step 3: Add the totality check to the validator**

Insert into `13_Faculty_Resources/_automation/validate_curriculum.py`, immediately before the `if errs:` block:

```python
# ---- library totality: every shipped slug is placed or explicitly excluded ----
# The front-door analogue of the build's orphaned-source check. Once the sidebar is
# gone the Library is the only browse surface, so an unplaced page is an unreachable
# page. The exclude list keeps this a HARD failure instead of a rule that gets quietly
# weakened for the handful of pages that genuinely are not library content.
placed = set()
columns = cur.get("libraryColumns")
if not isinstance(columns, list):
    bad("libraryColumns", "must be a list")
    columns = []
for col in columns:
    if not isinstance(col, dict):
        bad("libraryColumns", "each column must be an object")
        continue
    name = col.get("name") or "?"
    refs = col.get("refs")
    if not isinstance(refs, list):
        bad("column %s" % name, "'refs' must be a list")
        continue
    for ref in refs:
        if ref not in shipped:
            bad("column %s" % name, "ref '%s' is not a shipped slug" % ref)
        else:
            placed.add(ref)

excluded = set()
exclude = cur.get("libraryExclude")
if not isinstance(exclude, list):
    bad("libraryExclude", "must be a list")
    exclude = []
for ent in exclude:
    if not isinstance(ent, dict):
        bad("libraryExclude", "each entry must be an object")
        continue
    ref = ent.get("ref")
    if not isinstance(ent.get("reason"), str) or not ent.get("reason").strip():
        bad("libraryExclude", "entry '%s' needs a non-empty 'reason'" % ref)
    if ref not in shipped:
        bad("libraryExclude", "ref '%s' is not a shipped slug" % ref)
    else:
        excluded.add(ref)

for ref in sorted(shipped - placed - excluded):
    bad("library", "shipped slug '%s' appears in no column and no libraryExclude entry"
        % ref)
```

Then update the success line at the bottom of the file:

```python
total = sum(len(w.get("items", [])) for w in weeks if isinstance(w, dict))
print("curriculum.json OK — 6 weeks, %d week items, %d pages placed, %d excluded."
      % (total, len(placed), len(excluded)))
```

- [ ] **Step 4: Fill `libraryColumns` and `libraryExclude`**

The mapping is mechanical: nav's 12 sections collapse to the design's 5 columns, and all 21 tools go to the tools column regardless of section.

| Design column | `accent` | Nav sections it absorbs |
|---|---|---|
| Interactive tools | `tool` | every `kind:tool` entry |
| Acute & safety | `safety` | Assess Safety and Acuity |
| Core topics | `topic` | Understand the Problem |
| Clinical skills | `topic` | Start the Encounter · Make a Plan · Communicate with Patients · Work with Family and Systems · Present and Work with the Team |
| Evidence & exam | `topic` | Practice and Exam Prep · Case of the Week · Evidence and Reference |

Orientation-section content (`welcome.md`, `orientation.md`) leads the Clinical skills column — it is "how to operate here", the nearest of the five. `core_readings.md` goes to Evidence & exam with the other reading lists.

Replace the empty `libraryColumns` and `libraryExclude` in `curriculum.json` with:

```json
  "libraryColumns": [
    {
      "name": "Interactive tools",
      "accent": "tool",
      "refs": [
        "mse.html", "interview-circle.html", "sp-interview.html",
        "communication-practice.html", "diagnostic-reasoning.html",
        "family-systems.html", "one-patient-six-weeks.html", "capacity.html",
        "oral.html", "violence.html", "cssrs.html", "screeners.html",
        "withdrawal.html", "decision-aids.html", "interaction-cards.html",
        "bfcrs.html", "reflection.html", "shelf-mode.html", "review.html",
        "question-bank-practice.html"
      ]
    },
    {
      "name": "Acute & safety",
      "accent": "safety",
      "refs": [
        "pg_suicide.md", "suicide.md", "agitation.md", "delirium.md",
        "catatonia.md", "violence.md", "exp_consult.md", "toxidromes.md",
        "medical_workup.md", "protocol_library.md"
      ]
    },
    {
      "name": "Core topics",
      "accent": "topic",
      "refs": [
        "ddx.md", "t_mood.md", "t_psychosis.md", "t_anxiety.md",
        "t_personality.md", "t_sud.md", "t_geri.md", "t_perinatal.md",
        "t_neurodev.md", "t_eating.md", "t_neurocog.md", "t_somatic.md",
        "t_sleep.md", "t_dissociative.md", "t_sexual.md", "t_impulse.md",
        "t_adjustment.md"
      ]
    },
    {
      "name": "Clinical skills",
      "accent": "topic",
      "refs": [
        "welcome.md", "orientation.md", "pg_interview.md", "pg_formulation.md",
        "case_formulation.md", "doc_oral.md", "collateral_workflow.md",
        "exp_tx.md", "exp_family.md", "family_modalities.md",
        "family_playbook.md", "psychotherapy.md", "brief_psychotherapy.md",
        "motivational_interviewing.md", "cultural_psychiatry.md",
        "ethics_legal.md"
      ]
    },
    {
      "name": "Evidence & exam",
      "accent": "topic",
      "refs": [
        "core_readings.md", "shelf.md", "osce.md", "cases.md",
        "rapid_review.md", "reading_map.md", "anki.md", "rounds_questions.md",
        "landmark_trials.md", "evidence_inpatient.md", "psychopharm_primer.md",
        "med_monitoring.md", "ect_neuromodulation.md", "nutrition_metabolic.md",
        "omm_resources.md", "book_library.md", "podcast_library.md",
        "cotw_index.md"
      ]
    }
  ],
  "libraryExclude": [
    { "ref": "feedback.html", "reason": "a feedback form, not library content — reachable from the header" },
    { "ref": "week1.md", "reason": "surfaced by the Path tab, which is the week browse surface" },
    { "ref": "week2.md", "reason": "surfaced by the Path tab, which is the week browse surface" },
    { "ref": "week3.md", "reason": "surfaced by the Path tab, which is the week browse surface" },
    { "ref": "week4.md", "reason": "surfaced by the Path tab, which is the week browse surface" },
    { "ref": "week5.md", "reason": "surfaced by the Path tab, which is the week browse surface" },
    { "ref": "week6.md", "reason": "surfaced by the Path tab, which is the week browse surface" }
  ],
```

- [ ] **Step 5: Run the tests and the validator**

Run: `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py`
Expected: PASS — 13 tests (8 from Task 2 including its fix round, plus the 5 added here).

Run: `python3 13_Faculty_Resources/_automation/validate_curriculum.py`
Expected: PASS — `curriculum.json OK — 6 weeks, 40 week items, 81 pages placed, 7 excluded.`

If the validator names a slug that is in no column, add it to the column it belongs in rather than to `libraryExclude` — exclusion is only for pages that genuinely are not library content.

- [ ] **Step 6: Commit**

```bash
git add curriculum.json 13_Faculty_Resources/_automation/validate_curriculum.py \
  13_Faculty_Resources/_automation/test_validate_curriculum.py
git commit -m "feat(curriculum): library columns covering every shipped page

The sidebar is the current browse surface and it is being deleted, so the
Library has to carry all 88 shipped pages, not the mockup's curated 44.
Nav's 12 sections collapse into the design's 5 columns by a documented
map; the validator fails the build when a shipped slug is in no column
and has no explicit exclusion reason."
```

---

### Task 4: Protocol steps as `topic_meta.safetySteps`

The safety kit's five protocols are ordered *actions* ("vitals and fingerstick glucose first"), which `topic_meta.points` is not — points are facts. They are new clinical content, so they go into `topic_meta.json` where they inherit faculty attestation, the high-safety governance bundle, and schema validation, rather than into `curriculum.json` where they would ship unreviewed.

> **Run the `topic-meta-author` skill for the `topic_meta.json` edits in Step 4.** Repo policy: that file has controlled vocabularies, conditional invariants, and cross-file referential integrity that are silent to get wrong and are not captured by `topic_meta.schema.json`.

**Files:**
- Modify: `topic_meta.schema.json`
- Modify: `13_Faculty_Resources/_automation/validate_topic_meta.py`
- Modify: `topic_meta.json` (five kit pages only)
- Modify: `curriculum.json` (fill `safetyKit`)
- Test: `13_Faculty_Resources/_automation/test_validate_curriculum.py` (extend — safetyKit refs)

**Interfaces:**
- Consumes: `curriculum.json`'s validator from Tasks 2–3.
- Produces: `topic_meta[slug].safetySteps` — an array of 3–5 non-empty strings — and `topic_meta[slug].safetyDoc` — a single string naming what to document. `curriculum.json.safetyKit` is an ordered array of `{ref, sub}`. Plan 2's `fd_sheet.js` renders steps from `safetySteps`, the Document callout from `safetyDoc`, and kit order from `safetyKit`.

- [ ] **Step 1: Write the failing tests**

Append to `13_Faculty_Resources/_automation/test_validate_curriculum.py`:

```python
class SafetyKitTest(unittest.TestCase):
    def _cur(self, kit):
        c = _curriculum([])
        c["libraryColumns"] = [
            {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
            {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
        ]
        c["safetyKit"] = kit
        return c

    def test_accepts_kit_refs_that_are_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"ref": "welcome.md", "sub": "Screen · stratify · plan"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_kit_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"ref": "ghost.md", "sub": "nope"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("ghost.md", r.stdout)
```

And create the validator test for the new `topic_meta` field. Append to
`13_Faculty_Resources/_automation/test_validate_registry_schemas.py` is **not** correct —
`validate_topic_meta.py` has no test harness today, so add a focused one at
`13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py`:

```python
#!/usr/bin/env python3
"""Contract tests for the safetySteps/safetyDoc fields on topic_meta.json.

Scoped deliberately: validate_topic_meta.py has no existing harness, and this
adds one only for the field this work introduces. Builds a minimal topic_meta in
a tmp dir and runs the validator as a subprocess, like test_validate_curriculum.py.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HERE, "validate_topic_meta.py")


def _run(entry):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "topic_meta.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"_note": "test", "x.md": entry}, fh)
        return subprocess.run(
            [sys.executable, VALIDATOR, path], capture_output=True, text=True)


BASE = {"read": 4, "tldr": "t", "points": ["p"]}


class SafetyStepsTest(unittest.TestCase):
    def test_accepts_a_valid_safety_steps_block(self):
        e = dict(BASE, safetySteps=["a", "b", "c"], safetyDoc="what to chart")
        self.assertEqual(_run(e).returncode, 0)

    def test_rejects_safety_steps_that_is_not_a_list(self):
        r = _run(dict(BASE, safetySteps="a", safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_fewer_than_three_steps(self):
        r = _run(dict(BASE, safetySteps=["a", "b"], safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_more_than_five_steps(self):
        r = _run(dict(BASE, safetySteps=["a", "b", "c", "d", "e", "f"], safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_an_empty_step_string(self):
        r = _run(dict(BASE, safetySteps=["a", "", "c"], safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_safety_steps_requires_safety_doc(self):
        r = _run(dict(BASE, safetySteps=["a", "b", "c"]))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetyDoc", r.stdout)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py`
Expected: FAIL — every rejection test returns 0, because the validator does not know the field.

Run: `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py`
Expected: FAIL — `test_rejects_a_kit_ref_that_is_not_shipped` returns 0.

- [ ] **Step 3: Teach both validators the new field**

In `13_Faculty_Resources/_automation/validate_topic_meta.py`, add inside the per-topic loop, next to the existing `safetyLevel` check:

```python
    # safetySteps: the ordered ACTIONS a protocol sheet walks (distinct from 'points',
    # which are facts). Lives here rather than in curriculum.json so protocol content
    # inherits faculty attestation and this contract — the safety kit is the one surface
    # whose whole purpose is being correct at 2am.
    if "safetySteps" in v:
        ss = v["safetySteps"]
        if not isinstance(ss, list) or not (3 <= len(ss) <= 5):
            bad(k, "'safetySteps' must be a list of 3-5 steps")
        elif any(not isinstance(s, str) or not s.strip() for s in ss):
            bad(k, "'safetySteps' entries must be non-empty strings")
        if not isinstance(v.get("safetyDoc"), str) or not v.get("safetyDoc", "").strip():
            bad(k, "'safetySteps' requires a non-empty 'safetyDoc' documentation line")
```

In `topic_meta.schema.json`, add to the per-topic property map:

```json
        "safetySteps": {
          "type": "array",
          "minItems": 3,
          "maxItems": 5,
          "items": { "type": "string", "minLength": 1 }
        },
        "safetyDoc": { "type": "string", "minLength": 1 },
```

In `13_Faculty_Resources/_automation/validate_curriculum.py`, add before the `if errs:` block:

```python
# ---- safety kit refs resolve ----
kit = cur.get("safetyKit")
if not isinstance(kit, list):
    bad("safetyKit", "must be a list")
    kit = []
for ent in kit:
    if not isinstance(ent, dict):
        bad("safetyKit", "each entry must be an object")
        continue
    if ent.get("ref") not in shipped:
        bad("safetyKit", "ref '%s' is not a shipped slug" % ent.get("ref"))
    if not isinstance(ent.get("sub"), str) or not ent.get("sub").strip():
        bad("safetyKit", "entry '%s' needs a non-empty 'sub'" % ent.get("ref"))
```

- [ ] **Step 4: Author the five protocols (via the `topic-meta-author` skill)**

Invoke the `topic-meta-author` skill and have it add `safetySteps` + `safetyDoc` to exactly these five entries in `topic_meta.json`. Content below is from the design handoff; the skill's job is to place it correctly and keep every other invariant intact.

`pg_suicide.md`:
```json
"safetySteps": [
  "Wish to be dead — passive ideation?",
  "Active thoughts of killing themselves?",
  "Method? Plan? Intent?",
  "Any preparatory behavior — ever, and past 3 months?",
  "Access to lethal means — firearms especially — and whether it is secured"
],
"safetyDoc": "exact patient quotes, risk stratification with static/dynamic factors, lethal-means access and what was done to secure it, and the safety plan disposition."
```

`agitation.md`:
```json
"safetySteps": [
  "Look for the driver first — delirium, akathisia, withdrawal, pain, hypoxia — it changes the treatment",
  "Verbal de-escalation first — respect space, one voice, offer choices",
  "Offer PO medication before any IM",
  "IM only for imminent danger to self or others",
  "Debrief the patient and the team afterward"
],
"safetyDoc": "the behavior observed, least-restrictive steps tried, medication response, and patient debrief."
```

`delirium.md`:
```json
"safetySteps": [
  "Vitals and fingerstick glucose first",
  "Review the med list — anticholinergics, benzos, opioids",
  "CAM screen: acute onset or fluctuating course + inattention + (disorganized thinking or altered consciousness)",
  "Workup: infection, metabolic, withdrawal"
],
"safetyDoc": "the CAM result, suspected precipitant, and workup ordered."
```

`exp_consult.md` (the capacity/delirium/catatonia/withdrawal consult page carries the capacity protocol):
```json
"safetySteps": [
  "Communicate a clear, stable choice",
  "Understand the relevant information",
  "Appreciate the situation and its consequences for them",
  "Reason about the options given their own values"
],
"safetyDoc": "the exact decision at issue, then each ability with a patient quote as evidence — capacity is decision-specific and can change."
```

**`exp_consult.md` additionally needs governance fields the other four kit pages already have.** It was the only kit page with no `safetyLevel` and no `facultyReview`, which would have made the capacity protocol the one unattested surface in a kit whose entire purpose is being right at 2am. Josh Moss, MD — the reviewer of record for this repo, and the `reviewer` string on all 22 currently-attested pages — reviewed the page in session on 2026-08-15 and attested it. Record that as:

```json
"safetyLevel": "high",
"evidenceIds": ["appelbaum-grisso-1988-capacity"],
"facultyReview": {
  "status": "reviewed",
  "reviewer": "Joshua Moss, MD",
  "lastReviewed": "2026-08-15"
}
```

`high` (rather than `moderate`) puts capacity at the same tier as the other four kit pages. `validate_topic_meta.py` requires a high-risk page to carry non-empty `evidenceIds` plus `facultyReview.status` and `lastReviewed`; `appelbaum-grisso-1988-capacity` is an existing entry in `evidence_registry.json` and is the canonical source for the four-abilities model this page's `points` already teach. Do not invent an evidence id — if that one is ever absent, stop and report rather than substituting another.

`t_sud.md` — **not `toxidromes.md`.** The source design labelled this protocol's page "Acute & Safety / Toxidromes", but that path was invented for the prototype. This repo's `toxidromes.md` is
`04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md` — NMS, serotonin
syndrome, anticholinergic, and malignant catatonia — with **zero** mentions of CIWA, COWS,
thiamine, or withdrawal. Routing the withdrawal protocol there would have opened a hyperthermia
page from a kit row labelled "Withdrawal — CIWA-Ar / COWS".

The correct page is `t_sud.md` (`03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md`),
whose own `tldr` reads *"alcohol withdrawal is benzodiazepines (CIWA-guided) plus thiamine before
glucose"* and whose source mentions CIWA/COWS/thiamine 16 times. It is already `safetyLevel: high`,
`facultyReview: reviewed` (2026-07-01), with a non-empty `evidenceIds` — so this correction needs
no new attestation.

```json
"safetySteps": [
  "Alcohol: CIWA-Ar q4h while symptomatic",
  "Thiamine before or with glucose — never delay dextrose for hypoglycemia",
  "CIWA ≥ 15 or seizure history → escalate protocol",
  "Opioid: COWS to time buprenorphine induction — typically COWS 8-12"
],
"safetyDoc": "scores with times, protocol triggered, and cumulative benzodiazepine dose."
```

`toxidromes.md` receives no `safetySteps` in this plan — the design's five-protocol kit has no
hyperthermia entry.

Then fill `safetyKit` in `curriculum.json`, in the handoff's kit order:

```json
  "safetyKit": [
    { "ref": "pg_suicide.md", "sub": "Screen · stratify · safety plan" },
    { "ref": "agitation.md", "sub": "Verbal first · PO before IM" },
    { "ref": "exp_consult.md", "sub": "Choice · understand · appreciate · reason" },
    { "ref": "t_sud.md", "sub": "Score · thiamine · escalate" },
    { "ref": "delirium.md", "sub": "Vitals · meds · CAM" }
  ],
```

- [ ] **Step 4b: Wire `validate_curriculum.py` into the build gate**

The spec promises "a ref to an unshipped slug fails the **build**, not the browser." That is only
true if the validator actually runs. Add it to the validator block in
`13_Faculty_Resources/_automation/site_build/build_and_check.sh` (lines 33-39), alongside
`validate_topic_meta.py` and the others:

```bash
python3 "$LIB/13_Faculty_Resources/_automation/validate_curriculum.py"
```

`build_and_check.sh` **is** each site's Netlify build command and is also what CI invokes, so this
one line covers both. Deliberately do **not** edit `.github/workflows/*.yml` to achieve it: any
workflow edit trips a CI-only double pin in
`13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py`
(`EXPECTED_STEP_INVENTORIES` plus a SHA-256 contract digest) that the local battery never runs.

- [ ] **Step 5: Run every affected validator and test**

```bash
python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
```

Expected: all PASS. `validate_topic_meta.py` must still report its full topic count — a drop means an entry was damaged.

- [ ] **Step 6: Commit**

```bash
git add topic_meta.json topic_meta.schema.json curriculum.json \
  13_Faculty_Resources/_automation/validate_topic_meta.py \
  13_Faculty_Resources/_automation/validate_curriculum.py \
  13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py \
  13_Faculty_Resources/_automation/test_validate_curriculum.py
git commit -m "feat(safety): protocol steps as attested topic_meta content

The safety kit's five protocols are ordered actions, which topic_meta
'points' are not — points are facts. They land in topic_meta.json rather
than curriculum.json so they inherit faculty attestation, the high-safety
governance bundle, and schema validation. curriculum.json holds only kit
membership and order."
```

---

### Task 5: `fd_state.js` — the front door's pure state module

The engagement mechanics are the parts most likely to be subtly wrong and the most miserable to test through a DOM. This is the module that made the marker-injection approach worth choosing: it is a snippet source, so its functions are directly unit-testable via `new Function` exactly as `phase_policy.js`'s are.

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py:547` (`SNIPPET_MARKERS`)
- Test: `tests/fd-state.test.mjs`
- Test: `13_Faculty_Resources/_automation/test_common.py` (extend)

**Interfaces:**
- Consumes: `localDayStr(nowMs)`, `localDayIndex(nowMs)` from Task 1 (available at runtime because `/*__PHASE_POLICY__*/` is injected into the same page).
- Produces, all on the global scope of the injected page:
  - `FD_STORE` — the string `'cw_frontdoor_v1'`
  - `fdLoad() -> object` — persisted state, `{}` on absent or malformed
  - `fdSave(obj) -> void` — writes the whitelisted keys only
  - `fdExamCountdown(week, nowMs) -> string` — `''`, `'· exam in ~N days'`, or `'· exam day — good luck'`
  - `fdDailyPick(candidates, doneMap, nowMs) -> object|null` — deterministic per local day
  - `fdRingStep(from, to, elapsed, duration) -> number` — eased integer percent
  Plan 2's `fd_today.js`, `fd_shell.js`, and `fd_reader.js` consume all of these.

- [ ] **Step 1: Write the failing tests**

Create `tests/fd-state.test.mjs`:

```js
// Behavioural contract for the front door's state + engagement snippet. Evaluates the real
// functions rather than their text, following tests/phase-policy.test.mjs: new Function over
// the snippet source, memStorage() for localStorage, and nowMs passed explicitly so nothing
// monkeypatches Date. fd_state.js depends on localDayStr/localDayIndex from phase_policy.js,
// so both snippets are concatenated here exactly as inject_shared_snippets() concatenates
// them into the built page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const phase = readFileSync(new URL(`${BUILD}/phase_policy.js`, import.meta.url), 'utf8');
const fdState = readFileSync(new URL(`${BUILD}/frontdoor/fd_state.js`, import.meta.url), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `
  ${phase}
  ${fdState}
  return {
    FD_STORE: FD_STORE,
    fdLoad: fdLoad,
    fdSave: fdSave,
    fdExamCountdown: fdExamCountdown,
    fdDailyPick: fdDailyPick,
    fdRingStep: fdRingStep,
  };
`);

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ---- storage key + persistence ------------------------------------------------------

test('the store key is namespaced cw_ as the QA gate requires', () => {
  assert.equal(make(memStorage()).FD_STORE, 'cw_frontdoor_v1');
});

test('fdLoad returns an empty object when nothing is stored', () => {
  assert.deepEqual(make(memStorage()).fdLoad(), {});
});

test('fdLoad returns an empty object rather than throwing on malformed JSON', () => {
  const ls = memStorage();
  ls.setItem('cw_frontdoor_v1', '{not json');
  assert.deepEqual(make(ls).fdLoad(), {});
});

test('fdSave round-trips through fdLoad', () => {
  const ls = memStorage();
  const { fdSave, fdLoad } = make(ls);
  fdSave({ role: 'ms3', tab: 'path', viewWeek: 4 });
  assert.deepEqual(fdLoad(), { role: 'ms3', tab: 'path', viewWeek: 4 });
});

test('fdSave persists only whitelisted keys, never done/streak/week', () => {
  const ls = memStorage();
  const { fdSave, fdLoad } = make(ls);
  // done lives in cw_progress_v1, streak in cw_srs_v1, week in cw_rotation_start.
  // Duplicating them here is exactly the desync the spec forbids.
  fdSave({ role: 'ms3', done: { 'x.md': true }, streak: 9, week: 3 });
  const out = fdLoad();
  assert.equal(out.role, 'ms3');
  assert.equal(out.done, undefined);
  assert.equal(out.streak, undefined);
  assert.equal(out.week, undefined);
});

// ---- exam countdown -----------------------------------------------------------------

test('fdExamCountdown is empty outside weeks 5 and 6', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  for (const w of [null, 1, 2, 3, 4]) {
    assert.equal(fdExamCountdown(w, wed), '');
  }
});

test('week 6 counts down to Friday', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime(); // Wednesday
  assert.equal(fdExamCountdown(6, wed), '· exam in ~2 days');
});

test('week 5 adds the extra week', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(5, wed), '· exam in ~9 days');
});

test('the day itself reads as exam day, not "in ~0 days"', () => {
  const { fdExamCountdown } = make(memStorage());
  const fri = new Date(2026, 7, 14, 9, 0, 0).getTime(); // Friday
  assert.equal(fdExamCountdown(6, fri), '· exam day — good luck');
});

test('one day out is singular', () => {
  const { fdExamCountdown } = make(memStorage());
  const thu = new Date(2026, 7, 13, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(6, thu), '· exam in ~1 day');
});

// Scoped to the RETURNED strings, not the file. AUDIENCE_TOKEN_RE bans tokens in
// user-visible copy — tests/phase-policy.test.mjs:193,200 apply it to label values for
// the same reason. A whole-file scan would fail on identifiers and comments that never
// reach a reader.
test('every countdown string the module emits is audience-neutral', () => {
  const { fdExamCountdown } = make(memStorage());
  for (let d = 0; d < 7; d += 1) {
    for (const w of [5, 6]) {
      const out = fdExamCountdown(w, new Date(2026, 7, 10 + d, 9, 0, 0).getTime());
      assert.doesNotMatch(out, AUDIENCE_TOKEN_RE,
        `fdExamCountdown(${w}) emitted an audience token: "${out}"`);
    }
  }
});

// ---- daily pick ---------------------------------------------------------------------

const CANDIDATES = [
  { ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' },
];

test('fdDailyPick returns null when every candidate is done', () => {
  const { fdDailyPick } = make(memStorage());
  const done = { 'a.md': true, 'b.md': true, 'c.md': true };
  assert.equal(fdDailyPick(CANDIDATES, done, Date.now()), null);
});

test('fdDailyPick returns null for an empty candidate list', () => {
  const { fdDailyPick } = make(memStorage());
  assert.equal(fdDailyPick([], {}, Date.now()), null);
});

test('fdDailyPick never returns a completed item', () => {
  const { fdDailyPick } = make(memStorage());
  const done = { 'a.md': true, 'c.md': true };
  for (let d = 0; d < 14; d += 1) {
    const now = new Date(2026, 7, 1 + d, 9, 0, 0).getTime();
    assert.equal(fdDailyPick(CANDIDATES, done, now).ref, 'b.md');
  }
});

test('fdDailyPick is stable within a local day and rotates across days', () => {
  const { fdDailyPick } = make(memStorage());
  const morning = new Date(2026, 7, 1, 7, 0, 0).getTime();
  const evening = new Date(2026, 7, 1, 22, 0, 0).getTime();
  const tomorrow = new Date(2026, 7, 2, 7, 0, 0).getTime();
  assert.equal(fdDailyPick(CANDIDATES, {}, morning).ref,
    fdDailyPick(CANDIDATES, {}, evening).ref,
    'the pick must not change at 8pm — that is the UTC bug');
  assert.notEqual(fdDailyPick(CANDIDATES, {}, morning).ref,
    fdDailyPick(CANDIDATES, {}, tomorrow).ref);
});

test('fdDailyPick cycles through every candidate over a full period', () => {
  const { fdDailyPick } = make(memStorage());
  const seen = new Set();
  for (let d = 0; d < 3; d += 1) {
    seen.add(fdDailyPick(CANDIDATES, {}, new Date(2026, 7, 1 + d, 9, 0, 0).getTime()).ref);
  }
  assert.equal(seen.size, 3);
});

// ---- progress ring ------------------------------------------------------------------

test('fdRingStep starts at the from value and ends at the to value', () => {
  const { fdRingStep } = make(memStorage());
  assert.equal(fdRingStep(0, 80, 0, 600), 0);
  assert.equal(fdRingStep(0, 80, 600, 600), 80);
});

test('fdRingStep clamps past the duration rather than overshooting', () => {
  const { fdRingStep } = make(memStorage());
  assert.equal(fdRingStep(0, 80, 5000, 600), 80);
});

test('fdRingStep eases out — past halfway by the midpoint', () => {
  const { fdRingStep } = make(memStorage());
  assert.ok(fdRingStep(0, 100, 300, 600) > 50,
    'cubic ease-out must be past halfway at the midpoint');
});

test('fdRingStep is monotonic and returns integers', () => {
  const { fdRingStep } = make(memStorage());
  let prev = -1;
  for (let t = 0; t <= 600; t += 50) {
    const v = fdRingStep(0, 97, t, 600);
    assert.equal(v, Math.round(v), 'ring percent must be an integer');
    assert.ok(v >= prev, `ring must not go backwards at t=${t}`);
    prev = v;
  }
});

test('fdRingStep animates downward too', () => {
  const { fdRingStep } = make(memStorage());
  assert.equal(fdRingStep(80, 20, 600, 600), 20);
  assert.ok(fdRingStep(80, 20, 300, 600) < 50);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fd-state.test.mjs`
Expected: FAIL — `ENOENT` reading `frontdoor/fd_state.js`.

- [ ] **Step 3: Write the module**

Create `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js`:

```js
/* Front door state + engagement mechanics. Injected via /*__FD_STATE__*\/ — see
   SNIPPET_MARKERS in common.py. Everything here is pure or storage-only so it can be
   unit-tested directly (tests/fd-state.test.mjs) instead of through a DOM.

   Depends on localDayStr/localDayIndex from the PHASE_POLICY snippet, which is injected
   into the same page. Day boundaries are LOCAL: the prototype used UTC, which moves a US
   Eastern student's daily pick to 7pm.

   Copy rule: strings here ship to BOTH sites unrebranded — audience-neutral, "Exam",
   never "Shelf" (tests/shell-copy.test.mjs). */
var FD_STORE='cw_frontdoor_v1';

/* Persisted keys are ONLY those with no existing home. done lives in cw_progress_v1,
   streak in cw_srs_v1.stats, and the rotation week in cw_rotation_start/cw_start_week —
   copying them here would create two sources that silently desync. */
var FD_KEYS=['role','tab','viewWeek','openId','fromTab','scrollPos'];

function fdLoad(){
  try{ return JSON.parse(localStorage.getItem(FD_STORE)||'{}')||{}; }catch(_){ return {}; }
}
function fdSave(o){
  var out={}, src=o||{};
  for(var i=0;i<FD_KEYS.length;i++){
    var k=FD_KEYS[i];
    if(src[k]!==undefined) out[k]=src[k];
  }
  try{ localStorage.setItem(FD_STORE, JSON.stringify(out)); }catch(_){ }
}

/* Weeks 5-6 carry a countdown to the Friday of week 6. Week 5 is one week further out,
   so it adds 7. Returns '' for every other week so callers can concatenate unconditionally. */
function fdExamCountdown(week, nowMs){
  if(week!==5&&week!==6) return '';
  var d=new Date(nowMs||Date.now());
  var days=((5-d.getDay())+7)%7 + (week===5?7:0);
  if(days===0) return '· exam day — good luck';
  return '· exam in ~'+days+' day'+(days===1?'':'s');
}

/* Deterministic per local calendar day, skipping anything already done. Candidates are
   supplied by the caller (the library-only reads) so this stays free of week membership. */
function fdDailyPick(candidates, doneMap, nowMs){
  var pool=[], done=doneMap||{};
  for(var i=0;i<(candidates||[]).length;i++){
    if(!done[candidates[i].ref]) pool.push(candidates[i]);
  }
  if(!pool.length) return null;
  return pool[localDayIndex(nowMs)%pool.length];
}

/* Cubic ease-out, matching the 600ms ring sweep in the design. Callers drive elapsed from
   rAF; keeping the easing pure is what makes the curve testable without a frame loop. */
function fdRingStep(from, to, elapsed, duration){
  var dur=duration||600;
  var k=Math.min(1,Math.max(0,elapsed/dur));
  var e=1-Math.pow(1-k,3);
  return Math.round(from+(to-from)*e);
}
```

> Note the escaped closing marker in the comment above (`*\/`). Writing the literal
> `/*__FD_STATE__*/` inside a block comment would both close the comment early and give the
> file a second marker occurrence.

- [ ] **Step 4: Register the marker**

In `13_Faculty_Resources/_automation/site_build/common.py`, extend `SNIPPET_MARKERS`:

```python
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
    "/*__PHI_HEURISTIC__*/": "phi_heuristic.js",
    "/*__SW_REGISTER__*/": "sw_register.js",
    "/*__CALIB_LOG__*/": "calib_log.js",
    "/*__PHASE_POLICY__*/": "phase_policy.js",
    "/*__SESS_CAPSULE__*/": "sess_capsule.js",
    "/*__FD_STATE__*/": "frontdoor/fd_state.js",
}
```

`inject_shared_snippets()` already resolves each value relative to the build directory via
`os.path.join(os.path.dirname(os.path.abspath(__file__)), fname)`, so the `frontdoor/` prefix
needs no code change.

- [ ] **Step 5: Extend the snippet-expansion test**

In `13_Faculty_Resources/_automation/test_common.py`, alongside the existing
`test_phase_policy_snippet_expands_with_short_signature`, add:

```python
    def test_fd_state_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__FD_STATE__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("var FD_STORE='cw_frontdoor_v1';", t)
        self.assertNotIn("/*__FD_STATE__*/", t)
```

This mirrors `test_phase_policy_snippet_expands_with_short_signature` exactly — same `self._page()`
helper, same `assertTrue` on the return value, same "marker is gone" assertion. It also proves the
`frontdoor/` path prefix resolves, which is the only new thing about this marker.

- [ ] **Step 6: Run every affected test**

```bash
node --test tests/fd-state.test.mjs tests/phase-policy.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/*.test.mjs
```

Expected: all PASS. The full root suite must stay green — `SNIPPET_MARKERS` is shared with
five other snippets.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js \
  13_Faculty_Resources/_automation/site_build/common.py \
  13_Faculty_Resources/_automation/site_build/test_common.py \
  tests/fd-state.test.mjs
git commit -m "feat(frontdoor): fd_state.js — persistence and engagement mechanics

The first front door module, injected through the existing SNIPPET_MARKERS
system so its functions are unit-testable directly rather than through a
DOM. Persists only state with no existing home: done, streak, and the
rotation week keep their current keys so nothing desyncs.

Day boundaries are local. The prototype's UTC arithmetic rotated a US
Eastern student's daily pick at 7pm and could attribute an evening session
to the next day."
```

---

## Verification before handoff to Plan 2

Run the full local gate and confirm green before considering this plan done:

```bash
python3 -m pip install -r requirements.txt
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Both site builds must still succeed. Nothing in this plan touches `spa_index.html`, so the
shipped shell is byte-identical apart from the `phase_policy.js` snippet growing — which is
exactly what `tests/phase-chip.test.mjs` and `tests/phase-wiring.test.mjs` pin.

**Not covered here, deliberately** — these belong to Plan 2 and must not be attempted in this
plan: the eight remaining `fd_*` modules, `frontdoor.css` and the dark tokens, `curriculum.json`'s
`roles` lists (they stay `{"ms3": [], "resident": []}` until `fd_shell.js` renders the wizard that
consumes them), retiring `learning-path.html` and its four count pins, the `RESIDENT_REBRAND`
rewrite, the Playwright spec rewrites, and the `extractShellCopy()` additions in
`tests/shell-copy.test.mjs`.

**One deliberate simplification against the spec:** §2.2 lists `dailyPickDay` as a persisted key.
It is dropped. `fdDailyPick` derives the pick from `localDayIndex(nowMs)`, so it is already stable
within a local day — caching the day would be dead state with its own staleness bug. The spec is
amended to match.
