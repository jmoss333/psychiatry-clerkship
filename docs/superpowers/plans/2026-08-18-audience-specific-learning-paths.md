# Audience-Specific Learning Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MS3 build deliver its existing six-week path and the resident build deliver a four-week competency path, with every week-aware learner surface deriving from the selected build-projected path.

**Architecture:** `curriculum.json` owns two canonical site-keyed paths. The Python build selects one path only after the site's final annotated navigation exists, validates every path ref against that site, and emits a normalized `{path, weeks}` browser payload. Shared ES5 Front Door code consumes that projection for setup, Today, Path, routing, dates, progress, and placement-plan migration without inspecting branding or audience roles.

**Tech Stack:** Python 3, JSON Schema Draft 7, `unittest`, browser-compatible ES5 JavaScript, Node `node:test`, Playwright/Chromium, and the existing two-target static-site build/QA pipeline.

**Spec:** `docs/superpowers/specs/2026-08-18-audience-specific-learning-paths-design.md`

## Global Constraints

- Build target is authoritative: `ms3` selects stable ID `ms3-six-week`; `resident` selects stable ID `resident-four-week`. No learner-facing audience toggle.
- MS3 stays exactly six weeks with its current titles, themes, resource order, refs, and kinds.
- Resident is exactly four weeks and uses the resource sequence in the approved spec; do not compress or rewrite MS3 content.
- `focusCategories` may contain only `anxiety`, `childdev`, `ethics`, `mood`, `neurocog`, `otherdx`, `personality`, `pharm`, `psychosis`, `relational`, `safety`, or `substance`.
- Resource facts continue to come from final navigation, `topic_meta.json`, `tool_registry.json`, and governance projection. Do not duplicate titles, minutes, summaries, evidence, or attestation in path items.
- Keep all shared learner-facing JavaScript audience-neutral. The existing token scan still bans MS3, clerkship, student, shelf, resident, UNE, MMC, and Sanford in shared copy.
- Keep `cw_progress_v1`, `cw_pretest_v1`, `cw_qb_v1`, and the `cw_plan_v1` key. Only the `cw_plan_v1` value gains path metadata.
- Do not clear progress, practice history, placement answers, or unrelated local storage during recovery.
- Do not add clinical prose, medication doses, local-policy claims, legal guidance, evidence claims, question-bank content, faculty attestations, or governance changes.
- Do not restore `01_Six_Week_Curriculum/learning-path.html`; it remains absent from source and both builds. Keep its historical review receipt untouched.
- Keep `one-patient-six-weeks.html` unchanged: core MS3 Week 6 item, optional resident Library item, never a resident core-path item.
- Keep the hidden inherited resident `week1.md` through `week6.md` entries; removing them belongs to the separate audience-data-model migration.
- Do not combine this work with `docs/superpowers/plans/2026-07-27-audience-as-a-data-model.md`.
- Preserve ES5 syntax in `frontdoor/*.js` and the shared inline shell: `var`/`function`, no arrow functions, `let`, `const`, classes, or template literals.
- Preserve the one sanctioned local-date parser in `phase_policy.js`; do not add a `T00:00:00` parse idiom anywhere else, including comments.
- Do not edit `CLAUDE.md` or `AGENTS.md`; contributor commands and repository architecture do not change.
- Do not generate visual baselines on macOS. If screenshot expectations change, use the repository's Ubuntu/Chromium refresh workflow after publication is authorized.
- No deployment, merge, faculty-console write, or attestation is part of this plan.

---

## File structure

### Canonical data and build boundary

- Modify `curriculum.json` — replace shared `weeks` with exact site-keyed `learningPaths`; add canonical placement focus categories.
- Modify `curriculum.schema.json` — require the two exact paths, IDs, counts, focus categories, and item shape.
- Modify `13_Faculty_Resources/_automation/test_validate_registry_schemas.py` — pin schema acceptance/rejection for the new contract.
- Modify `13_Faculty_Resources/_automation/validate_curriculum.py` — validate each path against its own site's shipped set.
- Modify `13_Faculty_Resources/_automation/test_validate_curriculum.py` — convert fixtures and add site-isolation/count/number/category failures.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py` — select one site path and build a union title/governance index for path plus Library refs.
- Modify `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py` — pin exact site projection and fail-closed behavior.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js` — preserve path metadata/focus categories and expose duration/next-week helpers.
- Modify `tests/fd-data.test.mjs` — test the browser index against four- and six-week projections.

### Week-aware runtime

- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js` — path-aware rotation dates, week selection, and final-week countdown.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js` — actual-next-week preview and final-week review behavior.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js` — dynamic heading and invalid-view fallback.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js` — reject week actions outside the injected path.
- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html` — remove shell-level six-week bounds and normalize live state from `FD_INDEX`.
- Modify `tests/fd-state.test.mjs`, `tests/fd-today.test.mjs`, `tests/fd-path.test.mjs`, `tests/fd-wire.test.mjs`, and `tests/fd-shell-boot.test.mjs` — pin the dynamic contracts.
- Modify `tests/smoke/front-door.spec.js` — exercise four- versus six-week setup and Path behavior on both built sites.

### Placement-plan generation and migration

- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html` — remove `WEEK_MAP`, generate from `FD_INDEX`, migrate stored plans, and render dynamic copy/actions.
- Modify `tests/mastery-weakflag.test.mjs` — keep the weak-area regression while sourcing week categories from a projected index.
- Create `tests/fd-plan-migration.test.mjs` — pure contract tests for plan shape, validation, regeneration, and storage safety.
- Modify `tests/smoke/frontdoor-runtime.spec.js` — verify dynamic headings, migration, fallback, and Path actions on both audiences.

No new production file is needed. Keep the existing large shell rather than introducing a new snippet marker and widening the build injection surface for one focused feature.

---

### Task 1: Establish the canonical two-path data and build projection

**Files:**

- Modify: `curriculum.json:1-86`
- Modify: `curriculum.schema.json:1-129`
- Modify: `13_Faculty_Resources/_automation/test_validate_registry_schemas.py:346-394`
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py:1-255,421-428`
- Modify: `13_Faculty_Resources/_automation/test_validate_curriculum.py:1-611`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py:63-148`
- Modify: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py:17-268`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js:44-115`
- Modify: `tests/fd-data.test.mjs:17-205`

**Interfaces:**

- Consumes: final site `catalog` entries shaped as `{f, t, k, governance}` and the existing `siteLibrary`, `libraryColumns`, `libraryExclude`, `safetyKit`, `roles`, and `synonyms` contracts.
- Produces: source `learningPaths.{ms3,resident}.{id,weeks}`; projected `FD_CURRICULUM.path = {id, weekCount}` plus top-level projected `weeks`; browser helpers `fdPathWeekCount(index)` and `fdNextWeek(index, n)`.
- Invariant: source `learningPaths` never reaches the browser; a built page receives only its selected normalized path.

- [ ] **Step 1: Write schema tests for the exact site-path contract**

Add a conversion helper and focused cases to `test_validate_registry_schemas.py` so the tests can run red against the legacy source and continue working after the source changes:

```python
def audience_path_document(document: dict) -> dict:
    if "learningPaths" in document:
        return document
    weeks = document.pop("weeks")
    for week in weeks:
        week["focusCategories"] = ["safety"]
    document["learningPaths"] = {
        "ms3": {"id": "ms3-six-week", "weeks": weeks},
        "resident": {
            "id": "resident-four-week",
            "weeks": [
                {"n": n, "title": f"R{n}", "theme": f"RT{n}",
                 "focusCategories": ["safety"], "items": []}
                for n in range(1, 5)
            ],
        },
    }
    return document

def test_curriculum_accepts_exact_audience_paths(self) -> None:
    with self.make_registry_copy() as temporary:
        root = Path(temporary)
        document = audience_path_document(json.loads(
            (root / "curriculum.json").read_text(encoding="utf-8")))
        (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")
        result = run_validator(root)
    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

def test_curriculum_rejects_wrong_path_count_id_and_focus_category(self) -> None:
    mutations = {
        "resident-count": lambda d: d["learningPaths"]["resident"]["weeks"].append(
            {"n": 5, "title": "R5", "theme": "RT5",
             "focusCategories": ["safety"], "items": []}),
        "ms3-id": lambda d: d["learningPaths"]["ms3"].update({"id": "wrong"}),
        "focus": lambda d: d["learningPaths"]["resident"]["weeks"][0].update(
            {"focusCategories": ["not-a-blueprint"]}),
    }
    for label, mutate in mutations.items():
        with self.subTest(label=label), self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = audience_path_document(json.loads(
                (root / "curriculum.json").read_text(encoding="utf-8")))
            mutate(document)
            (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")
            result = run_validator(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("Traceback", result.stderr)
```

- [ ] **Step 2: Convert procedural-validator fixtures and add site-isolation failures**

Change `_curriculum(items)` in `test_validate_curriculum.py` to generate both paths, placing `items` in MS3 Week 1 by default:

```python
def _weeks(count, first_items=None):
    return [
        {"n": n, "title": "T%d" % n, "theme": "Th%d" % n,
         "focusCategories": ["safety"],
         "items": list(first_items or []) if n == 1 else []}
        for n in range(1, count + 1)
    ]

def _curriculum(items):
    return {
        "learningPaths": {
            "ms3": {"id": "ms3-six-week", "weeks": _weeks(6, items)},
            "resident": {"id": "resident-four-week", "weeks": _weeks(4)},
        },
    }
```

This snippet replaces only the current `weeks` member; retain the helper's existing `libraryColumns`, `libraryExclude`, `safetyKit`, `roles`, `synonyms`, and `siteLibrary` members in the returned object.

Add these exact failure cases:

```python
def test_rejects_resident_only_ref_on_ms3_path(self):
    with tempfile.TemporaryDirectory() as tmp:
        cur = _curriculum([])
        cur["learningPaths"]["ms3"]["weeks"][0]["items"] = [
            {"ref": "rp-canon-quiz.html", "kind": "tool"}]
        c, m = _write(tmp, cur)
        result = _run(c, m)
    self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
    self.assertIn("ms3", result.stdout)
    self.assertIn("rp-canon-quiz.html", result.stdout)

def test_accepts_resident_only_ref_on_resident_path(self):
    with tempfile.TemporaryDirectory() as tmp:
        cur = _curriculum([])
        cur["learningPaths"]["resident"]["weeks"][0]["items"] = [
            {"ref": "rp-canon-quiz.html", "kind": "tool"}]
        c, m = _write(tmp, cur)
        result = _run(c, m)
    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

def test_rejects_ms3_only_ref_on_resident_path(self):
    with tempfile.TemporaryDirectory() as tmp:
        cur = _curriculum([])
        cur["learningPaths"]["resident"]["weeks"][0]["items"] = [
            {"ref": "orientation-video.html", "kind": "tool"}]
        c, m = _write(tmp, cur)
        result = _run(c, m)
    self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
    self.assertIn("resident", result.stdout)
    self.assertIn("orientation-video.html", result.stdout)
```

Convert existing missing/duplicate/non-integer week tests to mutate `learningPaths.ms3.weeks`. Add resident count, gap, duplicate ref, bad kind, and unknown category tests; every assertion must include the site and path/week label so diagnostics remain actionable.

- [ ] **Step 3: Write build-projection tests before changing the projector**

Change `_curriculum()` in `test_frontdoor_catalog.py` to include minimal paths and add assertions that force the new normalized shape:

```python
"learningPaths": {
    "ms3": {"id": "ms3-six-week", "weeks": [
        {"n": n, "title": "M%d" % n, "theme": "MT%d" % n,
         "focusCategories": ["safety"],
         "items": ([{"ref": self_ref, "kind": "read"}] if n == 1 else [])}
        for n, self_ref in [(1, "shared-01.md"), (2, "shared-02.md"),
                            (3, "shared-03.md"), (4, "shared-04.md"),
                            (5, "shared-05.md"), (6, "shared-06.md")]
    ]},
    "resident": {"id": "resident-four-week", "weeks": [
        {"n": 1, "title": "R1", "theme": "RT1",
         "focusCategories": ["safety"],
         "items": [{"ref": "rp-canon-quiz.html", "kind": "tool"}]},
        {"n": 2, "title": "R2", "theme": "RT2",
         "focusCategories": ["mood"], "items": []},
        {"n": 3, "title": "R3", "theme": "RT3",
         "focusCategories": ["ethics"], "items": []},
        {"n": 4, "title": "R4", "theme": "RT4",
         "focusCategories": ["relational"], "items": []}
    ]}
}
```

Pin these results:

```python
self.assertEqual(ms3["curriculum"]["path"],
                 {"id": "ms3-six-week", "weekCount": 6})
self.assertEqual(resident["curriculum"]["path"],
                 {"id": "resident-four-week", "weekCount": 4})
self.assertEqual(len(ms3["curriculum"]["weeks"]), 6)
self.assertEqual(len(resident["curriculum"]["weeks"]), 4)
self.assertNotIn("learningPaths", ms3["curriculum"])
self.assertNotIn("learningPaths", resident["curriculum"])
self.assertIn("rp-canon-quiz.html", {
    entry[1] for group in resident["manifest"].values() for entry in group})
```

Add negative tests for a missing site path, wrong stable ID, a path ref absent from final resident catalog, and a path `kind` that disagrees with final navigation. Keep the existing input non-mutation assertion.

- [ ] **Step 4: Write browser-index tests for path metadata and focus categories**

Update `FIX_CUR` in `tests/fd-data.test.mjs` to be projected browser data, not source data:

```js
const FIX_CUR = {
  path: { id: 'resident-four-week', weekCount: 4 },
  weeks: [
    { n: 1, title: 'W1', theme: 'T1', focusCategories: ['safety'],
      items: [{ ref: 'a.md', kind: 'read' }] },
    { n: 2, title: 'W2', theme: 'T2', focusCategories: ['mood'], items: [] },
    { n: 3, title: 'W3', theme: 'T3', focusCategories: ['ethics'], items: [] },
    { n: 4, title: 'W4', theme: 'T4', focusCategories: ['relational'], items: [] },
  ],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md', 'b.md'] }],
  libraryExclude: [], safetyKit: [{ ref: 'a.md', sub: 'Sub line' }], synonyms: {},
};
```

Export and assert the new helpers:

```js
assert.deepEqual(idx.path, { id: 'resident-four-week', weekCount: 4 });
assert.deepEqual(idx.weeks[0].focusCategories, ['safety']);
assert.equal(F.fdPathWeekCount(idx), 4);
assert.equal(F.fdNextWeek(idx, 3).n, 4);
assert.equal(F.fdNextWeek(idx, 4), null);
```

For the real source document, construct an MS3 projected fixture from `CUR.learningPaths.ms3` before calling `fdBuildIndex`; assert ID `ms3-six-week`, 6 weeks, and 40 items.

- [ ] **Step 5: Run the focused tests and confirm they fail for the old single-path model**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/fd-data.test.mjs
```

Expected: FAIL because `learningPaths`, projected `path`, `focusCategories`, and the new helpers do not exist. Failures must be contract failures, not syntax errors or unexpected tracebacks.

- [ ] **Step 6: Replace the schema's shared `weeks` property with exact path definitions**

Change the root `required` array from `weeks` to `learningPaths`. Add these definitions and reuse the existing item shape:

```json
"learningPaths": {
  "type": "object",
  "required": ["ms3", "resident"],
  "additionalProperties": false,
  "properties": {
    "ms3": {
      "allOf": [
        { "$ref": "#/definitions/learningPath" },
        { "properties": {
          "id": { "const": "ms3-six-week" },
          "weeks": { "minItems": 6, "maxItems": 6 }
        }}
      ]
    },
    "resident": {
      "allOf": [
        { "$ref": "#/definitions/learningPath" },
        { "properties": {
          "id": { "const": "resident-four-week" },
          "weeks": { "minItems": 4, "maxItems": 4 }
        }}
      ]
    }
  }
}
```

The `learningPath` definition requires `id` and `weeks`; each week requires `n`, `title`, `theme`, `focusCategories`, and `items`, with `additionalProperties: false`. Set `focusCategories` to `minItems: 1`, `uniqueItems: true`, and the exact 12-value enum from Global Constraints. Keep week `n` integer `1..6` and keep item `kind` as `read|tool`.

- [ ] **Step 7: Move the MS3 sequence and add the exact resident path in `curriculum.json`**

Move the current six week objects into `learningPaths.ms3.weeks` without reordering or editing any existing title, theme, ref, or kind. Add the former `WEEK_MAP` category overlay by week:

```json
{
  "1": ["safety"],
  "2": ["mood", "psychosis", "pharm", "neurocog"],
  "3": ["personality", "anxiety", "relational"],
  "4": ["relational"],
  "5": ["safety", "neurocog", "substance"],
  "6": ["otherdx", "ethics"]
}
```

Add `learningPaths.resident.weeks` exactly as follows:

```json
[
  {
    "n": 1,
    "title": "Foundations and safety",
    "theme": "Interview · MSE · acute risk · bedside syndromes",
    "focusCategories": ["safety", "neurocog", "substance"],
    "items": [
      { "ref": "pg_interview.md", "kind": "read" },
      { "ref": "mse.html", "kind": "tool" },
      { "ref": "pg_suicide.md", "kind": "read" },
      { "ref": "agitation.md", "kind": "read" },
      { "ref": "violence.html", "kind": "tool" },
      { "ref": "delirium.md", "kind": "read" },
      { "ref": "withdrawal.html", "kind": "tool" },
      { "ref": "bfcrs.html", "kind": "tool" },
      { "ref": "capacity.html", "kind": "tool" }
    ]
  },
  {
    "n": 2,
    "title": "Diagnosis and psychopharmacology",
    "theme": "Diagnostic reasoning · major syndromes · medication decisions",
    "focusCategories": ["mood", "psychosis", "pharm", "substance"],
    "items": [
      { "ref": "diagnostic-reasoning.html", "kind": "tool" },
      { "ref": "t_mood.md", "kind": "read" },
      { "ref": "t_psychosis.md", "kind": "read" },
      { "ref": "t_sud.md", "kind": "read" },
      { "ref": "psychopharm_primer.md", "kind": "read" },
      { "ref": "adv_psychopharm.md", "kind": "read" },
      { "ref": "med_monitoring.md", "kind": "read" },
      { "ref": "interaction-cards.html", "kind": "tool" }
    ]
  },
  {
    "n": 3,
    "title": "Systems, med-legal, and disposition",
    "theme": "Consultation · collateral · family systems · defensible transitions",
    "focusCategories": ["ethics", "relational"],
    "items": [
      { "ref": "systems_medlegal.md", "kind": "read" },
      { "ref": "cl_reference.md", "kind": "read" },
      { "ref": "exp_consult.md", "kind": "read" },
      { "ref": "collateral_workflow.md", "kind": "read" },
      { "ref": "family-systems.html", "kind": "tool" },
      { "ref": "exp_family.md", "kind": "read" },
      { "ref": "doc_oral.md", "kind": "read" }
    ]
  },
  {
    "n": 4,
    "title": "Integration, supervision, and scholarship",
    "theme": "Formulation · rounds · EPAs · evidence retrieval",
    "focusCategories": ["otherdx", "ethics", "relational"],
    "items": [
      { "ref": "case_formulation.md", "kind": "read" },
      { "ref": "oral.html", "kind": "tool" },
      { "ref": "supervision_teaching.md", "kind": "read" },
      { "ref": "evidence_inpatient.md", "kind": "read" },
      { "ref": "landmark_trials.md", "kind": "read" },
      { "ref": "canon_200.md", "kind": "read" },
      { "ref": "rp-canon-quiz.html", "kind": "tool" }
    ]
  }
]
```

Do not change the remaining `libraryColumns`, `libraryExclude`, `siteLibrary`, `safetyKit`, `roles`, or `synonyms` values.

- [ ] **Step 8: Make `validate_curriculum.py` validate each site path against its site**

Replace the global six-week loop with this contract skeleton:

```python
PATH_CONTRACT = {
    "ms3": ("ms3-six-week", 6),
    "resident": ("resident-four-week", 4),
}
FOCUS_CATEGORIES = frozenset({
    "anxiety", "childdev", "ethics", "mood", "neurocog", "otherdx",
    "personality", "pharm", "psychosis", "relational", "safety", "substance",
})

paths = cur.get("learningPaths")
if not isinstance(paths, dict):
    bad("learningPaths", "must be an object with ms3 and resident entries")
    paths = {}

path_totals = {}
for site, (expected_id, expected_count) in PATH_CONTRACT.items():
    path = paths.get(site)
    label = "learningPaths.%s" % site
    if not isinstance(path, dict):
        bad(label, "must be an object")
        continue
    if path.get("id") != expected_id:
        bad(label, "id must be '%s'" % expected_id)
    weeks = path.get("weeks") if isinstance(path.get("weeks"), list) else []
    numbers = [w.get("n") for w in weeks if isinstance(w, dict)
               and isinstance(w.get("n"), int) and not isinstance(w.get("n"), bool)]
    if numbers != list(range(1, expected_count + 1)):
        bad(label, "week numbers must be exactly 1..%d in order, got %r" %
            (expected_count, numbers))
    for index, week in enumerate(weeks):
        week_label = "%s week %s" % (label,
                                      week.get("n") if isinstance(week, dict) else index + 1)
        if not isinstance(week, dict):
            bad(week_label, "must be an object")
            continue
        for field in ("title", "theme"):
            if not isinstance(week.get(field), str) or not week.get(field).strip():
                bad(week_label, "'%s' must be a non-empty string" % field)
        focus = week.get("focusCategories")
        if not isinstance(focus, list) or not focus:
            bad(week_label, "focusCategories must be a non-empty list")
            focus = []
        if len({value for value in focus if isinstance(value, str)}) != len(focus):
            bad(week_label, "focusCategories must contain unique strings")
        for value in focus:
            if value not in FOCUS_CATEGORIES:
                bad(week_label, "unknown focus category %r" % value)
        items = week.get("items")
        if not isinstance(items, list):
            bad(week_label, "items must be a list")
            continue
        seen_refs = set()
        for item in items:
            if not isinstance(item, dict):
                bad(week_label, "each item must be an object")
                continue
            ref, kind = item.get("ref"), item.get("kind")
            if not isinstance(ref, str):
                bad(week_label, "item ref must be a string (got %r)" % (ref,))
                continue
            if ref in seen_refs:
                bad(week_label, "duplicate ref '%s' within the week" % ref)
            seen_refs.add(ref)
            if ref not in site_shipped[site]:
                bad(week_label, "ref '%s' is not shipped on %s" % (ref, site))
                continue
            expected_kind = "tool" if ref in tool_slugs else "read"
            if kind != expected_kind:
                bad(week_label, "ref '%s' has kind '%s' but the build ships it as '%s'" %
                    (ref, kind, expected_kind))
    path_totals[site] = sum(len(w.get("items", [])) for w in weeks if isinstance(w, dict))
```

Use labels such as `learningPaths.resident week 3` in every item error. Keep library totality over the existing union `shipped`; only path availability is site-specific. Update success output to:

```python
print("curriculum.json OK — ms3 6 weeks/%d items; resident 4 weeks/%d items; "
      "%d pages placed, %d excluded." %
      (path_totals.get("ms3", 0), path_totals.get("resident", 0),
       len(placed), len(excluded)))
```

- [ ] **Step 9: Project only the selected path in `frontdoor_catalog.py`**

At the start of `build_frontdoor_payload`, validate and select the path:

```python
expected_paths = {"ms3": ("ms3-six-week", 6), "resident": ("resident-four-week", 4)}
learning_paths = curriculum.get("learningPaths")
source_path = learning_paths.get(site) if isinstance(learning_paths, dict) else None
expected_id, expected_count = expected_paths[site]
if not isinstance(source_path, dict):
    raise ValueError("curriculum.learningPaths.%s must be an object" % site)
if source_path.get("id") != expected_id:
    raise ValueError("curriculum.learningPaths.%s.id must be '%s'" % (site, expected_id))
weeks = source_path.get("weeks")
if not isinstance(weeks, list) or len(weeks) != expected_count:
    raise ValueError("curriculum.learningPaths.%s must contain %d weeks" %
                     (site, expected_count))

projected = copy.deepcopy(curriculum)
projected.pop("learningPaths", None)
projected.pop("roles", None)
projected.pop("siteLibrary", None)
projected["path"] = {"id": expected_id, "weekCount": len(weeks)}
projected["weeks"] = copy.deepcopy(weeks)
```

After `_catalog_entries(catalog)`, validate every selected path item against the final catalog and its kind. Build the emitted manifest from ordered Library refs followed by any path refs not already present:

```python
path_refs = []
for week in weeks:
    for item in week.get("items", []):
        ref, kind = item.get("ref"), item.get("kind")
        if ref not in catalog_entries:
            raise ValueError("path ref '%s' has no final %s catalog entry" % (ref, site))
        _title, nav_kind, _governance = catalog_entries[ref]
        expected_kind = "tool" if nav_kind == "tool" else "read"
        if kind != expected_kind:
            raise ValueError("path ref '%s' declares %s but final catalog is %s" %
                             (ref, kind, expected_kind))
        if ref not in path_refs:
            path_refs.append(ref)

manifest_refs = placed + [ref for ref in path_refs if ref not in placed]
```

Keep governance triplets and final-nav titles exactly as today. Do not derive them from `curriculum.json`.

- [ ] **Step 10: Preserve projected path data in `fd_data.js`**

Add `focusCategories` to joined week objects and return normalized path metadata:

```js
weeks.push({
  n:cw[w].n,
  title:cw[w].title,
  theme:cw[w].theme,
  focusCategories:(cw[w].focusCategories||[]).slice(),
  items:items
});

var sourcePath=cur.path||{};
var pathInfo={
  id:(typeof sourcePath.id==='string')?sourcePath.id:'',
  weekCount:weeks.length
};

return { byRef:byRef, path:pathInfo, weeks:weeks, columns:columns, kit:kit };
```

Add pure helpers:

```js
function fdPathWeekCount(index){
  return index&&index.weeks&&index.weeks.length?index.weeks.length:0;
}

function fdNextWeek(index, n){
  var weeks=(index&&index.weeks)||[];
  for(var i=0;i<weeks.length;i++){
    if(weeks[i].n===n) return (i+1<weeks.length)?weeks[i+1]:null;
  }
  return null;
}
```

- [ ] **Step 11: Run the focused contract tests and both build gates**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/fd-data.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected:

- Schema and procedural tests pass without tracebacks.
- Validator reports MS3 6 weeks/40 items and resident 4 weeks/31 items.
- Both builds have zero hard QA failures.
- MS3 projected payload contains only `ms3-six-week`; resident contains only `resident-four-week`.

- [ ] **Step 12: Commit the canonical data/build boundary**

```bash
git add curriculum.json curriculum.schema.json \
  13_Faculty_Resources/_automation/test_validate_registry_schemas.py \
  13_Faculty_Resources/_automation/validate_curriculum.py \
  13_Faculty_Resources/_automation/test_validate_curriculum.py \
  13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py \
  13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js \
  tests/fd-data.test.mjs
git commit -m "feat: project audience-specific learning paths"
```

---

### Task 2: Make every week interaction and date calculation path-aware

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js:55-111`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js:108-135,228-258`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js:1-111`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:188-236,798-815`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1440-1455,1550-1567,1844-1853`
- Modify: `tests/fd-state.test.mjs:1-264`
- Modify: `tests/fd-today.test.mjs:1-263`
- Modify: `tests/fd-path.test.mjs:1-233`
- Modify: `tests/fd-wire.test.mjs:1-220,930-965`
- Modify: `tests/fd-shell-boot.test.mjs:49-218`
- Modify: `tests/smoke/front-door.spec.js:1-100`

**Interfaces:**

- Consumes: Task 1's `FD_INDEX.weeks`, `fdPathWeekCount(index)`, `fdFindWeek(index,n)`, and `fdNextWeek(index,n)`.
- Produces: `fdRotationWeek(rotationStart,weeks,nowMs)`, `fdRotationStartForWeek(selectedWeek,weeks,nowMs)`, and `fdExamCountdown(week,weeks,nowMs,rotationStart)`; all week actions receive `context.index`.
- Invariant: a week is valid only when it is present in the injected `weeks` array. No UI or action branch uses a literal upper bound.

- [ ] **Step 1: Rewrite state tests around explicit four- and six-week arrays**

Export `fdRotationWeek` from the existing `make()` harness and define:

```js
const FOUR = [1, 2, 3, 4].map((n) => ({ n }));
const SIX = [1, 2, 3, 4, 5, 6].map((n) => ({ n }));
const MONDAY = '2026-08-03';
const atDay = (offset) => new Date(2026, 7, 3 + offset, 9, 0, 0).getTime();
```

Add these boundary assertions:

```js
assert.equal(F.fdRotationWeek(MONDAY, FOUR, atDay(0)), 1);
assert.equal(F.fdRotationWeek(MONDAY, FOUR, atDay(6)), 1);
assert.equal(F.fdRotationWeek(MONDAY, FOUR, atDay(7)), 2);
assert.equal(F.fdRotationWeek(MONDAY, FOUR, atDay(27)), 4);
assert.equal(F.fdRotationWeek(MONDAY, FOUR, atDay(28)), 5); // N + 1 sentinel
assert.equal(F.fdRotationWeek(MONDAY, SIX, atDay(35)), 6);
assert.equal(F.fdRotationWeek(MONDAY, SIX, atDay(42)), 7);
assert.equal(F.fdRotationStartForWeek(4, FOUR,
  new Date(2026, 7, 12, 9, 0, 0).getTime()), '2026-07-20');
assert.equal(F.fdRotationStartForWeek(5, FOUR, Date.now()), '');
```

Convert countdown expectations to pass `FOUR` or `SIX`. Pin Week 3/4 on `FOUR` to the same 9-day/2-day values Week 5/6 use on `SIX`, and assert weeks outside the final two return an empty string. Retain stored-exam-date precedence, non-Monday legacy start, monotonicity, singular-day, exam-day, and audience-neutral-copy tests for both lengths.

- [ ] **Step 2: Add Today, Path, wire, and shell tests for actual path membership**

In `fd-today.test.mjs`, make the fixture builder accept either four or six weeks and add:

```js
test('completed resident Week 3 previews Week 4 from the index', () => {
  const html = F.fdToday(FOUR_INDEX, fourState({
    week: 3, done: { 'w3a.md': true }
  }));
  assert.match(html, /Preview Week 4/);
  assert.match(html, /data-fd-view-week="4"/);
});

test('completed final week reviews itself and never invents a next week', () => {
  const html = F.fdToday(FOUR_INDEX, fourState({
    week: 4, done: { 'w4a.md': true }
  }));
  assert.match(html, /Review Week 4/);
  assert.match(html, /data-fd-view-week="4"/);
  assert.doesNotMatch(html, /Preview Week 4|Week 5/);
});
```

In `fd-path.test.mjs`, add a four-week index and pin:

```js
assert.match(F.fdPath(FOUR_INDEX, { week: 2, viewWeek: 2, done: {} }),
  /<h1 class="fd-path__h1">Your 4-week path<\/h1>/);
assert.equal((fourHtml.match(/data-fd-view-week=/g) || []).length, 4);
const invalid = F.fdPath(FOUR_INDEX, { week: 2, viewWeek: 99, done: {} });
assert.match(invalid, /<span class="fd-eyebrow">Week 1<\/span>/);
assert.doesNotMatch(invalid, /Week 99/);
const empty = F.fdPath({ path: { id: '', weekCount: 0 }, weeks: [] },
  { week: null, viewWeek: null, done: {} });
assert.match(empty, /class="fd-fallback"[^>]*role="alert"/);
```

In `fd-wire.test.mjs`, pass `index: FOUR_INDEX` in week-action contexts. Assert Week 4 writes a Monday-aligned start and Week 5 is a no-op for `data-fd-week`, `data-fd-view-week`, and `data-fd-setweek`. Keep browse value `0` valid and assert its fallback `viewWeek` equals the first projected week.

In `fd-shell-boot.test.mjs`, pin that live state calls `fdRotationWeek(out.rotationStart,FD_INDEX.weeks,out.nowMs)`, validates current/view weeks via `fdFindWeek`, and initializes from `fdRotationWeek(fdRotation,FD_INDEX.weeks,Date.now())`. Do not use a broad source ban yet because the placement code's six-week copy is removed in Task 3.

- [ ] **Step 3: Add a two-site smoke contract for setup and Path**

Extend `audience(testInfo)` in `front-door.spec.js`:

```js
weekCount: resident ? 4 : 6,
pathHeading: resident ? 'Your 4-week path' : 'Your 6-week path',
pathId: resident ? 'resident-four-week' : 'ms3-six-week',
```

Before selecting Week 1 in the first-run test, assert exactly `site.weekCount` numbered tiles. Add a focused test that:

1. uses the phone viewport;
2. opens Path on each project;
3. expects `site.pathHeading` and exactly `site.weekCount` timeline rows;
4. confirms the setup grid and Path have no horizontal overflow with `scrollWidth <= clientWidth`;
5. requests `/tools/learning-path.html` and expects HTTP 404 on both projects.

- [ ] **Step 4: Run the new week-behavior tests and confirm they fail on hard-coded six-week logic**

Run:

```bash
node --test tests/fd-state.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs \
  tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs
```

Expected: FAIL on old function signatures, `Math.min(6, ...)`, `The six weeks`, Week 5 acceptance in `fdDispatch`, and the shell's `<=6` checks.

- [ ] **Step 5: Replace state/date functions with path-array inputs**

In `fd_state.js`, add a small membership helper and replace the three date functions:

```js
function fdStateHasWeek(weeks, n){
  var list=weeks||[];
  if(typeof n!=='number'||isNaN(n)||n%1!==0) return false;
  for(var i=0;i<list.length;i++){ if(list[i]&&list[i].n===n) return true; }
  return false;
}

function fdRotationWeek(rotationStart, weeks, nowMs){
  var list=weeks||[];
  if(!list.length||typeof shelfDaysUntil!=='function') return null;
  var du=shelfDaysUntil(rotationStart||'',nowMs);
  if(du===null) return null;
  if(du>0) return 0;
  var position=Math.floor(-du/7)+1;
  if(position<=list.length) return list[position-1].n;
  return list[list.length-1].n+1;
}

function fdRotationStartForWeek(selectedWeek, weeks, nowMs){
  if(!fdStateHasWeek(weeks,selectedWeek)) return '';
  var d=new Date(nowMs||Date.now());
  d.setDate(d.getDate()-((d.getDay()+6)%7)-((selectedWeek-1)*7));
  return localDayStr(d.getTime());
}

function fdExamCountdown(week, weeks, nowMs, rotationStart){
  var list=weeks||[], last=list.length?list[list.length-1].n:null;
  if(last===null||!fdStateHasWeek(list,week)||week<last-1) return '';
  var stored=null;
  try{ stored=localStorage.getItem('cw_shelf_date'); }catch(_){ }
  var days=shelfDaysUntil(stored,nowMs);
  if(days===null){
    var fromStart=shelfDaysUntil(rotationStart,nowMs);
    if(fromStart!==null) days=((last-1)*7+4)+fromStart;
    else{
      var idx=(new Date(nowMs||Date.now()).getDay()+6)%7;
      days=(last-week)*7+(4-idx);
    }
  }
  if(days<0) return '';
  if(days===0) return '· exam day — good luck';
  return '· exam in ~'+days+' day'+(days===1?'':'s');
}
```

Keep all date parsing delegated to `shelfDaysUntil`.

- [ ] **Step 6: Make Today and Path derive navigation and copy from the index**

Change `fdContinue` to receive `index`:

```js
function fdContinue(index, state, wk, progress){
  if(progress.next){
    titleText=progress.next.title;
    openAttrs=' data-fd-open="'+fdEsc(progress.next.ref)+'"';
  } else {
    var nextWeek=fdNextWeek(index,state.week);
    var target=nextWeek?nextWeek.n:state.week;
    titleText=(nextWeek?'Preview Week ':'Review Week ')+target;
    openAttrs=' data-fd-tab="path" data-fd-view-week="'+fdEsc(target)+'"';
  }
}
```

Call it as `fdContinue(idx,st,wk,progress)`. Call countdown as `fdExamCountdown(st.week,idx.weeks,nowMs,st.rotationStart)`.

In `fd_path.js`, update the file header/comments to describe the projected learning-path timeline rather than a fixed six-week timeline, then replace the heading with:

```js
out+='<h1 class="fd-path__h1">Your '+fdEsc(fdPathWeekCount(idx))+'-week path</h1>';
```

Before rendering the heading, return the existing fail-safe block when `weeks.length === 0`:

```js
if(!weeks.length){
  return '<div class="fd-fallback" data-fd-fallback="path" role="alert">'+
    'This section could not load. Try reloading, or use another tab.</div>';
}
```

Resolve detail week with `fdFindWeek(idx,state.viewWeek) || weeks[0] || null`; derive `viewN` from the resolved week and never render the invalid saved number.

- [ ] **Step 7: Validate all delegated week actions against `context.index`**

In `fdDispatch`, replace numeric `1..6` tests with:

```js
function fdDispatchHasWeek(context, n){
  return !!fdFindWeek(context&&context.index,n);
}
```

Apply it to `data-fd-view-week`, numbered `data-fd-week`, and `data-fd-setweek`. Pass `c.index.weeks` to `fdRotationStartForWeek`. For browse value `0`, derive `viewWeek` from `(c.index.weeks[0]||{}).n` instead of a literal upper-bound assumption.

Add `index:index` to `fdWire`'s internal `context()` object so both DOM clicks and direct controller dispatch use the same validation.

- [ ] **Step 8: Remove shell-level six-week bounds and normalize live state**

Delete inline `rotationWeek()` from `spa_index.html`. In `fdLiveState`:

```js
var current=fdFindWeek(FD_INDEX,out.week);
if(!current){
  var computed=fdRotationWeek(out.rotationStart,FD_INDEX.weeks,out.nowMs);
  if(fdFindWeek(FD_INDEX,computed)) out.week=computed;
  else delete out.week;
}
if(!fdFindWeek(FD_INDEX,out.viewWeek)){
  out.viewWeek=fdFindWeek(FD_INDEX,out.week)
    ? out.week
    : ((FD_INDEX.weeks[0]||{}).n);
}
```

At boot:

```js
var fdWeek=fdRotationWeek(fdRotation,FD_INDEX.weeks,Date.now());
if(fdFindWeek(FD_INDEX,fdWeek)) fdStored.week=fdWeek;
```

Update comments to use `N + 1`/final week, not literal 7/week 6. Do not change route, role, progress, or storage ownership.

- [ ] **Step 9: Run unit, build, and two-project interaction tests**

Run:

```bash
node --test tests/fd-data.test.mjs tests/fd-state.test.mjs tests/fd-today.test.mjs \
  tests/fd-path.test.mjs tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs \
  tests/spa-shell-a11y.test.mjs tests/shell-copy.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npm ci
npx playwright test front-door.spec.js --project=nav-ms3 --project=nav-res
```

Expected: all pass; resident exposes only Weeks 1-4, MS3 only Weeks 1-6, invalid Week 5 actions on resident are ignored, and both mobile layouts have no horizontal overflow.

- [ ] **Step 10: Commit the dynamic week runtime**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js \
  13_Faculty_Resources/_automation/site_build/spa_index.html \
  tests/fd-state.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs \
  tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs tests/smoke/front-door.spec.js
git commit -m "feat: make front door duration path-aware"
```

---

### Task 3: Generate and safely migrate audience-specific personalized plans

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1456-1528`
- Modify: `tests/mastery-weakflag.test.mjs:1-113`
- Create: `tests/fd-plan-migration.test.mjs`
- Modify: `tests/smoke/frontdoor-runtime.spec.js:500-635`

**Interfaces:**

- Consumes: `FD_INDEX.path.id`, `fdPathWeekCount(FD_INDEX)`, `FD_INDEX.weeks[*].{n,title,focusCategories}`, `masteryByBlueprint()`, `cw_pretest_v1`, and `cw_plan_v1`.
- Produces: `fdPlanFromMastery(index,masteryRows,generatedAt,shelfDate)`, `fdPlanMatches(index,plan)`, `fdPlacementUsable(record)`, `fdLoadPlan(index)`, and the existing `buildPlan()` wrapper.
- Stored plan shape: `{pathId,weekCount,generatedAt,shelfDate,weeks:[{week,title,allCats,focus}]}`.
- Invariant: `focus` is a subset of the canonical `allCats`; week order never changes based on performance.

- [ ] **Step 1: Rewrite the mastery regression to use a projected index**

Remove `WEEK_MAP` extraction from `mastery-weakflag.test.mjs`. Extract `fdPlanFromMastery` and define a small projected index:

```js
const INDEX = {
  path: { id: 'ms3-six-week', weekCount: 6 },
  weeks: [
    { n: 1, title: 'Foundations & the MSE', focusCategories: ['safety'] },
    { n: 2, title: 'Mood, Psychosis & Pharm',
      focusCategories: ['mood', 'psychosis', 'pharm', 'neurocog'] },
    { n: 3, title: 'Psychotherapy & Personality',
      focusCategories: ['personality', 'anxiety', 'relational'] },
    { n: 4, title: 'Family Systems & EE', focusCategories: ['relational'] },
    { n: 5, title: 'Acute & Emergency',
      focusCategories: ['safety', 'neurocog', 'substance'] },
    { n: 6, title: 'Integration & Exam', focusCategories: ['otherdx', 'ethics'] },
  ],
};
```

Call `fdPlanFromMastery(INDEX, masteryByBlueprint(), '2026-08-18T12:00:00.000Z', '')`. Keep the four existing weak-flag assertions and add path ID/count/title/allCats assertions.

- [ ] **Step 2: Create plan-shape and migration tests**

Create `tests/fd-plan-migration.test.mjs` using the same real-source extraction pattern as `mastery-weakflag.test.mjs`. Evaluate the four new helpers with an in-memory `localStorage`, stubbed `masteryByBlueprint`, and four-/six-week indices. Define `make(localStorage, FD_INDEX, masteryRows)` with `new Function`; inside the harness, `masteryByBlueprint()` returns `masteryRows`, `LS()` reads the supplied storage, and the extracted real `buildPlan()` plus four helper functions are returned. Wrap it as:

```js
function planHarness(seed, index, masteryRows) {
  const storage = memStorage(seed);
  return { storage, F: make(storage, index, masteryRows) };
}
```

Define these fixtures before the tests:

```js
const NOW = '2026-08-18T12:00:00.000Z';
const rows = [
  { c: 'safety', score: 20, miss: 1 },
  { c: 'mood', score: 100, miss: 0 },
  { c: 'ethics', score: null, miss: 0 },
];
const RES_INDEX = {
  path: { id: 'resident-four-week', weekCount: 4 },
  weeks: [
    { n: 1, title: 'Foundations and safety',
      focusCategories: ['safety', 'neurocog', 'substance'] },
    { n: 2, title: 'Diagnosis and psychopharmacology',
      focusCategories: ['mood', 'psychosis', 'pharm', 'substance'] },
    { n: 3, title: 'Systems, med-legal, and disposition',
      focusCategories: ['ethics', 'relational'] },
    { n: 4, title: 'Integration, supervision, and scholarship',
      focusCategories: ['otherdx', 'ethics', 'relational'] },
  ],
};
```

Required tests:

```js
test('resident plan carries four canonical weeks and path identity', () => {
  const { F } = planHarness({}, RES_INDEX, rows);
  const plan = F.fdPlanFromMastery(RES_INDEX, rows, NOW, '');
  assert.equal(plan.pathId, 'resident-four-week');
  assert.equal(plan.weekCount, 4);
  assert.deepEqual(plan.weeks.map((w) => w.week), [1, 2, 3, 4]);
  assert.deepEqual(plan.weeks[0].allCats, ['safety', 'neurocog', 'substance']);
});

test('plan validation rejects legacy, wrong-path, wrong-count, reordered and foreign categories', () => {
  const { F } = planHarness({}, RES_INDEX, rows);
  const valid = F.fdPlanFromMastery(RES_INDEX, rows, NOW, '');
  const legacyWithoutPathId = structuredClone(valid);
  delete legacyWithoutPathId.pathId;
  const wrongPath = structuredClone(valid);
  wrongPath.pathId = 'ms3-six-week';
  const wrongCount = structuredClone(valid);
  wrongCount.weekCount = 6;
  const reorderedWeeks = structuredClone(valid);
  reorderedWeeks.weeks.reverse();
  const foreignAllCats = structuredClone(valid);
  foreignAllCats.weeks[0].allCats.push('anxiety');
  const foreignFocus = structuredClone(valid);
  foreignFocus.weeks[0].focus.push('anxiety');
  for (const plan of [legacyWithoutPathId, wrongPath, wrongCount, reorderedWeeks,
    foreignAllCats, foreignFocus]) {
    assert.equal(F.fdPlanMatches(RES_INDEX, plan), false);
  }
});

test('legacy plan plus valid placement regenerates only cw_plan_v1', () => {
  const progress = JSON.stringify({ 'pg_interview.md': { done: true, at: '2026-08-17' } });
  const pretest = JSON.stringify({
    takenAt: NOW,
    answers: [{ id: 'pt_safety', cat: 'safety', correct: false }],
    byCat: { safety: { n: 1, correct: 0 } },
  });
  const qbank = JSON.stringify({ pt_safety: { correct: false, cat: 'safety' } });
  const { storage, F } = planHarness({
    cw_plan_v1: JSON.stringify({ generatedAt: NOW, shelfDate: '', weeks: [] }),
    cw_pretest_v1: pretest,
    cw_progress_v1: progress,
    cw_qb_v1: qbank,
  }, RES_INDEX, rows);
  const plan = F.fdLoadPlan(RES_INDEX);
  assert.equal(plan.pathId, 'resident-four-week');
  assert.equal(plan.weekCount, 4);
  assert.equal(storage.getItem('cw_progress_v1'), progress);
  assert.equal(storage.getItem('cw_pretest_v1'), pretest);
  assert.equal(storage.getItem('cw_qb_v1'), qbank);
  assert.deepEqual(JSON.parse(storage.getItem('cw_plan_v1')), plan);
});

test('corrupt plan without usable placement returns null and preserves progress', () => {
  const progress = JSON.stringify({ 'pg_interview.md': { done: true, at: '2026-08-17' } });
  const { storage, F } = planHarness({
    cw_plan_v1: '{broken',
    cw_progress_v1: progress,
  }, RES_INDEX, rows);
  assert.equal(F.fdLoadPlan(RES_INDEX), null);
  assert.equal(storage.getItem('cw_plan_v1'), null);
  assert.equal(storage.getItem('cw_progress_v1'), progress);
});
```

Define a usable placement as an object with a non-empty `answers` array whose entries have string `id`, allowed string `cat`, and boolean `correct`; require `byCat` to be an object. Test corrupt JSON, empty answers, and malformed entries as unusable.

- [ ] **Step 3: Add two-site smoke tests for dynamic plan copy and recovery**

Add helpers to `frontdoor-runtime.spec.js`:

```js
function expectedPlan(testInfo) {
  const resident = testInfo.project.name === 'nav-res';
  return {
    id: resident ? 'resident-four-week' : 'ms3-six-week',
    count: resident ? 4 : 6,
    title: resident ? 'Your 4-week plan' : 'Your 6-week plan',
  };
}

const VALID_PLACEMENT = {
  takenAt: '2026-08-17T00:00:00.000Z',
  answers: [{ id: 'synthetic-placement', cat: 'safety', correct: false }],
  byCat: { safety: { n: 1, correct: 0 } },
};
```

Replace empty plan seeds in the layout/title tests with a legacy plan plus `VALID_PLACEMENT`, so clicking Plan exercises regeneration. Assert the resulting title, heading, `pathId`, `weekCount`, card count, and an `Open Week 1` action that routes to `?tab=path` with Week 1 selected.

Add a recovery test seeded with corrupt `cw_plan_v1`, no placement, and a sentinel `cw_progress_v1`. Clicking Plan must show `2-minute placement`, remove only the invalid plan, and preserve the exact progress object.

- [ ] **Step 4: Run the plan tests and confirm they fail on `WEEK_MAP` and legacy storage**

Run:

```bash
node --test tests/mastery-weakflag.test.mjs tests/fd-plan-migration.test.mjs
```

Expected: FAIL because `fdPlanFromMastery`, `fdPlanMatches`, `fdPlacementUsable`, and `fdLoadPlan` do not exist, while `WEEK_MAP` still owns the plan.

- [ ] **Step 5: Replace `WEEK_MAP` with pure canonical plan helpers**

Delete `WEEK_MAP`. Add:

```js
function fdPlanFromMastery(index,masteryRows,generatedAt,shelfDate){
  var weak={},rows=masteryRows||[],weeks=(index&&index.weeks)||[];
  for(var i=0;i<rows.length;i++){
    if(rows[i].score==null||(rows[i].score<70&&rows[i].miss>0)) weak[rows[i].c]=1;
  }
  return {
    pathId:(index&&index.path&&index.path.id)||'',
    weekCount:weeks.length,
    generatedAt:generatedAt,
    shelfDate:shelfDate||'',
    weeks:weeks.map(function(w){
      var cats=(w.focusCategories||[]).slice();
      return {
        week:w.n,
        title:'Week '+w.n+' — '+w.title,
        allCats:cats,
        focus:cats.filter(function(c){return !!weak[c];})
      };
    })
  };
}

function buildPlan(){
  return fdPlanFromMastery(FD_INDEX,masteryByBlueprint(),
    new Date().toISOString(),LS('cw_shelf_date')||'');
}
```

Keep the existing `miss > 0` weak-area protection exactly.

- [ ] **Step 6: Validate stored plans and regenerate only from usable placement**

Implement exact-array comparison and storage recovery:

```js
function fdSameStrings(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length) return false;
  for(var i=0;i<a.length;i++){ if(a[i]!==b[i]) return false; }
  return true;
}

function fdPlanMatches(index,plan){
  var weeks=(index&&index.weeks)||[],path=index&&index.path;
  if(!path||!plan||typeof plan!=='object'||plan.pathId!==path.id||
     path.weekCount!==weeks.length||plan.weekCount!==weeks.length||!Array.isArray(plan.weeks)||
     plan.weeks.length!==weeks.length) return false;
  for(var i=0;i<weeks.length;i++){
    var stored=plan.weeks[i],canonical=weeks[i],cats=canonical.focusCategories||[];
    if(!stored||stored.week!==canonical.n||stored.title!=='Week '+canonical.n+' — '+canonical.title||
       !fdSameStrings(stored.allCats,cats)||!Array.isArray(stored.focus)) return false;
    for(var j=0;j<stored.focus.length;j++){
      if(cats.indexOf(stored.focus[j])<0||stored.focus.indexOf(stored.focus[j])!==j) return false;
    }
  }
  return true;
}

function fdPlacementUsable(record){
  if(!record||typeof record!=='object'||!Array.isArray(record.answers)||
     !record.answers.length||!record.byCat||typeof record.byCat!=='object'||
     Array.isArray(record.byCat)) return false;
  for(var i=0;i<record.answers.length;i++){
    var answer=record.answers[i];
    if(!answer||typeof answer.id!=='string'||!answer.id||typeof answer.cat!=='string'||
       typeof answer.correct!=='boolean'||SHELF_ORDER.indexOf(answer.cat)<0) return false;
  }
  return true;
}

function fdLoadPlan(index){
  var plan=null,placement=null;
  try{plan=JSON.parse(localStorage.getItem('cw_plan_v1')||'null');}catch(_){plan=null;}
  if(fdPlanMatches(index,plan)) return plan;
  try{placement=JSON.parse(localStorage.getItem('cw_pretest_v1')||'null');}catch(_){placement=null;}
  if(fdPlacementUsable(placement)){
    plan=buildPlan();
    try{localStorage.setItem('cw_plan_v1',JSON.stringify(plan));}catch(_){ }
    return plan;
  }
  try{localStorage.removeItem('cw_plan_v1');}catch(_){ }
  return null;
}
```

Do not write or remove any other key in these helpers.

- [ ] **Step 7: Make Progress, placement results, and stored-plan rendering dynamic**

In `renderProgress`, call `fdLoadPlan(FD_INDEX)` once. If it returns a plan, show `View your personalized N-week plan`; otherwise always show the placement button, using `Take` when no usable placement exists and `Retake` when a placement record exists but cannot safely regenerate.

Derive `duration = fdPathWeekCount(FD_INDEX)+'-week'` for:

- Progress link text;
- `Your personalized N-week plan` on placement results;
- `Your N-week plan` heading and document title.

Update `renderPlanCards` so each card ends with:

```js
'<button class="hm-li" data-fd-view-week="'+fdEsc(wk.week)+'" style="border-bottom:none">'+
  '<span class="t">Open Week '+fdEsc(wk.week)+'</span><span class="sec">path →</span></button>'
```

Do not link plan cards to `weekN.md`. Change `renderStoredPlan` to call `fdLoadPlan(FD_INDEX)` and `startPretest()` on null. Leave placement submission's `cw_pretest_v1` and `cw_qb_v1` writes unchanged; its newly built plan automatically gains the new shape.

- [ ] **Step 8: Run plan, shell, build, and two-project runtime tests**

Run:

```bash
node --test tests/mastery-weakflag.test.mjs tests/fd-plan-migration.test.mjs \
  tests/fd-shell-boot.test.mjs tests/shell-copy.test.mjs tests/fd-wire.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npx playwright test frontdoor-runtime.spec.js --project=nav-ms3 --project=nav-res
```

Expected: all pass. Resident plans contain 4 cards/`resident-four-week`; MS3 plans contain 6 cards/`ms3-six-week`; corrupt/legacy storage does not blank the app or alter progress.

- [ ] **Step 9: Commit personalized-plan generation and migration**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html \
  tests/mastery-weakflag.test.mjs tests/fd-plan-migration.test.mjs \
  tests/smoke/frontdoor-runtime.spec.js
git commit -m "feat: personalize plans for each rotation path"
```

---

## Final verification and handoff

- [ ] **Run all repository validators and unit tests**

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/*.test.mjs
```

Expected: all pass. Record exact test counts in the handoff.

- [ ] **Rebuild both sites sequentially through the production-equivalent gates**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: zero hard failures on both sites. Existing informational/soft findings may be reported separately but must not be presented as feature failures.

- [ ] **Prove the built payloads contain only their own path and the retired page stays absent**

```bash
python3 - <<'PY'
import json, re
from pathlib import Path

for build, expected_id, expected_count, forbidden_id in (
    ('ms3', 'ms3-six-week', 6, 'resident-four-week'),
    ('res', 'resident-four-week', 4, 'ms3-six-week'),
):
    html = Path('_build', build, 'index.html').read_text(encoding='utf-8')
    match = re.search(r'var FD_CURRICULUM=(.*?);\n', html)
    assert match, build
    curriculum = json.loads(match.group(1))
    assert curriculum['path'] == {'id': expected_id, 'weekCount': expected_count}
    assert len(curriculum['weeks']) == expected_count
    assert forbidden_id not in match.group(1)
    assert not Path('_build', build, 'tools', 'learning-path.html').exists()
    print(build, curriculum['path'], 'OK')
PY
```

- [ ] **Run the full Playwright suite against the built sites**

From the repository root, start the repository's three-site smoke launcher in one terminal/session:

```bash
bash tests/smoke/start-local-servers.sh
```

Then, from `tests/smoke` in a second terminal/session, run:

```bash
npx playwright test
```

Expected: both `nav-ms3` and `nav-res` pass the audience-specific setup/Path/plan tests; all unrelated projects remain green. If only the resident visual snapshot changes because its Week 1 content is now resident-specific, do not update it locally. Record the diff and use the Ubuntu/Chromium baseline-refresh workflow only after branch publication is authorized.

- [ ] **Audit scope, storage, and copy before claiming completion**

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --name-only
rg -n 'Math\.min\(6|(?:week|wk|selectedWeek)\s*(?:<=|>)\s*6|The six weeks|WEEK_MAP|personalized 6-week|Your 6-week plan' \
  13_Faculty_Resources/_automation/site_build/frontdoor \
  13_Faculty_Resources/_automation/site_build/spa_index.html
git status --short --branch
```

Expected:

- `git diff --check` is clean.
- The hard-coded scan returns no active week-limit or plan-copy matches; references to the titled resource `One Patient, Six Weeks` are allowed and must remain.
- No clinical content, governance ledger, attestation, question bank, `CLAUDE.md`, or `AGENTS.md` file appears in the diff.
- Worktree is clean after the three feature commits plus this documentation plan commit.

- [ ] **Prepare the implementation handoff without publishing or merging**

Report:

1. MS3 and resident path IDs/counts and exact built verification;
2. test/build/smoke results, separating soft baseline findings from failures;
3. storage migration behavior and confirmation that progress was preserved;
4. the expected resident visual change and whether the official Ubuntu refresh is still needed;
5. branch and commit list;
6. one next action: review the diff, publish a branch/PR only with user authorization.
