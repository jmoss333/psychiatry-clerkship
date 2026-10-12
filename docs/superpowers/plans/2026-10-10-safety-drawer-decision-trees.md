# Safety Drawer Decision Trees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Safety kit's agitation, suicide and delirium checklists into keyboard-navigable,
high-contrast decision trees with an always-available "Escalate to attending" script, and pause
the page underneath while the safety drawer is open.

**Architecture:** The existing `.fd-sheet` drawer is extended, not replaced. Tree content lives in
`topic_meta.json` (`safetyTree`) so it inherits faculty attestation. A new pure ES5 renderer
(`fd_tree.js`) draws trees and scripts. `fd_wire.js` carries transient overlay state (`treePath`,
`escalate`). The shell (`spa_index.html`) freezes the page with `inert`, pauses media, and posts
`cw-pause`/`cw-resume` to the tool frame. Production shows a tree only on an attested page; a
deploy preview shows an unattested one under a DRAFT banner.

**Tech Stack:** ES5 string renderers injected into `spa_index.html`; Python 3 validators
(unittest, jsonschema Draft 7); `node:test`; Playwright smoke suite (`tests/smoke`).

**Spec:** `docs/superpowers/specs/2026-10-10-safety-drawer-decision-trees-design.md`. Read §4
(design), §6 (the clinical text being encoded) and §7 (owner rulings: D1 keep "attending", D2–D4
approved, D5 settled at PR 2 merge).

## Global Constraints

- **Two PRs, never mixed.** PR 1 is governance: `topic_meta.schema.json`, `validate_topic_meta.py`,
  `validate_curriculum.py` and their tests, plus the spec and this plan (neutral). PR 2 is content
  + shell and touches **no** governance path: nothing under `bin/`, `.github/`, `.claude/`,
  `faculty-console/`, no validator, no `*.schema.json`. `bin/check_governance_separation.py` (L1)
  fails a diff that mixes them.
- **No agent writes an attestation.** Never edit `13_Faculty_Resources/reviewed.json` or any
  `facultyReview` block. The owner re-attests the three kit pages in the faculty console after
  PR 2 merges.
- **ES5 only** in `frontdoor/*.js` and shell script: `var`/`function`; no `const`, `let`, `=>`,
  template literals. No `localStorage.`, `document.`, `window.`, `Date.now()` in `fd_tree.js`.
- **No clinical text in any renderer.** Every clinical string lives in `topic_meta.json`
  `safetyTree`. `fd_tree.js` and `fd_sheet.js` must not contain any of: `CIWA`, `COWS`, `C-SSRS`,
  `thiamine`, `buprenorphine`, `fingerstick`, `benzodiazepine`, `anticholinergic`,
  `de-escalation`, `lethal means`, `CAM screen`, `hypoglycemia`, `ideation`, `akathisia` —
  comments included.
- **Audience-neutral copy.** No `/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`
  (substring) in `frontdoor.css`, `fd_wire.js`, `fd_tree.js`, emitted HTML. Avoid words containing
  "une" (`tune`, `June`, `pruned`, `unexpected`, `unexplained`) in those files, comments too.
- **Tree strings:** no dose literal (`\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b`, case-insensitive),
  no run of 3+ digits, crisis contacts only in `crisis_resources.json`.
- **CSS:** colours only as `var(--fd-*)` tokens from `clinical-warm.css`; no raw hex anywhere in
  `frontdoor.css`, comments included; no new raw `font-size|border-radius|gap|padding|margin` value
  (the 189 pin in `site_build/design_drift_baseline.json` cannot rise) — use `--fd-space-*`,
  `--fd-font-*`, `--fd-radius-*`. Rules using any `--fd-danger*` token need a selector matched by
  the `SAFETY` regex in `tests/fd-tokens.test.mjs`.
- **Contrast:** drawer text ≥ **7:1** in light and dark; borders and focus ≥ 3:1; tappable
  controls ≥ 48px (`calc(var(--fd-target-touch) + var(--fd-space-2))`).
- **State:** `treePath`, `escalate` are transient overlay keys. Never add them to `FD_KEYS`
  (`fd_state.js`), `FD_HISTORY_KEYS` or `baseChanged()` (`fd_wire.js`). No new storage keys.
- **Tests never read live governance.** Tree tests pin review state with fixtures
  (`tests/live-governance-state.test.mjs` re-runs `fd-sheet.test.mjs` under demotion scenarios).
- **Visual baselines** regenerate only through the "Refresh visual baselines" workflow on Ubuntu.
- **Pushing** runs `bash bin/verify.sh` as the pre-push hook (several minutes). Run pushes in the
  background, capture the real exit code (`cmd; rc=$?; echo "exit $rc"; exit $rc`), and read the
  log. A worktree whose media are Git-LFS stubs fails both site builds: fill them with
  `git lfs checkout` (local store, no bandwidth), never `git lfs pull`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Line numbers** in this plan are as of `78082c88`. Earlier tasks shift later ones, so find
  each edit point by the quoted text, not the number.

## Review Focus

The five inputs the spec implies but no spec-driven test exercises, most likely first. Each has a
test in the task named.

1. **A stale or tampered `treePath`** (`["nope.0"]`, `["danger.7"]`, an answer past an action) —
   the tree renders from its start with no trail, never a node the answers did not lead to.
   *Task 6, "a path that does not replay renders the start".*
2. **Escape on the script screen** — closes the whole drawer and returns focus to `✚ Safety`
   (Escape always closes; Back is a button). *Task 11, "Escape from a script closes the drawer".*
3. **"Open the full page →" from a tree** — every mount loses `inert` before the page mounts, or
   the pending-high notice silently loses its focus. *Task 10, "the pause syncs before the base
   view is rebuilt"; Task 11, "Open the full page releases the page".*
4. **Phone widths (390, 320) with the longest labels and spoken-menu blanks** — no horizontal
   scroll, every control ≥ 48px. *Task 11, "the drawer fits a 320px phone".*
5. **An answer pressed twice quickly** — the second press lands on the focused heading and does
   nothing; the tree advances exactly one step. *Task 11, "a double press advances one step".*

---

# PR 1 — governance (branch `claude/safety-button-slideout-drawer-7b5040`, PR #1014)

Work in `/Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/cotw-pr-handoff-interrupted-3a3e32`
(already locked). `A=13_Faculty_Resources/_automation` below.

### Task 1: Schema for `safetyTree`

**Files:**
- Modify: `topic_meta.schema.json` (record `properties`, after `safetyDoc` ~line 78; new root
  `definitions`)
- Test: `13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py`

**Interfaces:**
- Produces: `#/definitions/safetyTree` (Draft 7). Question node = `{id, ask, hint?, options[2-4]
  of {label, next}}`; action node = `{id, title, tone: danger|first, act[1-4], escalate: now|soon,
  see?[1-2]}`; `scripts = {now, soon?}`, each `{label, identify, situation, background, assessment,
  recommendation, readBack}`.

- [ ] **Step 1: Add the shared fixture and failing schema tests**

In `test_validate_topic_meta_safety.py`, add `from jsonschema import Draft7Validator` to the
imports, and after the `BASE = {...}` line add:

```python
SCRIPT = {
    "label": "Come now", "identify": "This is [your name], [your role].",
    "situation": "Situation [what you saw].", "background": "Background.",
    "assessment": "Assessment.", "recommendation": "Recommendation.",
    "readBack": "Read back [their instructions].",
}

# A minimal valid tree: two questions, two actions, both scripts. Mutations below break exactly
# one rule each.
TREE = {
    "start": "q1",
    "nodes": [
        {"id": "q1", "ask": "Question one?", "hint": "Hint.",
         "options": [{"label": "Yes", "next": "a1"}, {"label": "No", "next": "q2"}]},
        {"id": "q2", "ask": "Question two?",
         "options": [{"label": "Left", "next": "a1"}, {"label": "Right", "next": "a2"}]},
        {"id": "a1", "title": "Act one", "tone": "danger", "act": ["Do one."],
         "escalate": "now", "see": ["other.md"]},
        {"id": "a2", "title": "Act two", "tone": "first", "act": ["Do two."], "escalate": "soon"},
    ],
    "scripts": {"now": SCRIPT, "soon": dict(SCRIPT, label="See today")},
}


class SafetyTreeSchemaTest(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(REPO, "topic_meta.schema.json"), encoding="utf-8") as fh:
            self.validator = Draft7Validator(json.load(fh))

    def errors(self, tree):
        return list(self.validator.iter_errors({"x.md": dict(BASE, safetyTree=tree)}))

    def test_accepts_a_valid_tree(self):
        self.assertEqual(self.errors(TREE), [])

    def test_rejects_a_tree_without_a_now_script(self):
        tree = copy.deepcopy(TREE)
        del tree["scripts"]["now"]
        self.assertTrue(self.errors(tree))

    def test_rejects_a_node_that_mixes_question_and_action_keys(self):
        tree = copy.deepcopy(TREE)
        tree["nodes"][0]["title"] = "Both"
        self.assertTrue(self.errors(tree))

    def test_rejects_an_unknown_tree_key(self):
        self.assertTrue(self.errors(dict(TREE, extra=True)))

    def test_the_soon_script_is_checked_through_its_ref(self):
        tree = copy.deepcopy(TREE)
        del tree["scripts"]["soon"]["readBack"]
        self.assertTrue(self.errors(tree))
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py -k SafetyTreeSchemaTest`
Expected: `test_accepts_a_valid_tree` PASSES (the record schema is open today) and the four
`rejects`/`soon` tests FAIL (`AssertionError: [] is not true`).

- [ ] **Step 3: Add the schema**

In `topic_meta.schema.json`, after the `"safetyDoc": { "type": "string", "minLength": 1 },` line
inside the record `properties`, add:

```json
      "safetyTree": { "$ref": "#/definitions/safetyTree" },
```

and add this as the last key of the root object (add a comma after the previous root key):

```json
  "definitions": {
    "treeId": { "type": "string", "pattern": "^[a-z][a-z0-9-]{0,23}$" },
    "safetyScriptText": { "type": "string", "minLength": 1, "maxLength": 240 },
    "safetyScript": {
      "type": "object",
      "additionalProperties": false,
      "required": ["label", "identify", "situation", "background", "assessment", "recommendation", "readBack"],
      "properties": {
        "label": { "type": "string", "minLength": 1, "maxLength": 60 },
        "identify": { "$ref": "#/definitions/safetyScriptText" },
        "situation": { "$ref": "#/definitions/safetyScriptText" },
        "background": { "$ref": "#/definitions/safetyScriptText" },
        "assessment": { "$ref": "#/definitions/safetyScriptText" },
        "recommendation": { "$ref": "#/definitions/safetyScriptText" },
        "readBack": { "$ref": "#/definitions/safetyScriptText" }
      }
    },
    "safetyTreeNode": {
      "type": "object",
      "required": ["id"],
      "oneOf": [
        {
          "additionalProperties": false,
          "required": ["id", "ask", "options"],
          "properties": {
            "id": { "$ref": "#/definitions/treeId" },
            "ask": { "type": "string", "minLength": 1, "maxLength": 140 },
            "hint": { "type": "string", "minLength": 1, "maxLength": 160 },
            "options": {
              "type": "array", "minItems": 2, "maxItems": 4,
              "items": {
                "type": "object", "additionalProperties": false, "required": ["label", "next"],
                "properties": {
                  "label": { "type": "string", "minLength": 1, "maxLength": 60 },
                  "next": { "$ref": "#/definitions/treeId" }
                }
              }
            }
          }
        },
        {
          "additionalProperties": false,
          "required": ["id", "title", "tone", "act", "escalate"],
          "properties": {
            "id": { "$ref": "#/definitions/treeId" },
            "title": { "type": "string", "minLength": 1, "maxLength": 80 },
            "tone": { "enum": ["danger", "first"] },
            "act": {
              "type": "array", "minItems": 1, "maxItems": 4,
              "items": { "type": "string", "minLength": 1, "maxLength": 160 }
            },
            "escalate": { "enum": ["now", "soon"] },
            "see": {
              "type": "array", "minItems": 1, "maxItems": 2,
              "items": { "type": "string", "minLength": 1 }
            }
          }
        }
      ]
    },
    "safetyTree": {
      "type": "object",
      "additionalProperties": false,
      "required": ["start", "nodes", "scripts"],
      "properties": {
        "start": { "$ref": "#/definitions/treeId" },
        "nodes": {
          "type": "array", "minItems": 2, "maxItems": 24,
          "items": { "$ref": "#/definitions/safetyTreeNode" }
        },
        "scripts": {
          "type": "object", "additionalProperties": false, "required": ["now"],
          "properties": {
            "now": { "$ref": "#/definitions/safetyScript" },
            "soon": { "$ref": "#/definitions/safetyScript" }
          }
        }
      }
    }
  }
```

- [ ] **Step 4: Run the tests and the schema gate**

Run:
```bash
python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py -k SafetyTreeSchemaTest
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
```
Expected: all PASS / OK (real `topic_meta.json` has no `safetyTree` yet, so it still validates).

- [ ] **Step 5: Commit**

```bash
git add topic_meta.schema.json 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py
git commit -m "$(printf 'Schema: safetyTree for safety-kit protocols\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 2: `validate_topic_meta.py` tree rules

**Files:**
- Modify: `13_Faculty_Resources/_automation/validate_topic_meta.py` (constants + two functions
  after `def bad` ~line 183; one call inside the per-record loop after the `safetySteps` block
  ~line 323)
- Test: `13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py`

**Interfaces:**
- Consumes: `TREE`, `SCRIPT`, `BASE`, `_run(entry)` from the test file (Task 1).
- Produces: validator messages containing `safetyTree` and the substrings asserted below.

- [ ] **Step 1: Write the failing tests**

Append to `test_validate_topic_meta_safety.py`, before `if __name__ == "__main__":`:

```python
class SafetyTreeValidatorTest(unittest.TestCase):
    def run_tree(self, mutate=None, record=None):
        tree = copy.deepcopy(TREE)
        if mutate:
            mutate(tree)
        entry = record if record is not None else dict(
            BASE, safetySteps=["a", "b", "c"], safetyDoc="d", safetyTree=tree)
        return _run(entry)

    def assert_rejects(self, needle, mutate=None, record=None):
        r = self.run_tree(mutate, record)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(needle, r.stdout)

    def test_accepts_a_valid_tree(self):
        r = self.run_tree()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_word_boundaries_spare_clinical_words_that_contain_une(self):
        r = self.run_tree(lambda t: t["nodes"][0].__setitem__("hint", "Unexplained autoimmune signs."))
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_rejects_a_tree_without_the_checklist_fallback(self):
        self.assert_rejects("requires 'safetySteps'", record=dict(BASE, safetyTree=TREE))

    def test_rejects_a_non_object_tree(self):
        self.assert_rejects("'safetyTree' must be an object", record=dict(
            BASE, safetySteps=["a", "b", "c"], safetyDoc="d", safetyTree=[]))

    def test_rejects_a_tree_without_a_now_script(self):
        self.assert_rejects("'now' script", lambda t: t["scripts"].pop("now"))

    def test_rejects_an_unknown_script_key(self):
        self.assert_rejects("'now' and 'soon' only",
                            lambda t: t["scripts"].__setitem__("later", SCRIPT))

    def test_rejects_a_script_missing_a_part(self):
        self.assert_rejects("must have exactly the keys",
                            lambda t: t["scripts"]["now"].pop("readBack"))

    def test_rejects_a_blank_outside_a_script(self):
        self.assert_rejects("blanks belong in scripts only",
                            lambda t: t["nodes"][0].__setitem__("ask", "Is [name] safe?"))

    def test_rejects_an_unbalanced_bracket_in_a_script(self):
        self.assert_rejects("bracket outside a [blank]",
                            lambda t: t["scripts"]["now"].__setitem__("situation", "Call [now."))

    def test_rejects_a_dose_literal(self):
        self.assert_rejects("dose literal",
                            lambda t: t["nodes"][2]["act"].__setitem__(0, "Give 5 mg."))

    def test_rejects_a_crisis_or_phone_number(self):
        self.assert_rejects("3+ digits",
                            lambda t: t["nodes"][2]["act"].__setitem__(0, "Call 988."))

    def test_rejects_an_audience_token(self):
        self.assert_rejects("audience-specific token",
                            lambda t: t["nodes"][2].__setitem__("title", "Student move"))

    def test_rejects_a_duplicate_node_id(self):
        self.assert_rejects("duplicate node id",
                            lambda t: t["nodes"][3].__setitem__("id", "a1"))

    def test_rejects_a_malformed_node_id(self):
        self.assert_rejects("needs an id matching",
                            lambda t: t["nodes"][3].__setitem__("id", "Bad Id"))

    def test_rejects_a_node_mixing_question_and_action_keys(self):
        self.assert_rejects("mixes question and action keys",
                            lambda t: t["nodes"][0].__setitem__("tone", "danger"))

    def test_rejects_a_question_with_one_option(self):
        self.assert_rejects("needs 2-4 options",
                            lambda t: t["nodes"][0].__setitem__("options", t["nodes"][0]["options"][:1]))

    def test_rejects_an_option_pointing_nowhere(self):
        self.assert_rejects("points at unknown node",
                            lambda t: t["nodes"][0]["options"][0].__setitem__("next", "zz"))

    def test_rejects_a_bad_tone(self):
        self.assert_rejects("tone must be",
                            lambda t: t["nodes"][2].__setitem__("tone", "amber"))

    def test_rejects_an_action_with_no_acts(self):
        self.assert_rejects("needs 1-4 actions",
                            lambda t: t["nodes"][2].__setitem__("act", []))

    def test_rejects_an_escalation_to_a_missing_script(self):
        self.assert_rejects("escalates to missing script",
                            lambda t: t["scripts"].pop("soon"))

    def test_rejects_a_see_link_to_its_own_page(self):
        self.assert_rejects("must not name its own page",
                            lambda t: t["nodes"][2].__setitem__("see", ["x.md"]))

    def test_rejects_a_see_that_is_not_a_list(self):
        self.assert_rejects("see must list 1-2 page refs",
                            lambda t: t["nodes"][2].__setitem__("see", "other.md"))

    def test_rejects_a_start_that_names_no_node(self):
        self.assert_rejects("names no node", lambda t: t.__setitem__("start", "zz"))

    def test_rejects_an_unreachable_node(self):
        self.assert_rejects("unreachable from start", lambda t: t["nodes"].append(
            {"id": "a3", "title": "Lost", "tone": "first", "act": ["Do."], "escalate": "now"}))

    def test_rejects_a_cycle(self):
        self.assert_rejects("has a cycle",
                            lambda t: t["nodes"][1]["options"][0].__setitem__("next", "q1"))

    def test_rejects_a_path_longer_than_five_questions(self):
        def deep(t):
            chain = [{"id": "c%d" % i, "ask": "Q%d?" % i,
                      "options": [{"label": "Go", "next": "c%d" % (i + 1)},
                                  {"label": "Stop", "next": "a2"}]} for i in range(6)]
            chain[-1]["options"][0]["next"] = "a2"
            t["nodes"] = chain + t["nodes"][2:]
            t["start"] = "c0"
        self.assert_rejects("more than 5 questions", deep)

    def test_rejects_an_over_long_question(self):
        self.assert_rejects("max 140",
                            lambda t: t["nodes"][0].__setitem__("ask", "x" * 141))
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py -k SafetyTreeValidatorTest`
Expected: `test_accepts_a_valid_tree` and the `une` test PASS; every `test_rejects_*` FAILS
(`0 != 1`).

- [ ] **Step 3: Implement the rules**

In `validate_topic_meta.py`, directly after `def bad(k, msg): errs.append("%s: %s" % (k, msg))`,
add:

```python
# safetyTree (2026-10-10 safety-drawer spec §4.3): the branching view of a safety-kit protocol.
# It carries the page's attestation like safetySteps, so its shape is checked here, where a bad
# tree fails the build before it reaches the one surface that must be right under pressure.
# Rules that need curriculum.json (kit membership, `see` targets) live in validate_curriculum.py.
TREE_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,23}$")
TREE_BLANK_RE = re.compile(r"\[[^\[\]]{1,80}\]")
# Mirrors DOSE_RE in .claude/hooks/clerkship_guards.py (itself mirroring check-static-site.mjs).
TREE_DOSE_RE = re.compile(r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b", re.I)
# Three or more digits in a row covers every crisis line and phone number. Crisis contacts live
# in crisis_resources.json only; a tree states none.
TREE_DIGITS_RE = re.compile(r"\d{3,}")
# validate_curriculum.py's ROLE_AUDIENCE_TOKEN_RE with word boundaries: the bare form fires on
# "unexplained" and "autoimmune" (UNE), and a tree is clinical prose where both can occur.
TREE_AUDIENCE_RE = re.compile(r"\b(?:MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford)\b", re.I)
TREE_SCRIPT_KEYS = ("label", "identify", "situation", "background", "assessment",
                    "recommendation", "readBack")
TREE_MAX_QUESTIONS = 5
TREE_CAPS = {"ask": 140, "hint": 160, "label": 60, "title": 80, "act": 160,
             "script": 240, "scriptLabel": 60}
TREE_QUESTION_KEYS = {"id", "ask", "hint", "options"}
TREE_ACTION_KEYS = {"id", "title", "tone", "act", "escalate", "see"}


def tree_text_problems(text, cap, allow_blanks):
    """Problems with one tree string, as message fragments; empty when it is fine."""
    if not isinstance(text, str) or not text.strip():
        return ["must be a non-empty string"]
    out = []
    if len(text) > cap:
        out.append("is %d characters (max %d)" % (len(text), cap))
    if TREE_DOSE_RE.search(text):
        out.append("contains a dose literal")
    if TREE_DIGITS_RE.search(text):
        out.append("contains a run of 3+ digits (crisis contacts live in crisis_resources.json)")
    if TREE_AUDIENCE_RE.search(text):
        out.append("contains an audience-specific token")
    rest = TREE_BLANK_RE.sub("", text) if allow_blanks else text
    if "[" in rest or "]" in rest:
        out.append("has a bracket outside a [blank]" if allow_blanks
                   else "has a [blank]; blanks belong in scripts only")
    return out


def check_safety_tree(k, v):
    tree = v.get("safetyTree")
    if not isinstance(tree, dict):
        bad(k, "'safetyTree' must be an object")
        return
    if "safetySteps" not in v:
        bad(k, "'safetyTree' requires 'safetySteps' and 'safetyDoc' (the checklist is its fallback)")
    extra = set(tree) - {"start", "nodes", "scripts"}
    if extra:
        bad(k, "safetyTree has unknown key(s): %s" % ", ".join(sorted(extra)))
    scripts = tree.get("scripts")
    if not isinstance(scripts, dict) or "now" not in scripts:
        bad(k, "safetyTree.scripts must be an object with a 'now' script")
        scripts = scripts if isinstance(scripts, dict) else {}
    for key in sorted(scripts):
        script, label = scripts[key], "safetyTree.scripts.%s" % key
        if key not in ("now", "soon"):
            bad(k, "%s: script keys are 'now' and 'soon' only" % label)
            continue
        if not isinstance(script, dict) or set(script) != set(TREE_SCRIPT_KEYS):
            bad(k, "%s must have exactly the keys %s" % (label, ", ".join(TREE_SCRIPT_KEYS)))
            continue
        for part in TREE_SCRIPT_KEYS:
            cap = TREE_CAPS["scriptLabel"] if part == "label" else TREE_CAPS["script"]
            for problem in tree_text_problems(script[part], cap, part != "label"):
                bad(k, "%s.%s %s" % (label, part, problem))
    nodes = tree.get("nodes")
    if not isinstance(nodes, list) or len(nodes) < 2:
        bad(k, "safetyTree.nodes must be a list of at least 2 nodes")
        return
    by_id = {}
    for i, node in enumerate(nodes):
        nid = node.get("id") if isinstance(node, dict) else None
        if not isinstance(nid, str) or not TREE_ID_RE.match(nid):
            bad(k, "safetyTree.nodes[%d] needs an id matching %s" % (i, TREE_ID_RE.pattern))
        elif nid in by_id:
            bad(k, "safetyTree: duplicate node id %r" % nid)
        else:
            by_id[nid] = node
    for nid, node in by_id.items():
        label, keys = "safetyTree node %r" % nid, set(node)
        if "ask" in node:
            if keys - TREE_QUESTION_KEYS:
                bad(k, "%s mixes question and action keys: %s"
                    % (label, ", ".join(sorted(keys - TREE_QUESTION_KEYS))))
                continue
            for problem in tree_text_problems(node["ask"], TREE_CAPS["ask"], False):
                bad(k, "%s ask %s" % (label, problem))
            if "hint" in node:
                for problem in tree_text_problems(node["hint"], TREE_CAPS["hint"], False):
                    bad(k, "%s hint %s" % (label, problem))
            options = node.get("options")
            if not isinstance(options, list) or not 2 <= len(options) <= 4:
                bad(k, "%s needs 2-4 options" % label)
                continue
            for j, opt in enumerate(options):
                if not isinstance(opt, dict) or set(opt) != {"label", "next"}:
                    bad(k, "%s option %d must be {label, next}" % (label, j))
                    continue
                for problem in tree_text_problems(opt["label"], TREE_CAPS["label"], False):
                    bad(k, "%s option %d label %s" % (label, j, problem))
                if opt["next"] not in by_id:
                    bad(k, "%s option %d points at unknown node %r" % (label, j, opt["next"]))
            continue
        if keys - TREE_ACTION_KEYS or not {"title", "tone", "act", "escalate"} <= keys:
            bad(k, "%s must be a question {ask, options} or an action {title, tone, act, escalate}"
                % label)
            continue
        for problem in tree_text_problems(node["title"], TREE_CAPS["title"], False):
            bad(k, "%s title %s" % (label, problem))
        if node["tone"] not in ("danger", "first"):
            bad(k, "%s tone must be 'danger' or 'first'" % label)
        acts = node["act"]
        if not isinstance(acts, list) or not 1 <= len(acts) <= 4:
            bad(k, "%s needs 1-4 actions" % label)
        else:
            for j, act in enumerate(acts):
                for problem in tree_text_problems(act, TREE_CAPS["act"], False):
                    bad(k, "%s act %d %s" % (label, j, problem))
        if node["escalate"] not in scripts:
            bad(k, "%s escalates to missing script %r" % (label, node["escalate"]))
        if "see" in node:
            see = node["see"]
            if (not isinstance(see, list) or not 1 <= len(see) <= 2
                    or not all(isinstance(s, str) and s for s in see)):
                bad(k, "%s see must list 1-2 page refs" % label)
            elif k in see:
                bad(k, "%s see must not name its own page" % label)
    start = tree.get("start")
    if start not in by_id:
        bad(k, "safetyTree.start %r names no node" % (start,))
        return
    # Walk every path from start: no cycle, no unreachable node, no path past the budget.
    reached, found = set(), set()

    def walk(nid, asked, on_path):
        reached.add(nid)
        node = by_id[nid]
        if "ask" not in node:
            return
        if nid in on_path:
            found.add("safetyTree has a cycle through node %r" % nid)
            return
        if asked >= TREE_MAX_QUESTIONS:
            found.add("safetyTree: a path from start asks more than %d questions"
                      % TREE_MAX_QUESTIONS)
            return
        options = node.get("options")
        for opt in options if isinstance(options, list) else []:
            if isinstance(opt, dict) and opt.get("next") in by_id:
                walk(opt["next"], asked + 1, on_path | {nid})

    walk(start, 0, frozenset())
    for message in sorted(found):
        bad(k, message)
    for nid in sorted(set(by_id) - reached):
        bad(k, "safetyTree node %r is unreachable from start" % nid)
```

Then inside the per-record loop, directly after the `safetySteps` block (after the line
`bad(k, "'safetySteps' requires a non-empty 'safetyDoc' documentation line")`, at the same
4-space indent as `if "safetySteps" in v:`), add:

```python
    if "safetyTree" in v:
        check_safety_tree(k, v)
```

- [ ] **Step 4: Run the tests and every harness that runs this validator**

Run:
```bash
python3 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 tools/evidence_registry/test_registry.py
```
Expected: all tests PASS; `topic_meta.json OK — … contract satisfied.`; the evidence-registry
harness (which copies this validator into a temp repo) still prints OK.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/validate_topic_meta.py 13_Faculty_Resources/_automation/test_validate_topic_meta_safety.py
git commit -m "$(printf 'validate_topic_meta: safetyTree shape, caps, blanks and bans\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 3: `validate_curriculum.py` cross-file tree rules

**Files:**
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py` (after the
  `for ref in SAFETY_KIT_REFS:` loop that ends with the `evidenceIds` check, ~line 640)
- Test: `13_Faculty_Resources/_automation/test_validate_curriculum.py` (`SafetyKitTest`, ~line 1536)

**Interfaces:**
- Consumes: `SAFETY_KIT_REFS`, `topic_meta`, `bad` already in `validate_curriculum.py`.
- Produces: messages `only a safetyKit protocol may carry a safetyTree` and
  `must name another safetyKit protocol`.

- [ ] **Step 1: Write the failing tests**

In `test_validate_curriculum.py`, add above `class SafetyKitTest`:

```python
def _tree(see=None):
    """Smallest tree validate_curriculum.py has an opinion about; its shape is
    validate_topic_meta.py's business."""
    action = {"id": "a", "title": "T", "tone": "first", "act": ["Do."], "escalate": "now"}
    if see is not None:
        action["see"] = see
    script = {"label": "L", "identify": "I.", "situation": "S.", "background": "B.",
              "assessment": "A.", "recommendation": "R.", "readBack": "RB."}
    return {"start": "q", "scripts": {"now": script}, "nodes": [
        {"id": "q", "ask": "Q?", "options": [{"label": "A", "next": "a"},
                                             {"label": "B", "next": "a"}]},
        action]}
```

and add these methods to `SafetyKitTest`:

```python
    def test_accepts_a_safety_tree_on_a_kit_protocol(self):
        meta = _topic_meta()
        meta["agitation.md"]["safetyTree"] = _tree(see=["delirium.md"])
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_safety_tree_outside_the_kit(self):
        meta = _topic_meta()
        meta["welcome.md"] = {"safetyTree": _tree()}
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("only a safetyKit protocol may carry a safetyTree", r.stdout)

    def test_rejects_a_see_link_to_a_page_outside_the_kit(self):
        meta = _topic_meta()
        meta["agitation.md"]["safetyTree"] = _tree(see=["welcome.md"])
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("must name another safetyKit protocol", r.stdout)

    def test_rejects_a_see_link_to_the_protocol_itself(self):
        meta = _topic_meta()
        meta["agitation.md"]["safetyTree"] = _tree(see=["agitation.md"])
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("must name another safetyKit protocol", r.stdout)
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py -k SafetyKitTest`
Expected: the accepts test PASSES; the three rejects tests FAIL (`0 != 1`).

- [ ] **Step 3: Implement**

In `validate_curriculum.py`, after the `for ref in SAFETY_KIT_REFS:` loop (after its final
`"evidenceIds contains no canonical evidence ID (got %r)" % refs)` line, back at the loop's own
indent), add:

```python
    # safetyTree (2026-10-10 safety-drawer spec §4.3): a branching protocol belongs to a KIT
    # protocol only, and its `see` links may open only another kit protocol. The tree's own
    # shape is validate_topic_meta.py's; this file owns what needs curriculum.json to answer.
    if isinstance(topic_meta, dict):
        for key in sorted(topic_meta):
            meta = topic_meta[key]
            if not isinstance(meta, dict) or "safetyTree" not in meta:
                continue
            if key not in SAFETY_KIT_REFS:
                bad("safetyTree %s" % key, "only a safetyKit protocol may carry a safetyTree")
                continue
            tree = meta.get("safetyTree")
            nodes = tree.get("nodes") if isinstance(tree, dict) else None
            for node in nodes if isinstance(nodes, list) else []:
                see = node.get("see") if isinstance(node, dict) else None
                for target in see if isinstance(see, list) else []:
                    if target == key or target not in SAFETY_KIT_REFS:
                        bad("safetyTree %s" % key,
                            "node %r: see %r must name another safetyKit protocol"
                            % (node.get("id"), target))
```

- [ ] **Step 4: Run the tests and the real validator**

Run:
```bash
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
```
Expected: all PASS; the real curriculum validates (no tree exists yet).

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/validate_curriculum.py 13_Faculty_Resources/_automation/test_validate_curriculum.py
git commit -m "$(printf 'validate_curriculum: safetyTree only on kit protocols; see links stay in the kit\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 4: Verify, push and hand PR 1 to the owner

**Files:** none new (this plan file is committed here).

- [ ] **Step 1: Run the separation guard and the fast gate**

```bash
python3 bin/check_governance_separation.py
bash bin/verify.sh --quick
```
Expected: separation exits 0 (governance + neutral spec/plan only); quick gate green.

- [ ] **Step 2: Push (full gate runs as the pre-push hook)**

The plan is already committed on this branch. Commit any amendments made during execution
first, then:

```bash
L=$TMPDIR/pr1-push.log; git push > "$L" 2>&1; rc=$?; echo "push exit $rc" >> "$L"; tail -5 "$L"
```
Run the push in the background; expected final line `push exit 0` and `ALL CHECKS PASSED`.

- [ ] **Step 3: Retitle PR #1014 and mark it ready**

```bash
gh pr edit 1014 --title "Safety trees: schema + validator rules for safetyTree (PR 1 of 2)"
gh pr ready 1014
```
Update the body to say: governance-only; adds `safetyTree` schema and rules; no data uses it
yet; PR 2 (content + shell) is stacked on it. Ask the owner to merge it.

---

# PR 2 — content + shell (branch `claude/safety-drawer-trees-2026-10-10`)

`SB=13_Faculty_Resources/_automation/site_build` below.

### Task 5: New worktree, and the three trees in `topic_meta.json`

**Files:**
- Modify: `topic_meta.json` (adds `safetyTree` to `pg_suicide.md`, `agitation.md`, `delirium.md`)
- Create (scratch, not committed): `$SCRATCH/add_safety_trees.py`

**Interfaces:**
- Produces: real trees whose node ids are the §6 ids (`danger`, `vitals`, `driver`, `restless`,
  `ask`, `plan`, `acute`, `contradict`, `onset`, `attention`, `alertness`, …). Later tasks walk
  them by structure, never by these ids or their wording.

- [ ] **Step 1: Create the worktree, stacked on PR 1**

```bash
cd /Users/jm/Psychiatry-Clerkship-Library
git fetch origin
python3 bin/lean_worktrees.py new safety-drawer-trees \
  --base origin/claude/safety-button-slideout-drawer-7b5040 \
  --branch claude/safety-drawer-trees-2026-10-10
cd /Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/safety-drawer-trees
git worktree lock --reason "claude: safety drawer PR 2" .
git lfs ls-files -n | while read f; do [ "$(stat -f %z "$f")" -lt 200 ] && echo "$f"; done | wc -l
```
Expected: `0` stubs. If not 0, run `git lfs checkout`.

- [ ] **Step 2: Invoke the `topic-meta-author` skill**

It is required for any `topic_meta.json` edit. Use it to confirm nothing else on these three
records must change. It must not touch `facultyReview`.

- [ ] **Step 3: Write the insertion script**

`$SCRATCH` is the session scratchpad. Create `$SCRATCH/add_safety_trees.py`:

```python
"""Insert the approved safety trees (spec §6) into topic_meta.json. Run from the repo root."""
import json

IDENTIFY = "This is [your name], [your role] on [team]. I'm calling about [patient initials] in room [room number]."
READ_BACK = "Let me read that back: [their instructions]. I'll call you again if anything changes."


def script(label, situation, background, assessment, recommendation):
    return {"label": label, "identify": IDENTIFY, "situation": situation,
            "background": background, "assessment": assessment,
            "recommendation": recommendation, "readBack": READ_BACK}


def q(nid, ask, hint, *options):
    node = {"id": nid, "ask": ask}
    if hint:
        node["hint"] = hint
    node["options"] = [{"label": label, "next": nxt} for label, nxt in options]
    return node


def a(nid, title, tone, escalate, acts, see=None):
    node = {"id": nid, "title": title, "tone": tone, "act": acts, "escalate": escalate}
    if see:
        node["see"] = see
    return node


NOW, SOON = "Ask them to come now", "Ask them to see the patient today"

AGITATION_BG = "[Age], admitted for [reason]. This started [when]. Recent medication changes or PRNs: [list, or none]."
AGITATION = {"start": "danger", "nodes": [
    q("danger", "Is anyone in immediate physical danger right now?",
      "An assault in progress, an object being used as a weapon, or the patient hurting themselves.",
      ("Yes", "imminent"), ("No", "vitals")),
    q("vitals", "Ask the nurse for vitals and a fingerstick glucose. What do they show?",
      "Keep one calm voice talking while someone checks.",
      ("Something is abnormal", "medical"), ("Normal", "driver"), ("Can't get them yet", "unchecked")),
    q("driver", "Could this be delirium, intoxication, or withdrawal?",
      "Confusion that comes and goes, poor attention, tremor or sweating, or a recent last drink or dose.",
      ("Yes, or not sure", "medical-driver"), ("No", "restless")),
    q("restless", "Could it be akathisia, pain, or urinary retention?",
      "A new or increased antipsychotic with restlessness they can't sit through, or untreated pain or a full bladder.",
      ("Yes, or not sure", "treatable"), ("No", "behavioral")),
    a("imminent", "Imminent danger: get help, stay safe", "danger", "now", [
        "Call for help now: tell the nurse and use your unit's emergency response, per local policy.",
        "Step back. Keep your exit clear and never stand between the patient and the door.",
        "Let trained staff lead. Medication or restraint for imminent danger is the team's decision.",
        "Afterward, tell the team what you saw and join the debrief."]),
    a("medical", "Abnormal vitals or glucose: treat it as medical first", "danger", "now", [
        "Tell the nurse and your team now. The abnormal value is the emergency.",
        "Keep de-escalating verbally while the team treats the cause.",
        "Do not call this behavioral until the cause is found."]),
    a("unchecked", "Vitals unknown: escalate while you keep trying", "danger", "now", [
        "Keep de-escalating with one calm voice; offer space and real choices.",
        "Tell the team the vitals and glucose could not be checked. That is itself a reason to come.",
        "Treat a medical cause as possible until someone has ruled it out."]),
    a("medical-driver", "Possible delirium, intoxication, or withdrawal", "danger", "now", [
        "Tell the team now. The driver changes the treatment.",
        "Flag that benzodiazepines can worsen delirium, unless this is alcohol or sedative withdrawal.",
        "Pull recent vitals, labs, the medication and PRN list, and the last drink or dose."],
      see=["delirium.md", "t_sud.md"]),
    a("treatable", "Possible akathisia, pain, or retention", "first", "soon", [
        "Tell the team. Akathisia is easy to mistake for difficult behavior.",
        "Pull medication changes and PRNs given in the last day.",
        "Keep using verbal de-escalation while the team reviews."]),
    a("behavioral", "No medical driver found: least restrictive first", "first", "soon", [
        "Lower stimulation: a quieter space and fewer people.",
        "One calm voice: name the feeling, offer real choices, set kind and clear limits.",
        "If medication is needed, the team offers oral before IM. IM is for imminent danger only.",
        "Afterward, join the debrief: what could have prevented this?"]),
], "scripts": {
    "now": script(NOW,
        "They are agitated right now and I'm worried about safety: [what they are doing]. I need you to come now.",
        AGITATION_BG,
        "Vitals [values, or not yet checked]; glucose [value, or not yet checked]. I'm concerned about [delirium, intoxication, withdrawal, akathisia, or I don't know the cause].",
        "Please come assess now. The nurse is aware and staff are with the patient. What should we do until you get here?"),
    "soon": script(SOON,
        "They were agitated and are calmer now with verbal de-escalation. No one is in immediate danger.",
        AGITATION_BG,
        "Vitals and glucose are normal. I'm wondering about [akathisia, pain, retention, or a behavioral cause].",
        "Could you assess them — when can you come? Is there anything you want done before then?"),
}}

SUICIDE_BG = "[Age], admitted for [reason]. Past attempts: [yes, no, or unknown]. Access to lethal means: [firearms, stockpiled medication, other, or unknown]."
SUICIDE = {"start": "danger", "nodes": [
    q("danger", "Is there immediate danger right now?",
      "An attempt in progress, a means in hand, or the patient trying to leave the unit.",
      ("Yes", "imminent"), ("No", "ask")),
    q("ask", 'Ask directly: "Have you had thoughts of killing yourself?"',
      'If they say no, also ask: "Have you wished you would not wake up?"',
      ("Yes, thoughts of killing themselves", "plan"), ("Only a wish to be dead", "plan"),
      ("No to both", "contradict")),
    q("plan", "Ask about plan, intent, and preparation.",
      '"Have you thought about how? How likely are you to act? Have you taken any steps?"',
      ("Any plan, intent, or preparation", "high"), ("None of these", "acute")),
    q("acute", "Is any acute risk factor present right now?",
      "Intoxication or withdrawal, severe agitation, psychosis or command hallucinations, severe insomnia, new access to lethal means, or unwilling to work on safety.",
      ("Yes", "high-acute"), ("No", "thoughts")),
    q("contradict", "Does anything contradict that answer?",
      "Collateral or a note saying otherwise, a recent attempt, or sudden improvement after severe suicidality.",
      ("Yes", "contradicted"), ("No", "denies")),
    a("imminent", "Immediate danger: do not leave them alone", "danger", "now", [
        "Keep the patient in sight and call for help: the nurse and your unit's emergency response, per local policy.",
        "Do not put yourself at risk. Let trained staff remove any means.",
        "Tell the team exactly what you saw and heard."]),
    a("high", "Plan, intent, or preparation: escalate now", "danger", "now", [
        "Tell the nurse now. The patient should not be alone until the team has assessed them.",
        "Write down their exact words.",
        "If not yet asked: access to firearms, stockpiled medication, or other means."]),
    a("high-acute", "Thoughts plus an acute risk factor: escalate now", "danger", "now", [
        "Tell the nurse and your team now.",
        "Write down their exact words and which risk factor you found.",
        "Ask about firearms and stockpiled medication if you have not yet."]),
    a("thoughts", "Thoughts without plan or acute factors: still report", "first", "soon", [
        "Tell your team before this encounter ends. You do not decide their risk.",
        "Ask about lethal means, firearms first, and any past attempt.",
        "Write down their exact words and the reasons for living they named."]),
    a("contradicted", "Denies, but the picture disagrees: escalate now", "danger", "now", [
        'Tell your team what contradicts the denial. It outweighs "denies SI."',
        "Note the source: collateral, the chart, or what you observed."]),
    a("denies", "Denies, nothing contradicts: tell the team anyway", "first", "soon", [
        '"Denies SI" is not the end of the assessment. Tell the team what prompted your concern.',
        "Ask about past attempts and access to lethal means if you have not yet."]),
], "scripts": {
    "now": script(NOW,
        "I'm calling about a suicide safety concern. They told me: '[their exact words]'. I need you to assess them now.",
        SUICIDE_BG,
        "I'm worried their acute risk is high because [plan, intent, preparation, an acute risk factor, or contradicting collateral]. Right now [who is with them].",
        "Please come now. Should they be on closer observation until you get here?"),
    "soon": script(SOON,
        "I want to report a safety concern from my interview. They told me: '[their exact words]'.",
        SUICIDE_BG,
        "I did not find a plan, intent, preparation, or acute risk factor, but I'm not the one who decides their risk.",
        "Can you assess them today — when? Is there anything I should do first?"),
}}

DELIRIUM_BG = "[Age], admitted for [reason]. Baseline mental status: [from collateral, or unknown]. Recent medications: [anticholinergics, benzodiazepines, opioids, or other new ones]."
DELIRIUM = {"start": "vitals", "nodes": [
    q("vitals", "Check vitals and a fingerstick glucose first. What do they show?",
      "Ask the nurse if you can't check them yourself. Note whether the patient is hard to rouse.",
      ("Abnormal, or hard to rouse", "unstable"), ("Normal", "onset"), ("Not checked yet", "unchecked")),
    q("onset", "Did this start over hours to days, and does it come and go?",
      "Compare with their baseline. Lucid on morning rounds and disorganized by evening counts.",
      ("Yes", "attention"), ("Don't know their baseline", "attention"),
      ("No, long-standing and stable", "baseline")),
    q("attention", "Test attention: months of the year backward, or digit span. Can they do it?",
      "Test it deliberately. Don't infer it from conversation.",
      ("No, they lose the sequence", "alertness"), ("Yes, attention is intact", "attentive")),
    q("alertness", "Is their thinking disorganized, or is their level of alertness off?",
      "Rambling or illogical speech; or too drowsy, or keyed-up and hypervigilant.",
      ("Yes", "delirium"), ("No", "partial")),
    a("unstable", "Abnormal vitals or hard to rouse: medical emergency", "danger", "now", [
        "Tell the nurse now. Use your unit's emergency response if they are unresponsive or unstable, per local policy.",
        "Stay with the patient until help arrives."]),
    a("unchecked", "New confusion, vitals unknown: escalate now", "danger", "now", [
        "Ask the nurse for vitals and a fingerstick glucose now.",
        "New confusion is medical until proven otherwise. Tell the team while vitals are checked."]),
    a("baseline", "Long-standing and stable: confirm the baseline", "first", "soon", [
        'Get collateral on their baseline mental status, so "altered" means a real change.',
        "Tell the team what you found. If anything turns out to be new, start this again."]),
    a("attentive", "Attention intact: delirium less likely right now", "first", "soon", [
        "Intact attention makes delirium less likely. Reconsider the diagnosis.",
        "Retest later this shift. Delirium waxes and wanes.",
        "Tell the team which test you used and the result."]),
    a("delirium", "Features of delirium: a medical emergency", "danger", "now", [
        "Tell the team now: delirium until proven otherwise, not a psychiatric label.",
        "Pull the med list. Flag anticholinergics, benzodiazepines, and opioids.",
        "Look for the cause: infection, metabolic, hypoxia, withdrawal, retention, constipation, pain."],
      see=["agitation.md"]),
    a("partial", "Inattentive, but not the full picture yet", "first", "soon", [
        "Tell the team about the acute change and the attention result.",
        "Review the med list for anticholinergics, benzodiazepines, and opioids.",
        "Retest later this shift. The picture can change within hours."]),
], "scripts": {
    "now": script(NOW,
        "They have a new change in mental status: [what you saw]. I'm worried this is delirium [or: they are hard to rouse]. I need you to come now.",
        DELIRIUM_BG,
        "Vitals [values, or not yet checked]; glucose [value, or not yet checked]. Attention test: [result]. It started [when] and [comes and goes, or is constant].",
        "Please come assess now. Is there anything you want started before you get here?"),
    "soon": script(SOON,
        "I'm calling about a change in mental status I noticed: [what you saw]. Vitals and glucose are normal and nothing is unsafe right now.",
        DELIRIUM_BG,
        "Attention test: [result]. It started [when]. I'm not sure yet whether this is delirium.",
        "Can you see them today — when? Should I retest attention later this shift?"),
}}

path = "topic_meta.json"
raw = open(path, encoding="utf-8").read()
data = json.loads(raw)
assert json.dumps(data, indent=2, ensure_ascii=False) + "\n" == raw, "format would not round-trip"
for ref, tree in (("agitation.md", AGITATION), ("pg_suicide.md", SUICIDE), ("delirium.md", DELIRIUM)):
    assert "safetyTree" not in data[ref], ref
    data[ref]["safetyTree"] = tree
open(path, "w", encoding="utf-8").write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("inserted 3 trees")
```

- [ ] **Step 4: Run it and validate**

```bash
python3 -I "$SCRATCH/add_safety_trees.py"
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 bin/check_attestation_hashes.py
git diff --stat
```
Expected: `inserted 3 trees`; all three validators OK. `check_attestation_hashes.py` reports
`agitation.md`, `pg_suicide.md`, `delirium.md` as STALE and exits 0, which is expected drift.
The diff touches `topic_meta.json` only and adds lines to only those three records. If a
validator rejects a string, fix that string here and record the change for the owner; never
loosen a rule.

- [ ] **Step 5: Commit, push the branch and open the draft PR (claim)**

```bash
git add topic_meta.json
git commit -m "$(printf 'Safety kit: decision trees for agitation, suicide and delirium (spec §6)\n\nDrifts the three kit pages to pending until the owner re-attests them in\nthe faculty console.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
L=$TMPDIR/pr2-push.log; CLERKSHIP_PR_BASE=origin/claude/safety-button-slideout-drawer-7b5040 git push -u origin claude/safety-drawer-trees-2026-10-10 > "$L" 2>&1; rc=$?; echo "push exit $rc" >> "$L"; tail -5 "$L"
gh pr create --draft --base claude/safety-button-slideout-drawer-7b5040 \
  --title "Safety drawer: decision trees, escalation scripts, page pause (PR 2 of 2)" \
  --body "Stacked on PR 1 (#1014). Work in progress; see docs/superpowers/plans/2026-10-10-safety-drawer-decision-trees.md."
```
Run the push in the background. Expected: `push exit 0`. After `gh pr create`, call
`mcp__ccd_pr__get_status` and bind the PR if it isn't bound.

### Task 6: `fd_tree.js` renderer and its registration

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_tree.js`
- Modify: `$SB/common.py` (`SNIPPET_MARKERS`, ~line 890), `$SB/spa_index.html` (marker before
  `/*__FD_SHEET__*/`, ~line 2171), `tests/parallel-ceilings.test.mjs` (`EXPECTED_MARKER_COUNT`
  40 → 41)
- Create: `tests/fd-tree.test.mjs`

**Interfaces:**
- Consumes: `fdEsc(s)` from `fd_data.js`.
- Produces:
  - `fdTreeValid(tree) -> boolean`
  - `fdTreeWalk(tree, path) -> {node, trail:[{ask,label}], ok}`
  - `fdTreeView(tree, view, opts) -> string`, where `view = {path: string[], escalate:
    null|'now'|'soon'}` and `opts = {draft: boolean, kitTitles: {ref: title}}`.
  - Emitted attributes: `data-fd-tree-answer="<nodeId>.<optionIndex>"`, `data-fd-tree-back`,
    `data-fd-tree-restart`, `data-fd-escalate="now|soon"`, `data-fd-escalate-close`,
    `data-fd-safety="<ref>"`.
  - Classes: `fd-tree`, `fd-tree__draft`, `fd-tree__escalate`, `fd-tree__trail`,
    `fd-tree__heading`, `fd-tree__hint`, `fd-tree__options`, `fd-tree__option`,
    `fd-tree__verdict`, `is-danger`, `fd-tree__tone`, `fd-tree__acts`, `fd-tree__see`,
    `fd-tree__nav`, `fd-script`, `fd-script__label`, `fd-script__parts`, `fd-script__blank`,
    `fd-btn`, `fd-btn--ghost`.
  - Script heading id: `fdScriptHeading`.

- [ ] **Step 1: Write the failing tests**

Create `tests/fd-tree.test.mjs`:

```js
// Safety decision trees (2026-10-10 safety-drawer spec §4.1-4.4): fd_tree.js renders a tree and
// its escalation script from topic_meta.json's safetyTree and owns no clinical text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const treeSrc = read('frontdoor/fd_tree.js');
// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${treeSrc}
  return { fdTreeView: fdTreeView, fdTreeValid: fdTreeValid, fdTreeWalk: fdTreeWalk };
`);
const F = make();
const REAL_META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));
const REAL_TREES = Object.entries(REAL_META).filter(([, v]) => v && v.safetyTree);

const SCRIPT = {
  label: 'Come now', identify: 'This is [your name].', situation: 'S [what you saw].',
  background: 'B.', assessment: 'A.', recommendation: 'R.', readBack: 'RB [their instructions].',
};
const TREE = {
  start: 'q1',
  nodes: [
    { id: 'q1', ask: 'Question one?', hint: 'Hint one.', options: [{ label: 'Yes', next: 'a1' }, { label: 'No', next: 'q2' }] },
    { id: 'q2', ask: 'Question two?', options: [{ label: 'Left', next: 'a1' }, { label: 'Right', next: 'a2' }] },
    { id: 'a1', title: 'Act one', tone: 'danger', act: ['Do one.', 'Do two.'], escalate: 'now', see: ['other.md', 'unknown.md'] },
    { id: 'a2', title: 'Act two', tone: 'first', act: ['Do three.'], escalate: 'soon' },
  ],
  scripts: { now: SCRIPT, soon: { ...SCRIPT, label: 'See today' } },
};
const clone = () => JSON.parse(JSON.stringify(TREE));
const view = (path = [], escalate = null, opts = {}) =>
  F.fdTreeView(TREE, { path, escalate }, { kitTitles: { 'other.md': 'Other' }, ...opts });

test('the start screen is the first question, its answers, and a now escalation', () => {
  const html = view();
  assert.match(html, /<h3 class="fd-tree__heading" tabindex="-1">Question one\?<\/h3>/);
  assert.match(html, /<p class="fd-tree__hint">Hint one\.<\/p>/);
  assert.match(html, /data-fd-tree-answer="q1\.0">Yes<\/button>/);
  assert.match(html, /data-fd-tree-answer="q1\.1">No<\/button>/);
  assert.match(html, /class="fd-tree__escalate" data-fd-escalate="now">Escalate to attending</);
  assert.doesNotMatch(html, /fd-tree__trail|data-fd-tree-back|data-fd-tree-restart|fd-tree__draft/);
});

test('an answer moves to the next question with a trail and back/restart', () => {
  const html = view(['q1.1']);
  assert.match(html, /tabindex="-1">Question two\?<\/h3>/);
  assert.match(html, /<ol class="fd-tree__trail" aria-label="Your answers"><li>Question one\? — <b>No<\/b><\/li><\/ol>/);
  assert.match(html, /data-fd-tree-back>‹ Back<\/button>/);
  assert.match(html, /data-fd-tree-restart>Start over<\/button>/);
});

test('a first-move action escalates to its own soon script', () => {
  const html = view(['q1.1', 'q2.1']);
  assert.match(html, /<div class="fd-tree__verdict"><span class="fd-tree__tone">First move<\/span><h3 class="fd-tree__heading" tabindex="-1">Act two<\/h3><\/div>/);
  assert.match(html, /<ol class="fd-tree__acts"><li>Do three\.<\/li><\/ol>/);
  assert.match(html, /data-fd-escalate="soon">Escalate to attending/);
});

test('a danger action is marked in words as well as colour, and links only known protocols', () => {
  const html = view(['q1.0']);
  assert.match(html, /class="fd-tree__verdict is-danger"><span class="fd-tree__tone">Act now<\/span>/);
  assert.match(html, /data-fd-safety="other\.md">Open the Other protocol →<\/button>/);
  assert.doesNotMatch(html, /unknown\.md/);
});

test('a path that does not replay renders the start', () => {
  for (const path of [['nope.0'], ['q1.7'], ['q2.0'], ['q1.0', 'a1.0'], ['q1.x']]) {
    const html = view(path);
    assert.match(html, /tabindex="-1">Question one\?<\/h3>/, JSON.stringify(path));
    assert.doesNotMatch(html, /fd-tree__trail/, JSON.stringify(path));
  }
});

test('the now script lists the six ISBAR parts in order with blanks marked', () => {
  const html = view(['q1.1'], 'now');
  assert.match(html, /<h3 class="fd-tree__heading" id="fdScriptHeading" tabindex="-1">Say this to your attending<\/h3>/);
  const dts = [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(dts, ['Identify', 'Situation', 'Background', 'Assessment', 'Recommendation', 'Read back']);
  assert.match(html, /<mark class="fd-script__blank">\[your name\]<\/mark>/);
  assert.match(html, /data-fd-escalate-close>‹ Back to where you were<\/button>/);
  assert.doesNotMatch(html, /Escalate to attending|Need them sooner/);
});

test('a soon script offers the now script and nothing offers the reverse', () => {
  assert.match(view([], 'soon'), /data-fd-escalate="now">Need them sooner\? Use the come-now script</);
  assert.doesNotMatch(view([], 'now'), /data-fd-escalate="soon"/);
});

test('asking for a soon script on a tree without one shows the now script', () => {
  const t = clone();
  delete t.scripts.soon;
  const html = F.fdTreeView(t, { path: [], escalate: 'soon' }, {});
  assert.match(html, /<p class="fd-script__label">Come now<\/p>/);
  assert.doesNotMatch(html, /Need them sooner/);
});

test('the draft banner appears only when asked for', () => {
  assert.match(view([], null, { draft: true }), /<p class="fd-tree__draft" role="note">DRAFT — not faculty-reviewed\. Learners do not see this tree\.<\/p>/);
  assert.doesNotMatch(view([], null, { draft: false }), /fd-tree__draft/);
});

test('every tree string is escaped, blanks included', () => {
  const t = clone();
  t.nodes[0].ask = '<img src=x onerror=alert(1)>';
  t.scripts.now.situation = 'Say [<b>x</b>] now';
  assert.doesNotMatch(F.fdTreeView(t, { path: [] }, {}), /<img/);
  assert.match(F.fdTreeView(t, { path: [], escalate: 'now' }, {}),
    /<mark class="fd-script__blank">\[&lt;b&gt;x&lt;\/b&gt;\]<\/mark>/);
});

test('fdTreeValid accepts the fixture and fails closed on each broken rule', () => {
  assert.equal(F.fdTreeValid(TREE), true);
  const breaks = {
    'no now script': (t) => { delete t.scripts.now; },
    'start names no node': (t) => { t.start = 'zz'; },
    'duplicate id': (t) => { t.nodes[3].id = 'a1'; },
    'option points nowhere': (t) => { t.nodes[0].options[0].next = 'zz'; },
    'one option': (t) => { t.nodes[0].options.length = 1; },
    'five options': (t) => { t.nodes[0].options = Array(5).fill({ label: 'x', next: 'a1' }); },
    'bad tone': (t) => { t.nodes[2].tone = 'amber'; },
    'no acts': (t) => { t.nodes[2].act = []; },
    'soon without a soon script': (t) => { delete t.scripts.soon; },
    'cycle': (t) => { t.nodes[1].options[0].next = 'q1'; },
    'script missing a part': (t) => { delete t.scripts.now.readBack; },
    'not an object': () => null,
  };
  for (const [name, mutate] of Object.entries(breaks)) {
    const t = clone();
    const result = mutate(t);
    assert.equal(F.fdTreeValid(result === null ? null : t), false, name);
  }
  const deep = clone();
  deep.nodes = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, ask: `Q${i}?`,
    options: [{ label: 'Go', next: i === 5 ? 'a2' : `c${i + 1}` }, { label: 'Stop', next: 'a2' }] }))
    .concat(TREE.nodes.slice(3));
  deep.start = 'c0';
  assert.equal(F.fdTreeValid(deep), false, 'six questions on one path');
});

test('every real safetyTree passes the runtime check', () => {
  assert.ok(REAL_TREES.length >= 1, 'at least one real tree exists');
  for (const [ref, meta] of REAL_TREES) assert.equal(F.fdTreeValid(meta.safetyTree), true, ref);
});

test('no real tree string is copied into fd_tree.js', () => {
  for (const [ref, meta] of REAL_TREES) {
    const strings = [];
    for (const n of meta.safetyTree.nodes) {
      strings.push(n.ask, n.hint, n.title, ...(n.act || []), ...((n.options || []).map((o) => o.label)));
    }
    for (const s of Object.values(meta.safetyTree.scripts)) strings.push(...Object.values(s));
    for (const s of strings.filter((x) => typeof x === 'string' && x.length >= 16)) {
      assert.ok(!treeSrc.includes(s), `${ref}: "${s}" must live in topic_meta.json only`);
    }
  }
});

test('fd_tree.js is pure ES5 and names no clinical or audience token', () => {
  assert.doesNotMatch(treeSrc, /localStorage\.|document\.|window\.|Date\.now\(\)/);
  assert.doesNotMatch(treeSrc, /\bconst\s|\blet\s|=>|`/);
  const NEEDLES = ['CIWA', 'COWS', 'C-SSRS', 'thiamine', 'buprenorphine', 'fingerstick',
    'benzodiazepine', 'anticholinergic', 'de-escalation', 'lethal means', 'CAM screen',
    'hypoglycemia', 'ideation', 'akathisia'];
  for (const n of NEEDLES) assert.ok(!treeSrc.toLowerCase().includes(n.toLowerCase()), n);
  assert.doesNotMatch(treeSrc, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fd-tree.test.mjs`
Expected: FAIL. `readFileSync` throws ENOENT because `fd_tree.js` doesn't exist yet.

- [ ] **Step 3: Write `fd_tree.js`**

Create `$SB/frontdoor/fd_tree.js`:

```js
/* Safety decision trees: the branching view inside a safety-kit protocol sheet, and the
   escalation script it opens. 2026-10-10 safety-drawer spec, sections 4.1-4.4
   (docs/superpowers/specs/2026-10-10-safety-drawer-decision-trees-design.md).

   Pure, like fd_sheet.js: fdTreeView(tree, view, opts) -> string. No browser globals, no
   storage, no clock. ES5 only (var/function): it is a build-injected snippet, not a module.

   *** No clinical text lives here. *** Every question, answer, action and script line comes
   from topic_meta.json's safetyTree, which carries the page's faculty attestation. The only
   strings in this file are interface labels. tests/fd-tree.test.mjs pins both halves.

   State is a replay, not a pointer. view.path lists the answers taken, each
   "<nodeId>.<optionIndex>"; the current node is wherever replaying that list from tree.start
   leads. A path that does not replay (an answer for a different node, an option that is not
   there) renders the tree from its start, never a node the answers did not lead to. Nothing is
   persisted: the wiring clears the path whenever a sheet opens or closes.

   Escalation never waits for the end of a tree. "Escalate to attending" is on every tree
   screen: on a question it opens the `now` script (when in doubt, escalate now); on an action it
   opens that action's own script. A `soon` script offers the `now` script; nothing offers the
   reverse. */

function fdTreeNodes(tree){
  var list=tree&&tree.nodes, out={};
  if(!list||typeof list.length!=='number') return null;
  for(var i=0;i<list.length;i++){
    var n=list[i];
    if(!n||typeof n.id!=='string'||!FD_TREE_ID_RE.test(n.id)||out[n.id]) return null;
    out[n.id]=n;
  }
  return out;
}

var FD_TREE_ID_RE=/^[a-z][a-z0-9-]{0,23}$/;
var FD_TREE_STEP_RE=/^([a-z][a-z0-9-]{0,23})\.([0-3])$/;
var FD_TREE_MAX_QUESTIONS=5;
var FD_TREE_SCRIPT_PARTS=[
  ['identify','Identify'],['situation','Situation'],['background','Background'],
  ['assessment','Assessment'],['recommendation','Recommendation'],['readBack','Read back']
];

function fdTreeText(s){ return typeof s==='string'&&!!s.trim(); }

function fdTreeIsQuestion(n){ return !!n&&typeof n.ask==='string'&&!!n.options; }

function fdTreeScriptValid(s){
  if(!s||!fdTreeText(s.label)) return false;
  for(var i=0;i<FD_TREE_SCRIPT_PARTS.length;i++){
    if(!fdTreeText(s[FD_TREE_SCRIPT_PARTS[i][0]])) return false;
  }
  return true;
}

/* Every path from `id` reaches an action without revisiting a node and within the question
   budget; a cycle or a sixth question fails. */
function fdTreeDepthOk(nodes, id, asked, onPath){
  var n=nodes[id];
  if(!n||onPath[id]) return false;
  if(!fdTreeIsQuestion(n)) return true;
  if(asked>=FD_TREE_MAX_QUESTIONS) return false;
  onPath[id]=true;
  for(var i=0;i<n.options.length;i++){
    if(!fdTreeDepthOk(nodes,n.options[i].next,asked+1,onPath)){ onPath[id]=false; return false; }
  }
  onPath[id]=false;
  return true;
}

/* Runtime twin of validate_topic_meta.py's tree rules, failing CLOSED: anything malformed and
   the sheet shows the checklist instead. The build validator rejects bad data first; this is
   for a payload that arrives interrupted or stale. */
function fdTreeValid(tree){
  var nodes=fdTreeNodes(tree), scripts=tree&&tree.scripts;
  if(!nodes||!scripts||!fdTreeScriptValid(scripts.now)) return false;
  if(scripts.soon!==undefined&&!fdTreeScriptValid(scripts.soon)) return false;
  if(typeof tree.start!=='string'||!nodes[tree.start]) return false;
  for(var id in nodes){
    if(!Object.prototype.hasOwnProperty.call(nodes,id)) continue;
    var n=nodes[id];
    if(fdTreeIsQuestion(n)){
      var opts=n.options;
      if(!fdTreeText(n.ask)||typeof opts.length!=='number'||opts.length<2||opts.length>4) return false;
      for(var i=0;i<opts.length;i++){
        if(!opts[i]||!fdTreeText(opts[i].label)||!nodes[opts[i].next]) return false;
      }
    } else {
      if(!fdTreeText(n.title)||(n.tone!=='danger'&&n.tone!=='first')) return false;
      if(!n.act||typeof n.act.length!=='number'||n.act.length<1||n.act.length>4) return false;
      for(var j=0;j<n.act.length;j++){ if(!fdTreeText(n.act[j])) return false; }
      if(n.escalate!=='now'&&!(n.escalate==='soon'&&scripts.soon)) return false;
    }
  }
  return fdTreeDepthOk(nodes,tree.start,0,{});
}

/* Replays path from tree.start. {node, trail:[{ask,label}], ok}; on a path that does not replay,
   the start node with an empty trail and ok:false. Caller has established fdTreeValid(tree). */
function fdTreeWalk(tree, path){
  var nodes=fdTreeNodes(tree), node=nodes[tree.start], trail=[], steps=path||[];
  for(var i=0;i<steps.length;i++){
    var m=FD_TREE_STEP_RE.exec(String(steps[i]));
    var opt=(m&&m[1]===node.id&&fdTreeIsQuestion(node))?node.options[+m[2]]:null;
    if(!opt) return {node:nodes[tree.start],trail:[],ok:false};
    trail.push({ask:node.ask,label:opt.label});
    node=nodes[opt.next];
  }
  return {node:node,trail:trail,ok:true};
}

/* Script text with each spoken blank marked. Escaped FIRST, so the only markup is ours; the
   brackets stay inside the mark, so a blank still reads as one with styles off. The bound is
   160, not the validator's 80: escaping lengthens a blank ("don't" becomes "don&#39;t"), and
   a long spoken menu must not silently lose its mark. */
function fdTreeBlanks(text){
  return fdEsc(text).replace(/\[([^\[\]]{1,160})\]/g,'<mark class="fd-script__blank">[$1]</mark>');
}

function fdTreeEscalateButton(script, label){
  return '<button type="button" class="fd-tree__escalate" data-fd-escalate="'+script+'">'+
    fdEsc(label)+'</button>';
}

function fdTreeScriptView(tree, key){
  var used=(key==='soon'&&tree.scripts.soon)?'soon':'now', s=tree.scripts[used];
  var out='<section class="fd-script" aria-labelledby="fdScriptHeading">'+
    '<h3 class="fd-tree__heading" id="fdScriptHeading" tabindex="-1">Say this to your attending</h3>'+
    '<p class="fd-script__label">'+fdEsc(s.label)+'</p><dl class="fd-script__parts">';
  for(var i=0;i<FD_TREE_SCRIPT_PARTS.length;i++){
    var part=FD_TREE_SCRIPT_PARTS[i];
    out+='<dt>'+part[1]+'</dt><dd>'+fdTreeBlanks(s[part[0]])+'</dd>';
  }
  out+='</dl>';
  if(used==='soon') out+=fdTreeEscalateButton('now','Need them sooner? Use the come-now script');
  out+='<button type="button" class="fd-btn fd-btn--ghost" data-fd-escalate-close>'+
    '‹ Back to where you were</button>';
  return out+'</section>';
}

function fdTreeQuestionView(node){
  var out='<h3 class="fd-tree__heading" tabindex="-1">'+fdEsc(node.ask)+'</h3>';
  if(fdTreeText(node.hint)) out+='<p class="fd-tree__hint">'+fdEsc(node.hint)+'</p>';
  out+='<ul class="fd-tree__options">';
  for(var i=0;i<node.options.length;i++){
    out+='<li><button type="button" class="fd-tree__option" data-fd-tree-answer="'+
      fdEsc(node.id+'.'+i)+'">'+fdEsc(node.options[i].label)+'</button></li>';
  }
  return out+'</ul>';
}

/* Tone is said in words ("Act now" / "First move") as well as shown in colour, so it survives
   forced colours, a monochrome print and a screen reader. */
function fdTreeActionView(node, kitTitles){
  var danger=(node.tone==='danger'), titles=kitTitles||{}, see=node.see||[];
  var out='<div class="fd-tree__verdict'+(danger?' is-danger':'')+'">'+
    '<span class="fd-tree__tone">'+(danger?'Act now':'First move')+'</span>'+
    '<h3 class="fd-tree__heading" tabindex="-1">'+fdEsc(node.title)+'</h3></div>';
  out+='<ol class="fd-tree__acts">';
  for(var i=0;i<node.act.length;i++) out+='<li>'+fdEsc(node.act[i])+'</li>';
  out+='</ol>';
  var links='';
  for(var j=0;j<see.length;j++){
    if(!titles[see[j]]) continue;
    links+='<button type="button" class="fd-btn fd-btn--ghost" data-fd-safety="'+fdEsc(see[j])+'">'+
      'Open the '+fdEsc(titles[see[j]])+' protocol →</button>';
  }
  if(links) out+='<div class="fd-tree__see">'+links+'</div>';
  return out;
}

/* view: {path:[...], escalate:null|'now'|'soon'}; opts: {draft:boolean, kitTitles:{ref:title}}.
   The caller has established fdTreeValid(tree). */
function fdTreeView(tree, view, opts){
  var v=view||{}, o=opts||{};
  var walk=fdTreeWalk(tree,v.path), node=walk.node, question=fdTreeIsQuestion(node);
  var out='<div class="fd-tree">';
  if(o.draft===true){
    out+='<p class="fd-tree__draft" role="note">DRAFT — not faculty-reviewed. '+
      'Learners do not see this tree.</p>';
  }
  if(v.escalate==='now'||v.escalate==='soon') return out+fdTreeScriptView(tree,v.escalate)+'</div>';
  out+=fdTreeEscalateButton(question?'now':node.escalate,'Escalate to attending');
  if(walk.trail.length){
    out+='<ol class="fd-tree__trail" aria-label="Your answers">';
    for(var i=0;i<walk.trail.length;i++){
      out+='<li>'+fdEsc(walk.trail[i].ask)+' — <b>'+fdEsc(walk.trail[i].label)+'</b></li>';
    }
    out+='</ol>';
  }
  out+=question?fdTreeQuestionView(node):fdTreeActionView(node,o.kitTitles);
  if(walk.trail.length){
    out+='<div class="fd-tree__nav">'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-tree-back>‹ Back</button>'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-tree-restart>Start over</button>'+
    '</div>';
  }
  return out+'</div>';
}
```

Two notes on that file:
- `FD_TREE_ID_RE` is declared below `fdTreeNodes` on purpose. The snippet signature is the first
  line beginning `function ` under 60 characters, and `function fdTreeNodes(tree){` must be that
  line.
- `var` hoisting makes the order safe, because nothing calls `fdTreeNodes` until the whole shell
  script has run.

- [ ] **Step 4: Register the snippet**

In `$SB/common.py` `SNIPPET_MARKERS`, add directly above the `"/*__FD_SHEET__*/"` entry:
```python
    "/*__FD_TREE__*/": "frontdoor/fd_tree.js",
```
In `$SB/spa_index.html`, directly above the `  /*__FD_SHEET__*/` line, add:
```
  /*__FD_TREE__*/

```
In `tests/parallel-ceilings.test.mjs`, change the constant to:
```js
const EXPECTED_MARKER_COUNT = 41; // +1 2026-10-10: /*__FD_TREE__*/ (safety decision trees)
```

- [ ] **Step 5: Register the five new actions as handled**

`tests/fd-action-contract.test.mjs` scans every `fd_*.js` for emitted `data-fd-*` attributes, so
it goes red the moment `fd_tree.js` exists unless the controller lists them. Their dispatch
branches land in Task 9. In `$SB/frontdoor/fd_wire.js`:
1. Append to `FD_HANDLED_ATTRS`, before its closing `];` (add a comma after the previous last
   entry):
   `'data-fd-tree-answer','data-fd-tree-back','data-fd-tree-restart','data-fd-escalate','data-fd-escalate-close'`
2. Add to `FD_ACTION_SEMANTICS`:
   ```js
     'data-fd-tree-answer':'answer a safety tree question',
     'data-fd-tree-back':'step back one safety tree answer',
     'data-fd-tree-restart':'restart a safety tree',
     'data-fd-escalate':'show an escalation script',
     'data-fd-escalate-close':'return from an escalation script to its tree',
   ```
3. Add `'[data-fd-tree-answer],[data-fd-tree-back],[data-fd-tree-restart],[data-fd-escalate],[data-fd-escalate-close],'+`
   as a new line in `FD_ACTION_SELECTOR`, directly before the
   `'[data-fd-close-search],[data-fd-close-sheet],[data-fd-close-nudge],'+` line.

In `tests/fd-action-contract.test.mjs`, add to the sorted emitted list, in alphabetical position:
`'data-fd-escalate'`, `'data-fd-escalate-close'`, `'data-fd-tree-answer'`,
`'data-fd-tree-back'`, `'data-fd-tree-restart'`.

- [ ] **Step 6: Run the tests**

```bash
node --test tests/fd-tree.test.mjs tests/parallel-ceilings.test.mjs tests/fd-inject.test.mjs tests/fd-action-contract.test.mjs tests/fd-wire.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py
```
Expected: all PASS. `test_all_snippet_signatures_are_short_and_unique` passes with
`function fdTreeNodes(tree){`. Until Task 9, a click on a tree control dispatches to the no-op
fall-through, which is harmless because nothing renders a tree yet.

- [ ] **Step 7: Commit**

```bash
git add $SB/frontdoor/fd_tree.js $SB/frontdoor/fd_wire.js $SB/common.py $SB/spa_index.html tests/fd-tree.test.mjs tests/parallel-ceilings.test.mjs tests/fd-action-contract.test.mjs
git commit -m "$(printf 'Front door: fd_tree.js renders safety decision trees and escalation scripts\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 7: High-contrast CSS, the class inventory, token and contrast tests

**Files:**
- Modify: `$SB/frontdoor/frontdoor.css` (new section directly above
  `/* ═══ Reduced motion ═══…` at ~line 1692)
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` (header count, line 8;
  §9 "Side sheet and nudge", ~line 981)
- Modify: `tests/fd-tokens.test.mjs` (`SAFETY` regex, line 214)
- Modify: `tests/fd-contrast.test.mjs` (`PAIRS`, ending ~line 104)

**Interfaces:**
- Consumes: the class names listed in Task 6 "Produces".
- Produces: CSS rules for every one of them, plus `.fd-sheet--safety`, which Task 8 emits.

- [ ] **Step 1: Write the failing contrast and token expectations**

In `tests/fd-contrast.test.mjs`, add these rows to the end of `PAIRS` (before its closing `];`):

```js
  // Safety drawer AAA (2026-10-10 spec §4.6): every text pair inside .fd-sheet--safety reaches
  // 7:1 in both themes, and its borders and tone bars reach 3:1. Measured at authoring:
  // on-accent/danger-dark is 7.64 light and 7.0004 dark, the tightest pair here.
  ['fd-text', 'fd-surface-warm', 7], ['fd-text', 'fd-surface', 7],
  ['fd-on-accent', 'fd-danger-dark', 7], ['fd-text', 'fd-danger-wash', 7],
  ['fd-text', 'fd-teal-wash', 7], ['fd-text', 'fd-olive-wash', 7],
  ['fd-text-dim', 'fd-surface', 3], ['fd-danger', 'fd-danger-wash', 3],
  ['fd-teal', 'fd-teal-wash', 3], ['fd-danger-dark', 'fd-surface-warm', 3],
```

In `tests/fd-tokens.test.mjs`, append `|fd-tree|fd-script|fd-sheet--safety` inside the `SAFETY`
regex, immediately before its closing `/;`.

Run: `node --test tests/fd-contrast.test.mjs tests/fd-tokens.test.mjs tests/fd-sheet.test.mjs`
Expected: contrast PASSES (the pairs were measured); tokens and sheet still PASS (no CSS yet).
These are guards for the next step, not red tests: the red step is Step 3's class-count check.

- [ ] **Step 2: Add the CSS**

Insert directly above the `/* ═══ Reduced motion` line in `frontdoor.css`:

```css
/* ═══ Safety drawer: decision trees + escalation scripts ═════════════════════
   2026-10-10 safety-drawer spec §4.6. Text inside a safety sheet is --fd-text on a surface or a
   wash (11:1+ both themes); tone is a 6px bar and a WORD ("Act now" / "First move"), never red
   or teal text, because neither ink reaches 7:1 on the dark sheet. The one filled control,
   Escalate, is on-accent over danger-dark (7.64 light / 7.0004 dark). Controls are at least
   48px tall: the 44px touch token plus one 4px step. */
.fd-sheet--safety .fd-sheet__body{color:var(--fd-text)}
.fd-tree{display:flex;flex-direction:column;gap:var(--fd-space-6);margin-bottom:var(--fd-space-7)}
.fd-tree__draft{margin:0;padding:var(--fd-space-5) var(--fd-space-6);border:2px dashed var(--fd-text);border-radius:var(--fd-radius-md);background:var(--fd-olive-wash);color:var(--fd-text);font-size:var(--fd-font-sm);font-weight:700}
.fd-tree__escalate{display:block;width:100%;min-height:calc(var(--fd-target-touch) + var(--fd-space-2));padding:var(--fd-space-5) var(--fd-space-6);border:2px solid var(--fd-danger-dark);border-radius:var(--fd-radius-md);background:var(--fd-danger-dark);color:var(--fd-on-accent);font:inherit;font-size:var(--fd-font-md);font-weight:700;text-align:center;cursor:pointer}
.fd-tree__escalate:hover{text-decoration:underline}
.fd-tree__trail{margin:0;padding-left:var(--fd-space-8);font-size:var(--fd-font-sm);line-height:1.5;color:var(--fd-text)}
.fd-tree__trail li + li{margin-top:var(--fd-space-2)}
.fd-tree__heading{margin:0;font-size:var(--fd-font-xl);line-height:1.3;color:var(--fd-text)}
.fd-tree__hint{margin:var(--fd-space-3) 0 0;font-size:var(--fd-font-sm);line-height:1.5;color:var(--fd-text)}
.fd-tree__options{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--fd-space-4)}
.fd-tree__option{display:block;width:100%;min-height:calc(var(--fd-target-touch) + var(--fd-space-2));padding:var(--fd-space-5) var(--fd-space-6);border:2px solid var(--fd-text-dim);border-radius:var(--fd-radius-md);background:var(--fd-surface);color:var(--fd-text);font:inherit;font-size:var(--fd-font-md);font-weight:600;text-align:left;cursor:pointer}
.fd-tree__option:hover{border-color:var(--fd-text)}
.fd-tree__verdict{padding:var(--fd-space-5) var(--fd-space-6);border-left:6px solid var(--fd-teal);border-radius:var(--fd-radius-md);background:var(--fd-teal-wash)}
.fd-tree__verdict.is-danger{border-left-color:var(--fd-danger);background:var(--fd-danger-wash)}
.fd-tree__tone{display:block;margin-bottom:var(--fd-space-2);font-size:var(--fd-font-xs);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--fd-text)}
.fd-tree__acts{margin:0;padding-left:var(--fd-space-8);font-size:var(--fd-font-md);line-height:1.5;color:var(--fd-text)}
.fd-tree__acts li + li{margin-top:var(--fd-space-3)}
.fd-tree__see{display:flex;flex-direction:column;gap:var(--fd-space-3)}
.fd-tree__nav{display:flex;flex-wrap:wrap;gap:var(--fd-space-4)}
.fd-script{display:flex;flex-direction:column;gap:var(--fd-space-5)}
.fd-script__label{margin:0;font-weight:700;color:var(--fd-text)}
.fd-script__parts{margin:0}
.fd-script__parts dt{margin-top:var(--fd-space-5);font-size:var(--fd-font-xs);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--fd-text)}
.fd-script__parts dd{margin:var(--fd-space-2) 0 0;font-size:var(--fd-font-lg);line-height:1.5;color:var(--fd-text)}
.fd-script__blank{padding:0 var(--fd-space-1);border-bottom:2px dashed var(--fd-text);border-radius:var(--fd-radius-2xs);background:var(--fd-olive-wash);color:var(--fd-text)}
@media (forced-colors:active){
  .fd-tree__escalate,.fd-tree__option,.fd-tree__draft{border:2px solid ButtonText}
  .fd-tree__verdict{border:2px solid CanvasText;border-left-width:6px}
  .fd-script__blank{border-bottom-color:CanvasText}
}
@media (prefers-contrast:more){
  .fd-tree__option{border-color:var(--fd-text)}
  .fd-sheet--safety .fd-sheet__head{border-bottom:2px solid var(--fd-text)}
}

```

- [ ] **Step 3: Update the inventory, then run the token suite**

Run `node --test tests/fd-tokens.test.mjs` first. It FAILS: the inventory header says 585 but the
CSS now has 603 distinct `fd-*` names (585 + 18 new). In `CLASS-INVENTORY.md` line 8, replace
`585` with the number the failure reports (603 at `78082c88`). In §9, append to the tree outline:

```
    .fd-sheet--safety                  (modifier: kit list + kit protocols only)
    .fd-tree                           (protocol body when the page carries an attested safetyTree)
      .fd-tree__draft      [role=note] (deploy previews only, unattested tree)
      .fd-tree__escalate               (every tree screen; the script's urgency upgrade too)
      .fd-tree__trail                  (answers taken, only once there is one)
      .fd-tree__heading    [tabindex=-1] (focused after every tree action)
      .fd-tree__hint / .fd-tree__options > li > .fd-tree__option
      .fd-tree__verdict(.is-danger) > .fd-tree__tone + .fd-tree__heading
      .fd-tree__acts / .fd-tree__see / .fd-tree__nav
      .fd-script > .fd-script__label + .fd-script__parts(dt/dd) > .fd-script__blank
```
and to the §9 table:
```
| `.fd-sheet--safety` | Scope for the high-contrast safety treatment; never on Settings or item previews. |
| `.fd-tree__heading` | The one focus target after an answer, back, restart or script toggle (fd_wire focusSheetHeading). |
| `.fd-tree__verdict` | Action verdict: 6px tone bar + wash; `.is-danger` swaps teal for danger. Tone is also a word. |
| `.fd-script__blank` | A spoken blank; keeps its brackets so it reads as a blank with styles off. |
```
plus this warning line under the §9 outline:
```
⚠ Tone is never ink: neither --fd-danger nor --fd-teal reaches 7:1 as text on the dark sheet; `.fd-tree__tone` carries the word in --fd-text.
```

Run:
```bash
node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs tests/fd-path-route.test.mjs tests/fd-care-pack.test.mjs
python3 bin/check_design_drift.py
```
Expected: all PASS. Design drift reports no rise above the 189 raw-dimension pin.

- [ ] **Step 4: Commit**

```bash
git add $SB/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs
git commit -m "$(printf 'Front door: high-contrast safety tree styling (7:1 text, 48px controls)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 8: `fd_sheet.js` integration

**Files:**
- Modify: `$SB/frontdoor/fd_sheet.js` (`fdSheetProtocolBody` ~line 211, `fdSheet` ~line 497 and
  its return ~line 523; new `fdSheetIsSafety`, `fdSheetKitTitles` after `fdSheetKitEntry`)
- Modify: `tests/fd-sheet.test.mjs`, `tests/spa-shell-a11y.test.mjs` (line 115)

**Interfaces:**
- Consumes: `fdTreeValid`, `fdTreeView` (Task 6). State fields `treePath`, `escalate` (Task 9)
  and `draftTrees` (Task 10).
- Produces:
  - `fdSheetIsSafety(index, sheet) -> boolean`, used by the shell in Task 10.
  - `class="fd-sheet fd-sheet--safety"` on kit and kit-protocol sheets only.

- [ ] **Step 1: Update the test harness and fixtures**

In `tests/fd-sheet.test.mjs`, put the tree module into the loader (before `${sheetSrc}`) and
export the new functions:

```js
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_tree.js')}
  ${sheetSrc}
  return { fdSheet: fdSheet, fdNudge: fdNudge, fdBuildIndex: fdBuildIndex, fdEsc: fdEsc,
    fdSheetIsSafety: fdSheetIsSafety, fdTreeValid: fdTreeValid };
`);
```

After the `ATTESTED_INDEX` line add:

```js
// Safety trees, pinned with CONTROLLED review state (live-governance-state.test.mjs re-runs this
// file with the faculty's queue drained and refilled). TREE_REFS are the kit pages carrying a
// safetyTree in the real source; the checklist tests use NO_TREE_META so they keep covering all
// five protocols whatever the faculty have signed.
const TREE_REFS = KIT_REFS.filter((ref) => REAL_META[ref] && REAL_META[ref].safetyTree);
const withReview = (status) => Object.fromEntries(Object.entries(REAL_META).map(([k, v]) => [k,
  TREE_REFS.includes(k) ? { ...v, facultyReview: { lastReviewed: '2026-01-01', reviewer: 'Fixture reviewer', status } } : v]));
const TREE_META = withReview('reviewed');
const TREE_INDEX = F.fdBuildIndex(REAL_MS3_CUR, TREE_META, REAL_TOOLS, REAL_MAN);
const TREE_PENDING_META = withReview('pending');
const TREE_PENDING_INDEX = F.fdBuildIndex(REAL_MS3_CUR, TREE_PENDING_META, REAL_TOOLS, REAL_MAN);
const NO_TREE_META = Object.fromEntries(Object.entries(REAL_META).map(([k, v]) => {
  if (!v || typeof v !== 'object' || !('safetyTree' in v)) return [k, v];
  const { safetyTree, ...rest } = v;
  return [k, rest];
}));
const NO_TREE_INDEX = F.fdBuildIndex(REAL_MS3_CUR, NO_TREE_META, REAL_TOOLS, REAL_MAN);
```

Then repoint the checklist tests at the no-tree fixture. In the four tests **"every real kit
protocol renders at least 3 steps…"**, **"protocol steps render in topic_meta order,
verbatim"**, **"the Document callout carries topic_meta.safetyDoc"** and every **step-check**
test (the ones using `KIT_REFS[0]`, ~lines 278–310):
- replace `F.fdSheet(REAL_INDEX, REAL_META,` with `F.fdSheet(NO_TREE_INDEX, NO_TREE_META,`
- replace `REAL_META[ref].safetySteps` / `REAL_META[KIT_REFS[0]].safetySteps` with the
  `NO_TREE_META` equivalents.

Update the two chrome pins:
- ~line 510: change `<aside class="fd-sheet"(?:\s|>)` to `<aside class="fd-sheet(?: fd-sheet--safety)?"(?:\s|>)`.
- ~line 547: change `<aside class="fd-sheet" role="dialog" aria-modal="true" aria-label="Safety kit">`
  to `<aside class="fd-sheet fd-sheet--safety" role="dialog" aria-modal="true" aria-label="Safety kit">`.

In the "only classes that exist in frontdoor.css are emitted" test, after the existing loop add
a tree pass:

```js
  for (const ref of TREE_REFS) {
    const states = [{}, { escalate: 'now' }, { escalate: 'soon' }]
      .concat(actionPaths(TREE_META[ref].safetyTree).map((treePath) => ({ treePath })));
    for (const st of states) {
      const html = F.fdSheet(TREE_PENDING_INDEX, TREE_PENDING_META, { sheet: ref, draftTrees: true, ...st });
      for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => seen.add(c));
    }
  }
```

and define `actionPaths` next to the tree fixtures. It returns one answer path to every action
node, derived from the data, so every action variant (`is-danger`, `see` links, trail, nav) gets
class-checked whatever ids the owner gives the nodes:

```js
const actionPaths = (tree) => {
  const byId = Object.fromEntries(tree.nodes.map((n) => [n.id, n]));
  const out = [];
  const walk = (id, path) => {
    const n = byId[id];
    if (!n.options) { out.push(path); return; }
    n.options.forEach((o, i) => walk(o.next, path.concat(`${n.id}.${i}`)));
  };
  walk(tree.start, []);
  return out;
};
```

Append the new tests:

```js
// ---- safety trees -------------------------------------------------------------------------------

test('a reviewed page with a valid tree renders the tree instead of the checklist', () => {
  assert.ok(TREE_REFS.length >= 1, 'the real source carries at least one safetyTree');
  for (const ref of TREE_REFS) {
    const html = F.fdSheet(TREE_INDEX, TREE_META, { sheet: ref, crisisHtml: '<div class="crisis-block">C</div>' });
    assert.match(html, /<div class="fd-tree">/, ref);
    assert.doesNotMatch(html, /class="fd-step"|fd-tree__draft/, ref);
    assert.match(html, /fd-doccallout/, ref);
    assert.match(html, /fd-sheet__attribution/, ref);
    assert.match(html, /class="crisis-block"/, ref);
  }
});

test('an unreviewed page keeps its checklist and never shows a tree in production', () => {
  for (const ref of TREE_REFS) {
    const html = F.fdSheet(TREE_PENDING_INDEX, TREE_PENDING_META, { sheet: ref });
    assert.doesNotMatch(html, /fd-tree/, ref);
    assert.ok(html.split('class="fd-step"').length - 1 >= 3, ref);
    assert.match(html, /fd-sheet__pending/, ref);
  }
});

test('a deploy preview shows the unreviewed tree under the DRAFT banner', () => {
  for (const ref of TREE_REFS) {
    const html = F.fdSheet(TREE_PENDING_INDEX, TREE_PENDING_META, { sheet: ref, draftTrees: true });
    assert.match(html, /fd-tree__draft/, ref);
    assert.match(html, /fd-sheet__pending/, ref);
  }
});

test('the draft banner never appears on a reviewed page', () => {
  for (const ref of TREE_REFS) {
    assert.doesNotMatch(F.fdSheet(TREE_INDEX, TREE_META, { sheet: ref, draftTrees: true }), /fd-tree__draft/, ref);
  }
});

test('a malformed tree falls back to the checklist', () => {
  const ref = TREE_REFS[0];
  const meta = { ...TREE_META, [ref]: { ...TREE_META[ref], safetyTree: { ...TREE_META[ref].safetyTree, start: 'nope' } } };
  const html = F.fdSheet(F.fdBuildIndex(REAL_MS3_CUR, meta, REAL_TOOLS, REAL_MAN), meta, { sheet: ref });
  assert.doesNotMatch(html, /fd-tree/);
  assert.ok(html.split('class="fd-step"').length - 1 >= 3);
});

test('missing steps still fail closed even when the tree is valid', () => {
  const ref = TREE_REFS[0];
  const meta = { ...TREE_META, [ref]: { ...TREE_META[ref], safetySteps: [] } };
  const html = F.fdSheet(F.fdBuildIndex(REAL_MS3_CUR, meta, REAL_TOOLS, REAL_MAN), meta,
    { sheet: ref, protocolFailureCopy: 'Unavailable.' });
  assert.match(html, /fd-sheet__failure" role="alert">Unavailable\./);
  assert.doesNotMatch(html, /fd-tree/);
});

test('only kit sheets are safety sheets and take the modifier', () => {
  assert.equal(F.fdSheetIsSafety(REAL_INDEX, 'kit'), true);
  for (const ref of KIT_REFS) assert.equal(F.fdSheetIsSafety(REAL_INDEX, ref), true, ref);
  for (const s of ['settings', 'item:mse.html', 'welcome.md', '', null]) {
    assert.equal(F.fdSheetIsSafety(REAL_INDEX, s), false, String(s));
  }
  assert.match(F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'kit' }), /class="fd-sheet fd-sheet--safety"/);
  assert.doesNotMatch(F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'settings' }), /fd-sheet--safety/);
  assert.doesNotMatch(F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'item:mse.html' }), /fd-sheet--safety/);
});

test('every real safetyTree passes the runtime check the sheet relies on', () => {
  for (const ref of TREE_REFS) assert.equal(F.fdTreeValid(REAL_META[ref].safetyTree), true, ref);
});
```

In `tests/spa-shell-a11y.test.mjs` line 115, change the pinned source regex to:

```js
    /class="fd-sheet'\+\(safety\?' fd-sheet--safety':''\)\+'" role="dialog" aria-modal="true" aria-label="'\+fdEsc\(title\)\+'"/);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/fd-sheet.test.mjs tests/spa-shell-a11y.test.mjs`
Expected: FAIL. `fdSheetIsSafety is not defined` (loader); the tree tests and the two chrome pins
fail.

- [ ] **Step 3: Implement**

In `fd_sheet.js`, after `fdSheetKitEntry`, add:

```js
/* True for the sheets the safety drawer owns: the kit list and any kit protocol. False for
   Settings and item previews. The shell pauses the page only under these, and only these take
   the high-contrast .fd-sheet--safety treatment. */
function fdSheetIsSafety(index, sheet){
  if(!sheet) return false;
  return sheet==='kit'||!!fdSheetKitEntry(index, sheet);
}

/* {ref: title} for the kit, so a tree's `see` link can name the protocol it opens. */
function fdSheetKitTitles(index){
  var kit=(index&&index.kit)||[], out={};
  for(var i=0;i<kit.length;i++) out[kit[i].item.ref]=kit[i].item.title;
  return out;
}
```

Replace `fdSheetProtocolBody`'s signature and its steps block (from the `function` line through
the `out+='</div>';` that closes the steps wrapper) with:

```js
function fdSheetProtocolBody(entry, topicMeta, stepsDone, crisisHtml, failureCopy, treeState){
  var item=entry.item;
  var protocol=fdSheetProtocolData(entry,topicMeta);
  if(protocol.kind==='missing')return fdSheetProtocolFailure(failureCopy,crisisHtml);
  /* A tree replaces the checklist only when its page is attested -- the attestation hash covers
     the whole topic_meta record, so an edited tree demotes its page and drops back to the
     checklist by itself. A deploy preview (draftTrees, build-injected only there) shows an
     unattested tree under a DRAFT banner so faculty can review it. Missing steps still fail
     closed above: the checklist is the tree's fallback and must exist. */
  var ts=treeState||{}, tree=((topicMeta||{})[item.ref]||{}).safetyTree;
  var showTree=typeof fdTreeValid==='function'&&fdTreeValid(tree)&&
    (protocol.kind==='reviewed'||ts.draft===true);
  var out='';
  if(showTree){
    out+=fdTreeView(tree,{path:ts.path,escalate:ts.escalate},
      {draft:protocol.kind!=='reviewed',kitTitles:ts.kitTitles});
  } else {
    var steps=protocol.steps;
    /* Wrapper carries only the 16px gap down to the callout (the prototype's own step container).
       The steps stay siblings of each other inside it, so the + rule above still applies. */
    out+='<div style="margin-bottom:16px">';
    for(var i=0;i<steps.length;i++){ out+=fdSheetStep(steps[i], i, stepsDone); }
    out+='</div>';
  }
```

Leave everything after that (Document callout, attribution, "Open the full page →", crisis HTML)
unchanged.

In `fdSheet`, change the protocol branch's call to:

```js
    body=fdSheetProtocolBody(
      entry, topicMeta, st.stepsDone, st.crisisHtml, st.protocolFailureCopy,
      {path:st.treePath, escalate:st.escalate, draft:st.draftTrees===true,
        kitTitles:fdSheetKitTitles(idx)}
    );
```

and change the return's `<aside …>` opening to:

```js
  var safety=fdSheetIsSafety(idx, sheet);
  return '<div class="fd-sheetbackdrop" data-fd-close-sheet></div>'+
    '<aside class="fd-sheet'+(safety?' fd-sheet--safety':'')+'" role="dialog" aria-modal="true" aria-label="'+fdEsc(title)+'">'+
```

- [ ] **Step 4: Run the sheet suites and the live-governance rehearsal**

```bash
node --test tests/fd-sheet.test.mjs tests/spa-shell-a11y.test.mjs tests/fd-settings.test.mjs tests/fd-data.test.mjs
node --test tests/live-governance-state.test.mjs
```
Expected: all PASS, including the rehearsal of `fd-sheet.test.mjs` under every scenario. If the
rehearsal flags a new live read, register it with a reason in that file's `REGISTRY`, following
the existing entries.

- [ ] **Step 5: Commit**

```bash
git add $SB/frontdoor/fd_sheet.js tests/fd-sheet.test.mjs tests/spa-shell-a11y.test.mjs
git commit -m "$(printf 'Safety sheet: attested trees replace the checklist; safety modifier class\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 9: `fd_wire.js` actions, state and focus

**Files:**
- Modify: `$SB/frontdoor/fd_wire.js`. Edit points:
  - `fdCloseSheet` (line 410)
  - the four sheet-opening patches (lines 616, 621, 629, 638)
  - new dispatch branches (next to `data-fd-step`, line 813)
  - `overlayKeys` (line 1634)
  - `focusDialog` (line 1443) and the `apply()` tail (line 2181)
  - the popstate merge (line 2459)
- Modify: `tests/fd-wire.test.mjs`

**Interfaces:**
- Consumes: the attributes Task 6 emits.
- Produces:
  - State keys `treePath: string[]` and `escalate: null|'now'|'soon'`.
  - Effect `{type:'focus-sheet-heading'}`, which focuses `.fd-tree__heading` in the open dialog.
- Deviation from spec §4.4, deliberate: the spec lists a third key, `treeAt`. It is not stored.
  The current node is derived by replaying `treePath` (`fdTreeWalk`), so the two can never
  disagree.

- [ ] **Step 1: Write the failing tests**

In `tests/fd-wire.test.mjs`, add after the step-toggle test (~line 566):

```js
test('safety tree actions patch only overlay state and ask for the new heading', () => {
  const s = { ...roleContext, sheet: 'agitation.md', treePath: ['danger.1'], escalate: null };
  const heading = { type: 'focus-sheet-heading' };
  assert.deepEqual(F.fdDispatch({ 'data-fd-tree-answer': 'vitals.2' }, { inSheet: true }, s),
    { patch: { treePath: ['danger.1', 'vitals.2'], escalate: null }, route: null, effect: heading });
  assert.deepEqual(s.treePath, ['danger.1'], 'the answer never mutates the array it extends');
  assert.deepEqual(F.fdDispatch({ 'data-fd-tree-back': '' }, { inSheet: true }, s),
    { patch: { treePath: [], escalate: null }, route: null, effect: heading });
  assert.deepEqual(F.fdDispatch({ 'data-fd-tree-restart': '' }, { inSheet: true }, s).patch,
    { treePath: [], escalate: null });
  assert.deepEqual(F.fdDispatch({ 'data-fd-escalate': 'soon' }, { inSheet: true }, s),
    { patch: { escalate: 'soon' }, route: null, effect: heading });
  assert.deepEqual(F.fdDispatch({ 'data-fd-escalate': 'anything' }, { inSheet: true }, s).patch,
    { escalate: 'now' }, 'an unknown urgency fails toward now');
  assert.deepEqual(F.fdDispatch({ 'data-fd-escalate-close': '' }, { inSheet: true }, { ...s, escalate: 'now' }),
    { patch: { escalate: null }, route: null, effect: heading });
  assert.deepEqual(F.fdDispatch({ 'data-fd-tree-answer': 'not a step' }, { inSheet: true }, s),
    { patch: {}, route: null, effect: null });
});

test('opening any sheet, closing it, and history all reset the tree', () => {
  const s = { ...roleContext, treePath: ['danger.0'], escalate: 'now' };
  for (const [attrs, ctx] of [[{ 'data-fd-safety': '' }, {}], [{ 'data-fd-safety': 'delirium.md' }, { inSheet: true }],
    [{ 'data-fd-open': 'scale.html', 'data-fd-sheet': '' }, {}]]) {
    const patch = F.fdDispatch(attrs, ctx, s).patch;
    assert.deepEqual(patch.treePath, [], JSON.stringify(attrs));
    assert.equal(patch.escalate, null, JSON.stringify(attrs));
  }
  const closed = F.fdDispatch({ 'data-fd-close-sheet': '' }, {}, { ...s, sheet: 'agitation.md', done: { 'agitation.md': true } });
  assert.deepEqual(closed.patch.treePath, []);
  assert.equal(closed.patch.escalate, null);
});
```

Update the exact-patch assertions that now carry two more keys: add `treePath: [], escalate:
null` to the expected `patch` objects in the preview test (~line 475), the protocol test (~line
481), the unread-close test (~line 780), and any other `deepEqual` the run reports for a
`data-fd-safety`, `data-fd-sheet`, `data-fd-try-now` or `data-fd-close-sheet` patch.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/fd-wire.test.mjs`
Expected: FAIL. The new dispatches return the no-op fall-through, and the resets are missing.
(The attributes are already handled and in the contract list, from Task 6.)

- [ ] **Step 3: Implement**

1. In `fdCloseSheet`'s patch, and in the patches at lines 616, 621, 629 and 638, add
   `treePath:[],escalate:null` next to `stepsDone:{}`.
2. In the popstate merge, after `merged.stepsDone={};` add:
   ```js
       merged.treePath=[];
       merged.escalate=null;
   ```
3. Add to `overlayKeys`: `treePath:true,escalate:true`.
4. Directly after the `data-fd-step` branch in `fdDispatch`, add:
   ```js
     /* Safety tree (2026-10-10 safety-drawer spec §4.4). Overlay-only state, reset by every sheet
        open and close. Each action asks for the new heading, so a screen reader announces the
        next question or the script, and a second press on Enter lands on that heading, not on
        whichever answer now occupies the pressed button's place. */
     if(fdOwn(a,'data-fd-tree-answer')){
       raw=String(a['data-fd-tree-answer']||'');
       if(!/^[a-z][a-z0-9-]{0,23}\.[0-3]$/.test(raw)) return {patch:{},route:null,effect:null};
       next=(s.treePath||[]).slice();
       next.push(raw);
       return {patch:{treePath:next,escalate:null},route:null,effect:{type:'focus-sheet-heading'}};
     }
     if(fdOwn(a,'data-fd-tree-back')){
       return {patch:{treePath:(s.treePath||[]).slice(0,-1),escalate:null},route:null,
         effect:{type:'focus-sheet-heading'}};
     }
     if(fdOwn(a,'data-fd-tree-restart')){
       return {patch:{treePath:[],escalate:null},route:null,effect:{type:'focus-sheet-heading'}};
     }
     if(fdOwn(a,'data-fd-escalate')){
       return {patch:{escalate:a['data-fd-escalate']==='soon'?'soon':'now'},route:null,
         effect:{type:'focus-sheet-heading'}};
     }
     if(fdOwn(a,'data-fd-escalate-close')){
       return {patch:{escalate:null},route:null,effect:{type:'focus-sheet-heading'}};
     }
   ```
5. After `function focusDialog(){…}`, add:
   ```js
     /* The tree's one focus target. refocusInvoker cannot serve a tree action: an answer's
        "equivalent control" is whichever button happens to share its attribute in the next node. */
     function focusSheetHeading(){
       var d=dialog();
       var h=d&&d.querySelector&&d.querySelector('.fd-tree__heading');
       if(!h||!h.focus) return false;
       try{h.focus();}catch(_){return false;}
       return true;
     }
   ```
6. In `apply()`, replace the final branch body
   ```js
       if(!refocusInvoker(invoker)&&invoker) focusDialog();
   ```
   with
   ```js
       var headed=!!(result.effect&&result.effect.type==='focus-sheet-heading')&&focusSheetHeading();
       if(!headed&&!refocusInvoker(invoker)&&invoker) focusDialog();
   ```

- [ ] **Step 4: Run the wiring suites**

```bash
node --test tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-settings.test.mjs tests/fd-state.test.mjs
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add $SB/frontdoor/fd_wire.js tests/fd-wire.test.mjs
git commit -m "$(printf 'Front door wiring: safety tree and escalation actions, heading focus\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 10: Shell — pause, draft flag, safety skip control

**Files:**
- Modify: `$SB/spa_index.html`. Edit points:
  - skip CSS (lines 132–133, 363)
  - `#fdApp` first child (line 642)
  - `FD_DRAFT_TREES` (after line 661)
  - pause block (above `function fdRenderOverlays`, line 2779)
  - `fdLiveState` (line 2566)
  - `fdRender` (line 2978) and `fdRenderTransient` (line 3025)
- Modify: `$SB/common.py` (after `apply_preview_headers`, line 1366), `$SB/test_common.py`,
  `$SB/build_deploy.py` (before `open(_spa_out,"w"…)`, line 651)
- Create: `tests/safety-pause.test.mjs`

**Interfaces:**
- Consumes:
  - `fdSheetIsSafety(index, sheet)` (Task 8)
  - `state.sheet`; `contentEl`, `FD_INDEX` (shell globals)
- Produces:
  - `common.DRAFT_TREES_NEEDLE`
  - `common.apply_draft_trees_flag(text, context=None) -> str`
  - shell `fdSyncSafetyPause(state)`
  - `state.draftTrees` via `fdLiveState`
  - `.skip-safety` control

- [ ] **Step 1: Write the failing tests**

Create `tests/safety-pause.test.mjs`:

```js
// The safety drawer's pause (2026-10-10 safety-drawer spec §4.5), extracted from the shell and
// run against a fake DOM, plus the shell contracts that hold it in place.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');
const BEGIN = '/* ---- safety pause (begin) ----';
const END = '/* ---- safety pause (end) ---- */';
const MOUNTS = ['fdChromeMount', 'fdCaptureMount', 'fdDockMount', 'content', 'governanceMount'];
const SPARED = ['routeStatus', 'careNavigatorStatus', 'fdOverlayMount', 'fdNudgeMount'];

function fakeEl() {
  return { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; } };
}
function fakeMedia(paused) {
  return { paused, calls: 0, pause() { this.paused = true; this.calls += 1; } };
}
function harness() {
  assert.equal(shell.split(BEGIN).length, 2, 'the pause block is marked exactly once');
  const src = shell.slice(shell.indexOf(BEGIN), shell.indexOf(END));
  const els = Object.fromEntries([...MOUNTS, ...SPARED].map((id) => [id, fakeEl()]));
  const posted = [];
  const pageMedia = [fakeMedia(false), fakeMedia(true)];
  const frameMedia = [fakeMedia(false)];
  const frame = { contentWindow: { postMessage: (m) => posted.push(m) }, contentDocument: { querySelectorAll: () => frameMedia } };
  const document = { getElementById: (id) => els[id] || null, querySelectorAll: () => pageMedia };
  const contentEl = { querySelector: (sel) => (sel === 'iframe' ? frame : null) };
  const isSafety = (index, sheet) => sheet === 'kit' || sheet === 'agitation.md';
  // eslint-disable-next-line no-new-func
  const api = new Function('document', 'contentEl', 'FD_INDEX', 'fdSheetIsSafety',
    `${src}\nreturn { fdSyncSafetyPause: fdSyncSafetyPause };`)(document, contentEl, { kit: [] }, isSafety);
  return { api, els, posted, pageMedia, frameMedia };
}

test('opening a safety sheet inerts exactly the five mounts', () => {
  const h = harness();
  h.api.fdSyncSafetyPause({ sheet: 'kit' });
  for (const id of MOUNTS) assert.equal(h.els[id].attrs.inert, '', id);
  for (const id of SPARED) assert.equal('inert' in h.els[id].attrs, false, id);
});

test('it pauses playing media in the page and the tool frame and posts cw-pause once', () => {
  const h = harness();
  h.api.fdSyncSafetyPause({ sheet: 'agitation.md' });
  h.api.fdSyncSafetyPause({ sheet: 'kit' });
  assert.deepEqual(h.pageMedia.map((m) => m.calls), [1, 0], 'only the playing element is paused');
  assert.equal(h.frameMedia[0].calls, 1);
  assert.deepEqual(h.posted, [{ type: 'cw-pause', reason: 'safety' }], 'kit -> protocol is not a second pause');
});

test('closing releases every mount and posts cw-resume, without resuming media', () => {
  const h = harness();
  h.api.fdSyncSafetyPause({ sheet: 'kit' });
  h.api.fdSyncSafetyPause({ sheet: null });
  for (const id of MOUNTS) assert.equal('inert' in h.els[id].attrs, false, id);
  assert.deepEqual(h.posted.map((m) => m.type), ['cw-pause', 'cw-resume']);
  assert.equal(h.pageMedia[0].paused, true, 'media stays paused for the learner to resume');
});

test('settings and item previews pause nothing', () => {
  const h = harness();
  for (const sheet of ['settings', 'item:mse.html']) h.api.fdSyncSafetyPause({ sheet });
  for (const id of MOUNTS) assert.equal('inert' in h.els[id].attrs, false, id);
  assert.deepEqual(h.posted, []);
});

test('the pause syncs before the base view is rebuilt in both render paths', () => {
  for (const name of ['function fdRender(state,detail){', 'function fdRenderTransient(state,detail){']) {
    const body = shell.slice(shell.indexOf(name));
    const sync = body.indexOf('fdSyncSafetyPause(state);');
    const rebuild = body.indexOf('contentEl.innerHTML=');
    assert.ok(sync > 0 && sync < rebuild, `${name} must release inert before a resource mounts`);
  }
});

test('the safety skip control is the first focusable element inside #fdApp', () => {
  assert.match(shell, /<div id="fdApp"[^>]*>\s*<button type="button" class="skip-safety" data-fd-safety>Safety protocols<\/button>/);
  assert.equal(shell.split('class="skip-link"').length, 2, 'the content skip link stays the only .skip-link');
});

test('the draft-tree flag is declared once and forwarded typeof-guarded', () => {
  assert.equal(shell.split('var FD_DRAFT_TREES=false;').length, 2);
  assert.match(shell, /if\(typeof FD_DRAFT_TREES==='boolean'\)out\.draftTrees=FD_DRAFT_TREES;/);
});
```

In `$SB/test_common.py`, add a test class (alongside the other `unittest.TestCase` classes):

```python
class DraftTreesFlagTest(unittest.TestCase):
    """Safety-drawer draft trees render only on a deploy preview (2026-10-10 spec §4.7)."""
    SHELL = "a\nvar FD_DRAFT_TREES=false;\nb"

    def test_a_deploy_preview_turns_the_flag_on(self):
        self.assertIn("var FD_DRAFT_TREES=true;",
                      common.apply_draft_trees_flag(self.SHELL, "deploy-preview"))

    def test_production_and_branch_deploys_stay_byte_identical(self):
        for context in ("production", "branch-deploy", "dev", ""):
            self.assertEqual(common.apply_draft_trees_flag(self.SHELL, context), self.SHELL, context)

    def test_a_missing_or_duplicated_needle_fails_the_build(self):
        for text in ("no needle here", self.SHELL + self.SHELL):
            with self.assertRaises(ValueError):
                common.apply_draft_trees_flag(text, "production")

    def test_the_real_shell_carries_the_needle_exactly_once(self):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spa_index.html")
        with open(path, encoding="utf-8") as fh:
            self.assertEqual(fh.read().count(common.DRAFT_TREES_NEEDLE), 1)
```

- [ ] **Step 2: Run to verify they fail**

```bash
node --test tests/safety-pause.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py DraftTreesFlagTest
```
Expected: FAIL. The pause block marker is missing, and `common` has no attribute
`apply_draft_trees_flag`.

- [ ] **Step 3: Implement the build flag**

In `$SB/common.py`, after the `apply_preview_headers` function, add:

```python
DRAFT_TREES_NEEDLE = "var FD_DRAFT_TREES=false;"


def apply_draft_trees_flag(text, context=None):
    """Show unattested safety trees, under a DRAFT banner, ONLY on a Netlify deploy preview.

    2026-10-10 safety-drawer spec §4.7: an unattested decision tree must never reach a learner,
    and a preview is where faculty review one before attesting it. Production and branch deploys
    keep the literal `false`, byte-identical. A missing or duplicated needle raises, so a renamed
    shell variable fails the build instead of silently dropping the preview.
    """
    if context is None:
        context = os.environ.get("CONTEXT", "")
    if text.count(DRAFT_TREES_NEEDLE) != 1:
        raise ValueError("FD_DRAFT_TREES needle missing or duplicated in spa_index.html")
    if context != PREVIEW_CONTEXT:
        return text
    return text.replace(DRAFT_TREES_NEEDLE, "var FD_DRAFT_TREES=true;")
```

In `$SB/build_deploy.py`, directly before `open(_spa_out,"w",encoding="utf-8").write(_spa_t)`, add:

```python
# Safety-drawer draft trees: previews only (common.apply_draft_trees_flag). The resident build
# copies this index.html, so both sites inherit the same value from the same CONTEXT.
try:
    _spa_t=common.apply_draft_trees_flag(_spa_t)
except ValueError as _draft_err:
    print("BUILD ABORTED —",_draft_err)
    raise SystemExit(1)
```

- [ ] **Step 4: Implement the shell pieces**

1. **Skip control CSS** (lines 132–133): change `.skip-link{` to `.skip-link,.skip-safety{` and
   `.skip-link:focus{top:12px}` to `.skip-link:focus,.skip-safety:focus{top:12px}`, then add a new
   line `  .skip-safety{font:inherit;cursor:pointer}`. In the reduced-motion rule at line 363,
   change `{.skip-link,` to `{.skip-link,.skip-safety,`.
2. **Skip control markup**: make this the first child of `<div id="fdApp" …>` (line 642):
   ```html
     <button type="button" class="skip-safety" data-fd-safety>Safety protocols</button>
   ```
3. **Flag**: after the `var FD_PROTOCOL_FAILURE_COPY=…;` line (661), add
   ```js
     var FD_DRAFT_TREES=false;
   ```
4. **Forward it**: in `fdLiveState`, after the `protocolFailureCopy` line, add
   ```js
       if(typeof FD_DRAFT_TREES==='boolean')out.draftTrees=FD_DRAFT_TREES;
   ```
5. **Pause block**: add directly above `  function fdRenderOverlays(state){`:
   ```js
     /* ---- safety pause (begin) ----
        2026-10-10 safety-drawer spec §4.5. While a SAFETY sheet (the kit or a kit protocol) is
        open, the page under it is frozen: the mounts below take `inert` (no focus, no pointer,
        out of the accessibility tree, nothing unloaded, so a tool frame keeps every input),
        playing media pauses and stays paused, and the tool frame is told {type:'cw-pause'} /
        {type:'cw-resume'} the same way it is told the theme. Settings and item previews are not
        safety sheets and pause nothing. #fdApp's own startup-gate `inert` is never touched; the
        live regions, #fdOverlayMount and #fdNudgeMount are never inerted. fdSyncSafetyPause runs
        FIRST in fdRender and fdRenderTransient so the release lands before a resource mounts: an
        inert #content silently refuses the pending-high notice its focus. */
     var FD_SAFETY_INERT_IDS=['fdChromeMount','fdCaptureMount','fdDockMount','content','governanceMount'];
     var fdSafetyPaused=false;
     function fdPauseMedia(doc){
       var media=(doc&&doc.querySelectorAll)?doc.querySelectorAll('audio,video'):[];
       for(var i=0;i<media.length;i++){
         if(media[i]&&media[i].paused===false) try{media[i].pause();}catch(_){}
       }
     }
     function fdSafetyPause(on){
       for(var i=0;i<FD_SAFETY_INERT_IDS.length;i++){
         var el=document.getElementById(FD_SAFETY_INERT_IDS[i]);
         if(!el)continue;
         if(on)el.setAttribute('inert','');else el.removeAttribute('inert');
       }
       var frame=(contentEl&&contentEl.querySelector)?contentEl.querySelector('iframe'):null;
       if(on){
         fdPauseMedia(document);
         try{if(frame&&frame.contentDocument)fdPauseMedia(frame.contentDocument);}catch(_){}
       }
       if(frame&&frame.contentWindow)
         try{frame.contentWindow.postMessage(on?{type:'cw-pause',reason:'safety'}:{type:'cw-resume'},'*');}catch(_){}
     }
     function fdSyncSafetyPause(state){
       var want=!!(state&&state.sheet&&fdSheetIsSafety(FD_INDEX,state.sheet));
       if(want===fdSafetyPaused)return;
       fdSafetyPaused=want;
       fdSafetyPause(want);
     }
     /* ---- safety pause (end) ---- */
   ```
6. **Call it first**:
   - In `fdRender`, directly after `var app=state.screen==='app',hydrate=detail&&detail.kind==='hydrate';`, add `    fdSyncSafetyPause(state);`.
   - In `fdRenderTransient`, directly after `var d=detail||{}, surfaces=d.surfaces||{};`, add `    fdSyncSafetyPause(state);`.

- [ ] **Step 5: Run the shell suites**

```bash
node --test tests/safety-pause.test.mjs tests/fd-sheet.test.mjs tests/fd-shell-boot.test.mjs tests/ward-capture-store.test.mjs tests/spa-shell-a11y.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py
```
Expected: all PASS.

- [ ] **Step 6: Build both sites and check the flag stayed off**

```bash
bash $SB/build_and_check.sh ms3 > $TMPDIR/b-ms3.log 2>&1; echo "ms3 $?"
bash $SB/build_and_check.sh res > $TMPDIR/b-res.log 2>&1; echo "res $?"
grep -c 'var FD_DRAFT_TREES=false;' _build/ms3/index.html _build/res/index.html
```
Expected: `ms3 0`, `res 0`, and each index carries the `false` literal exactly once (local builds
have no `CONTEXT`).

- [ ] **Step 7: Commit**

```bash
git add $SB/spa_index.html $SB/common.py $SB/test_common.py $SB/build_deploy.py tests/safety-pause.test.mjs
git commit -m "$(printf 'Shell: pause the page under the safety drawer; preview-only draft trees; safety skip control\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 11: Smoke tests

**Files:**
- Modify: `tests/smoke/front-door.spec.js` (append a block after the "malformed built protocol"
  test, ~line 1335)

**Interfaces:**
- Consumes: `seedApp`, `expectHealthy`, `routeFetchWithRetry` (already in the file); built
  `_build/ms3` and `_build/res` from Task 10.

- [ ] **Step 1: Add the tests**

```js
// ---- Safety drawer decision trees (2026-10-10 spec) ----------------------------------------------
// Review state is a FIXTURE, never the live ledger: the index is patched after it is built so the
// kit items read attested (or not) and, for the preview case, the draft flag is on. Trees are
// walked by STRUCTURE (always the last answer) so an owner edit to the wording or ids keeps
// these green.
const SAFETY_NEEDLE = [
  'var FD_CANONICAL_INDEX=fdBuildIndex(FD_CURRICULUM,FD_TOPIC_META,FD_TOOL_REGISTRY,FD_SITE_MANIFEST);',
  '  var FD_INDEX=FD_CANONICAL_INDEX;',
].join('\n');
const SAFETY_MOUNTS = ['fdChromeMount', 'fdCaptureMount', 'fdDockMount', 'content', 'governanceMount'];
const TREE_REFS = ['pg_suicide.md', 'agitation.md', 'delirium.md'];

async function serveSafetyTrees(page, { attested = true, draft = false } = {}) {
  await page.route((url) => url.pathname === '/', async (route) => {
    const response = await routeFetchWithRetry(route);
    const original = await response.text();
    expect(original.split(SAFETY_NEEDLE)).toHaveLength(2);
    const patch = `\n  FD_INDEX.kit.forEach(function(k){k.item.attested=${attested};});`
      + (draft ? '\n  FD_DRAFT_TREES=true;' : '');
    await route.fulfill({ response, body: original.replace(SAFETY_NEEDLE, SAFETY_NEEDLE + patch) });
  });
}
async function openProtocol(page, ref) {
  await page.locator('.fd-safetybtn[data-fd-safety]').click();
  await page.locator(`.fd-kitrow[data-fd-safety="${ref}"]`).click();
}
async function walkToAction(page) {
  const heading = page.locator('.fd-sheet .fd-tree__heading');
  for (let step = 0; step < 6 && (await page.locator('.fd-tree__option').count()) > 0; step += 1) {
    await page.locator('.fd-tree__option').last().focus();
    await page.keyboard.press('Enter');
    await expect(heading).toBeFocused();
  }
  await expect(page.locator('.fd-tree__verdict')).toBeVisible();
}

test('each safety tree walks by keyboard to its script and back', async ({ page }, testInfo) => {
  await serveSafetyTrees(page);
  await seedApp(page, testInfo);
  await page.goto('/');
  for (const ref of TREE_REFS) {
    await page.locator('.fd-safetybtn[data-fd-safety]').click();
    await page.locator(`.fd-kitrow[data-fd-safety="${ref}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.fd-sheet.fd-sheet--safety .fd-tree')).toBeVisible();
    await walkToAction(page);
    await page.locator('.fd-tree__escalate').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fdScriptHeading')).toBeFocused();
    await expect(page.locator('.fd-script__parts dt')).toHaveCount(6);
    await expect(page.locator('.fd-script__blank').first()).toBeVisible();
    await page.locator('[data-fd-escalate-close]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.fd-sheet .fd-tree__heading')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.fd-sheet')).toHaveCount(0);
  }
  await expectHealthy(page);
});

test('escalation is on the first screen, and Escape from a script closes the drawer', async ({ page }, testInfo) => {
  await serveSafetyTrees(page);
  await seedApp(page, testInfo);
  await page.goto('/');
  await openProtocol(page, 'pg_suicide.md');
  const escalate = page.locator('.fd-tree__escalate');
  await expect(escalate).toHaveAttribute('data-fd-escalate', 'now');
  await escalate.click();
  await expect(page.locator('#fdScriptHeading')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.fd-sheet')).toHaveCount(0);
  await expect(page.locator('.fd-safetybtn[data-fd-safety]')).toBeFocused();
  await expectHealthy(page);
});

test('a double press advances one step', async ({ page }, testInfo) => {
  await serveSafetyTrees(page);
  await seedApp(page, testInfo);
  await page.goto('/');
  await openProtocol(page, 'agitation.md');
  await page.locator('.fd-tree__option').first().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.fd-tree__trail li')).toHaveCount(1);
  await expectHealthy(page);
});

test('production hides an unattested tree behind its checklist', async ({ page }, testInfo) => {
  await serveSafetyTrees(page, { attested: false });
  await seedApp(page, testInfo);
  await page.goto('/');
  await openProtocol(page, 'agitation.md');
  await expect(page.locator('.fd-tree')).toHaveCount(0);
  expect(await page.locator('.fd-step').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.fd-sheet__pending')).toBeVisible();
  await expectHealthy(page);
});

test('a deploy preview shows an unattested tree under the DRAFT banner', async ({ page }, testInfo) => {
  await serveSafetyTrees(page, { attested: false, draft: true });
  await seedApp(page, testInfo);
  await page.goto('/');
  await openProtocol(page, 'agitation.md');
  await expect(page.locator('.fd-tree__draft[role="note"]')).toBeVisible();
  await expect(page.locator('.fd-tree__heading')).toBeVisible();
  await expectHealthy(page);
});

test('tool inputs survive the drawer; the page is inert and paused while it is open', async ({ page }, testInfo) => {
  await serveSafetyTrees(page);
  await seedApp(page, testInfo);
  await page.goto('/?tool=feedback.html');
  const frameEl = page.locator('#content iframe.toolframe');
  const tool = frameEl.contentFrame();
  await tool.locator('#f_msg').fill('Typed before the drawer opened');
  const before = await frameEl.elementHandle();
  await tool.locator('body').evaluate(() => {
    window.__cw = [];
    window.addEventListener('message', (e) => {
      if (e.data && /^cw-/.test(e.data.type || '')) window.__cw.push(e.data.type);
    });
  });
  await page.evaluate(() => {
    const a = document.createElement('audio');
    let paused = false;
    Object.defineProperty(a, 'paused', { get: () => paused });
    a.pause = () => { paused = true; };
    a.id = 'fdTestAudio';
    document.getElementById('content').appendChild(a);
  });
  await page.locator('.fd-safetybtn[data-fd-safety]').click();
  for (const id of SAFETY_MOUNTS) expect(await page.locator(`#${id}`).getAttribute('inert'), id).toBe('');
  expect(await page.locator('#fdOverlayMount').getAttribute('inert')).toBeNull();
  expect(await page.evaluate(() => document.getElementById('fdTestAudio').paused)).toBe(true);
  await page.locator('.fd-kitrow[data-fd-safety="agitation.md"]').click();
  await page.locator('.fd-tree__option').first().click();
  await page.keyboard.press('Escape');
  for (const id of SAFETY_MOUNTS) expect(await page.locator(`#${id}`).getAttribute('inert'), id).toBeNull();
  await expect(page.locator('.fd-safetybtn[data-fd-safety]')).toBeFocused();
  expect(await before.evaluate((el) => el.isConnected)).toBe(true);
  expect(await frameEl.evaluate((el, b) => el === b, before)).toBe(true);
  await expect(tool.locator('#f_msg')).toHaveValue('Typed before the drawer opened');
  await expect.poll(() => tool.locator('body').evaluate(() => window.__cw)).toEqual(['cw-pause', 'cw-resume']);
  await expectHealthy(page);
});

test('Open the full page from a tree releases the page before it mounts', async ({ page }, testInfo) => {
  await serveSafetyTrees(page);
  await seedApp(page, testInfo);
  await page.goto('/');
  await openProtocol(page, 'delirium.md');
  await page.locator('.fd-sheet [data-fd-open="delirium.md"]').click();
  await expect(page.locator('.fd-sheet')).toHaveCount(0);
  for (const id of SAFETY_MOUNTS) expect(await page.locator(`#${id}`).getAttribute('inert'), id).toBeNull();
  await expect(page.locator('.fd-article')).toBeVisible();
  await expectHealthy(page);
});

test('the safety skip control is the second Tab stop and opens the kit', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-safety')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fd-sheet[role="dialog"]')).toHaveAttribute('aria-label', 'Safety kit');
  await expectHealthy(page);
});

test('the drawer fits a 320px phone with 48px controls', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serveSafetyTrees(page);
  await seedApp(page, testInfo);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    for (const ref of TREE_REFS) {
      await openProtocol(page, ref);
      for (const sel of ['.fd-tree__option', '.fd-tree__escalate']) {
        for (const box of await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
          expect(box, `${ref} ${sel} at ${width}px`).toBeGreaterThanOrEqual(47.5);
        }
      }
      await page.locator('.fd-tree__escalate').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${ref} page at ${width}px`).toBe(true);
      expect(await page.locator('.fd-sheet__body').evaluate((el) => el.scrollWidth <= el.clientWidth), `${ref} sheet at ${width}px`).toBe(true);
      await page.keyboard.press('Escape');
    }
  }
  await expectHealthy(page);
});
```

- [ ] **Step 2: Run the suite locally**

```bash
cd tests/smoke && npm ci && npx playwright install chromium && cd ../..
bash tests/smoke/start-local-servers.sh &
cd tests/smoke && npx playwright test --project=nav-ms3 --project=nav-res -g "safety|Safety|tool inputs survive|320px|double press|Open the full page" ; cd ../..
```
Expected: every new test PASSES on both projects, and the existing kit tests ("malformed built
protocol fails closed…", the kit-sheet focus test at ~line 1247) still PASS. If a skip-link or
focus-order test elsewhere fails, read it first. The `.skip-link` element and the first Tab stop
are unchanged by design.

- [ ] **Step 3: Run the live-governance registry**

Run: `node --test tests/live-governance-state.test.mjs`
Expected: PASS. If it reports a new finding in `front-door.spec.js`, add a registration line
stating that the review state is a served-index fixture.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/front-door.spec.js tests/live-governance-state.test.mjs
git commit -m "$(printf 'Smoke: safety trees by keyboard, input survival, pause, preview draft, phone widths\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

### Task 12: Verify, push and hand PR 2 to the owner

- [ ] **Step 1: Run every local gate**

```bash
python3 bin/check_governance_separation.py
python3 bin/signoff_impact.py
node --test tests/*.test.mjs > $TMPDIR/node.log 2>&1; echo "node $?"
```
Expected:
- The separation check exits 0. PR 2 has no governance paths. If PR 1 hasn't merged yet, run
  it with `CLERKSHIP_PR_BASE=origin/claude/safety-button-slideout-drawer-7b5040`.
- `signoff_impact` names `agitation.md`, `pg_suicide.md` and `delirium.md`.
- `node 0`.

- [ ] **Step 2: Push**

Push in the background. The pre-push hook runs the full `verify.sh`.

```bash
L=$TMPDIR/pr2-push2.log; CLERKSHIP_PR_BASE=origin/claude/safety-button-slideout-drawer-7b5040 git push > "$L" 2>&1; rc=$?; echo "push exit $rc" >> "$L"; tail -5 "$L"
```
Expected: `ALL CHECKS PASSED` and `push exit 0`. If the CI `visual` project reports diffs on
a sheet screenshot, regenerate the baselines with the "Refresh visual baselines" workflow
(Ubuntu), never locally. Once PR 1 has merged:
1. `git fetch origin && git merge origin/main`, then push without `CLERKSHIP_PR_BASE`.
2. `gh pr edit --base main`.
3. Push one more commit so CI re-runs; retargeting alone does not trigger it.

- [ ] **Step 3: Update the PR body and mark it ready**

The body says:
- what ships (trees, scripts, pause, skip control, preview-only drafts);
- the `Sign-offs (advisory)` result, naming the three pages;
- that the deploy previews `https://deploy-preview-{PR}--une-ms3-psychiatry.netlify.app` and
  `https://deploy-preview-{PR}--mmc-psychiatry-residents-sanford.netlify.app` show the trees
  under the DRAFT banner for review;
- the merge-timing decision **D5**.

Then run `gh pr ready <PR>`, and call `mcp__ccd_pr__get_status` to read CI.

- [ ] **Step 4: Owner handoff (D5 and re-attestation)**

Tell the owner, in one message:
1. Review the three trees on either deploy preview (Safety → a protocol → walk it → Escalate).
2. **D5:** merge right after a release-train publish (09:05 / 15:05 / 21:05 UTC). Until
   re-attested, learners see today's checklists marked "Not yet faculty-reviewed", never the
   trees.
3. Re-attest `agitation.md`, `pg_suicide.md` and `delirium.md` in the faculty console after the
   merge. The next release-train run publishes the trees.
4. After that publish, run the `deploy-verifier` agent against both sites.
5. Follow-up PR 3 (spec §8): the Interview Room listens for `cw-pause` and mutes its
   microphone. It edits an attested tool, so it needs its own re-attestation.
