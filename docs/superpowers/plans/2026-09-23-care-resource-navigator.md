# Care Resource Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed-choice, patient-data-free navigator that points learners to the best starting ReConnect resource while preserving the complete five-resource Care collection.

**Architecture:** Store the six curated intent mappings in `curriculum.json`, validate their shape and cross-resource references, and project them into the existing Front Door index without entering shipped-page or attestation inventories. A new pure ES5 renderer resolves and renders the navigator; `fd_wire.js` owns only transient selection and focus behavior, while the existing Care page and canonical resource records remain the fail-safe source of links.

**Tech Stack:** Draft-07 JSON Schema, Python 3.11 semantic validation, build-injected ES5 JavaScript, static HTML/CSS, Node `node:test`, and Playwright/Chromium.

**Spec:** `docs/superpowers/specs/2026-09-23-care-resource-navigator-design.md`

## Global Constraints

- Keep exactly five canonical `careResources` and exactly six `careNavigator` intents with the mappings approved in the spec.
- Keep Family Therapy Seminar Companion in The Essentials; do not expose it as a sixth Care resource.
- Use only canonical resource titles, descriptions, and fixed URLs; never construct or append query, route, search, or patient context.
- Accept no free text and collect no patient name, diagnosis, symptom, location, clinical note, or other patient-specific detail.
- Persist no navigator state in localStorage, sessionStorage, cookies, the URL, history snapshots, analytics, logs, or a remote endpoint.
- Add no dependency, network prefetch, availability probe, clinical claim, dose content, crisis contact, completion record, or faculty-attestation change.
- Keep build-injected browser code ES5-compatible: `var`, function declarations, ordinary loops, and no `const`, `let`, arrow functions, optional chaining, or module syntax.
- Escape every curriculum string and URL at the rendering boundary.
- Keep the ordinary five-resource groups visible and unchanged when navigator data is missing or malformed.
- Keep every interactive target at least 44 by 44 CSS pixels, preserve logical keyboard order and focus, and avoid color-only selected state.
- Update `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` in the same commit as `frontdoor.css` selector changes.
- Build MS3 and resident outputs sequentially because their generated output paths are shared.

## Review Focus

1. **Unknown or partially corrupt intent references:** the real registry must fail validation, while the runtime must omit broken choices and keep all five canonical links; Tasks 1, 3, and 6 pin both halves.
2. **Duplicate or self-referential recommendations:** a primary repeated as an alternative or a duplicated alternative must fail the semantic gate; Task 1 supplies negative registry fixtures.
3. **Hostile curriculum copy, IDs, or URL text:** IDs must be constrained before use, all rendered fields must be escaped, and no dynamic destination may be synthesized; Task 3 exercises both rejection and escaping.
4. **State leakage into storage, history, search, or another tab:** selection must remain visit-only and clear on tab exit or reload; Tasks 4 and 6 inspect controller state, storage, URL, history, and search behavior.
5. **Focus, announcement, and narrow-layout regressions:** rerender must return focus to the chosen control, Clear must return to the first choice, and 320-pixel/200%-zoom layouts must not overflow; Tasks 4, 5, and 6 cover these behaviors.

---

### Task 1: Govern the six-intent decision map

**Files:**
- Modify: `curriculum.json:276`
- Modify: `curriculum.schema.json:5,78`
- Modify: `13_Faculty_Resources/_automation/validate_registry_schemas.py:64,312-371`
- Modify: `13_Faculty_Resources/_automation/test_validate_registry_schemas.py:475-563`
- Modify: `tests/fd-care.test.mjs:30-45,75-85`

**Interfaces:**
- Consumes: the five existing `curriculum.careResources[*].id` values.
- Produces: `curriculum.careNavigator`, an ordered array of `{id, label, explanation, primaryResourceId, alternativeResourceIds}` records; `care_navigator_diagnostics(document) -> list[str]` for semantic validation.

- [ ] **Step 1: Add failing semantic-gate fixtures**

Add a curriculum mutation helper beside `_mutated_pairings()` in `test_validate_registry_schemas.py`:

```python
    def _mutated_curriculum(self, root: Path, mutate) -> str:
        document = json.loads((root / "curriculum.json").read_text(encoding="utf-8"))
        mutate(document)
        (root / "curriculum.json").write_text(
            json.dumps(document, indent=2) + "\n", encoding="utf-8"
        )
        result = run_validator(root)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result.stdout
```

Add five tests that mutate the real copied curriculum:

```python
    def test_care_navigator_rejects_unknown_resource_reference(self) -> None:
        with self.make_registry_copy() as temporary:
            stdout = self._mutated_curriculum(
                Path(temporary),
                lambda document: document["careNavigator"][0].update(
                    {"primaryResourceId": "missing-resource"}
                ),
            )
        self.assertIn("unknown care resource 'missing-resource'", stdout)

    def test_care_navigator_rejects_duplicate_alternatives(self) -> None:
        with self.make_registry_copy() as temporary:
            stdout = self._mutated_curriculum(
                Path(temporary),
                lambda document: document["careNavigator"][2].update(
                    {"alternativeResourceIds": ["book-shelf", "book-shelf"]}
                ),
            )
        self.assertIn("duplicates alternative 'book-shelf'", stdout)

    def test_care_navigator_rejects_primary_repeated_as_alternative(self) -> None:
        with self.make_registry_copy() as temporary:
            stdout = self._mutated_curriculum(
                Path(temporary),
                lambda document: document["careNavigator"][1].update(
                    {"alternativeResourceIds": ["meeting-calendar"]}
                ),
            )
        self.assertIn("repeats its primary resource", stdout)

    def test_care_navigator_requires_every_approved_intent_once(self) -> None:
        def remove_family_intent(document):
            document["careNavigator"] = [
                intent for intent in document["careNavigator"]
                if intent["id"] != "family-conversation"
            ]

        with self.make_registry_copy() as temporary:
            stdout = self._mutated_curriculum(Path(temporary), remove_family_intent)
        self.assertIn("missing intent 'family-conversation'", stdout)

    def test_care_navigator_rejects_duplicate_intent_ids(self) -> None:
        with self.make_registry_copy() as temporary:
            stdout = self._mutated_curriculum(
                Path(temporary),
                lambda document: document["careNavigator"][-1].update({"id": "services"}),
            )
        self.assertIn("'services' duplicates /careNavigator/0", stdout)
```

In `tests/fd-care.test.mjs`, add an exact mapping assertion:

```js
const expectedNavigator = [
  ['services', 'resource-finder', ['meeting-calendar']],
  ['meetings', 'meeting-calendar', ['resource-finder']],
  ['explain', 'education-library', ['book-shelf', 'podcast-navigator']],
  ['listen', 'podcast-navigator', ['education-library', 'book-shelf']],
  ['books', 'book-shelf', ['education-library', 'podcast-navigator']],
  ['family-conversation', 'education-library', ['book-shelf', 'podcast-navigator']],
];

test('the curriculum carries the approved six-intent navigator map', () => {
  assert.deepEqual(curriculum.careNavigator.map((intent) => [
    intent.id, intent.primaryResourceId, intent.alternativeResourceIds,
  ]), expectedNavigator);
  assert.ok(schema.required.includes('careNavigator'));
  const navigatorSchema = schema.properties.careNavigator;
  assert.equal(navigatorSchema.minItems, 6);
  assert.equal(navigatorSchema.maxItems, 6);
  assert.equal(navigatorSchema.items.additionalProperties, false);
  assert.deepEqual(navigatorSchema.items.properties.id.enum,
    expectedNavigator.map(([id]) => id));
  assert.equal(navigatorSchema.items.properties.alternativeResourceIds.maxItems, 2);
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing contract fails**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
node --test --test-name-pattern='approved six-intent navigator map' tests/fd-care.test.mjs
```

Expected: Python fixtures error because `careNavigator` does not exist, and the Node test fails because `curriculum.careNavigator` is undefined.

- [ ] **Step 3: Add the exact curriculum data and schema**

Add `careNavigator` immediately after `careResources` in `curriculum.json`:

```json
"careNavigator": [
  {
    "id": "services",
    "label": "Find community services",
    "explanation": "Start with the Resource Finder to review practical and treatment supports by need.",
    "primaryResourceId": "resource-finder",
    "alternativeResourceIds": ["meeting-calendar"]
  },
  {
    "id": "meetings",
    "label": "Locate recovery meetings",
    "explanation": "Start with the meeting calendar when the immediate task is locating recovery support.",
    "primaryResourceId": "meeting-calendar",
    "alternativeResourceIds": ["resource-finder"]
  },
  {
    "id": "explain",
    "label": "Explain something to a patient or family",
    "explanation": "Start with the education library for plain-language information patients and families can review.",
    "primaryResourceId": "education-library",
    "alternativeResourceIds": ["book-shelf", "podcast-navigator"]
  },
  {
    "id": "listen",
    "label": "Find a podcast or listening resource",
    "explanation": "Start with Podcast Navigator to find curated listening by topic and audience.",
    "primaryResourceId": "podcast-navigator",
    "alternativeResourceIds": ["education-library", "book-shelf"]
  },
  {
    "id": "books",
    "label": "Recommend a book",
    "explanation": "Start with Recommended Books to browse curated reading by topic, reader, and relationship pattern.",
    "primaryResourceId": "book-shelf",
    "alternativeResourceIds": ["education-library", "podcast-navigator"]
  },
  {
    "id": "family-conversation",
    "label": "Prepare for a family conversation",
    "explanation": "Start with the education library for material that can support a clear, shared family conversation.",
    "primaryResourceId": "education-library",
    "alternativeResourceIds": ["book-shelf", "podcast-navigator"]
  }
],
```

Add `careNavigator` to the root `required` array and add this Draft-07 property after `careResources`:

```json
"careNavigator": {
  "description": "Fixed, local-only task choices that rank canonical careResources without collecting patient context.",
  "type": "array",
  "minItems": 6,
  "maxItems": 6,
  "items": {
    "type": "object",
    "required": ["id", "label", "explanation", "primaryResourceId", "alternativeResourceIds"],
    "additionalProperties": false,
    "properties": {
      "id": {
        "type": "string",
        "enum": ["services", "meetings", "explain", "listen", "books", "family-conversation"]
      },
      "label": { "type": "string", "minLength": 8, "maxLength": 64 },
      "explanation": { "type": "string", "minLength": 24, "maxLength": 160 },
      "primaryResourceId": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
      "alternativeResourceIds": {
        "type": "array",
        "maxItems": 2,
        "uniqueItems": true,
        "items": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" }
      }
    }
  }
},
```

- [ ] **Step 4: Add the semantic relationship gate**

Add the approved ID tuple and diagnostic function to `validate_registry_schemas.py`:

```python
CARE_NAVIGATOR_IDS = (
    "services",
    "meetings",
    "explain",
    "listen",
    "books",
    "family-conversation",
)


def care_navigator_diagnostics(document):
    """Require six unique intents whose recommendations resolve to careResources."""
    diagnostics = []
    resources = document.get("careResources", []) if isinstance(document, dict) else []
    resource_ids = {
        resource.get("id") for resource in resources
        if isinstance(resource, dict) and isinstance(resource.get("id"), str)
    }
    intents = document.get("careNavigator", []) if isinstance(document, dict) else []
    seen = {}
    for index, intent in enumerate(intents):
        if not isinstance(intent, dict):
            continue
        intent_id = intent.get("id")
        if isinstance(intent_id, str):
            if intent_id in seen:
                diagnostics.append(
                    "curriculum.json: INVALID at /careNavigator/%d/id: %r duplicates /careNavigator/%d"
                    % (index, intent_id, seen[intent_id])
                )
            else:
                seen[intent_id] = index
        primary = intent.get("primaryResourceId")
        if isinstance(primary, str) and primary not in resource_ids:
            diagnostics.append(
                "curriculum.json: INVALID at /careNavigator/%d/primaryResourceId: "
                "unknown care resource %r" % (index, primary)
            )
        alternatives = intent.get("alternativeResourceIds", [])
        alternative_seen = set()
        if isinstance(alternatives, list):
            for alternative_index, alternative in enumerate(alternatives):
                if not isinstance(alternative, str):
                    continue
                if alternative == primary:
                    diagnostics.append(
                        "curriculum.json: INVALID at /careNavigator/%d/alternativeResourceIds/%d: "
                        "repeats its primary resource %r" % (index, alternative_index, primary)
                    )
                if alternative in alternative_seen:
                    diagnostics.append(
                        "curriculum.json: INVALID at /careNavigator/%d/alternativeResourceIds/%d: "
                        "duplicates alternative %r" % (index, alternative_index, alternative)
                    )
                alternative_seen.add(alternative)
                if alternative not in resource_ids:
                    diagnostics.append(
                        "curriculum.json: INVALID at /careNavigator/%d/alternativeResourceIds/%d: "
                        "unknown care resource %r" % (index, alternative_index, alternative)
                    )
    for intent_id in CARE_NAVIGATOR_IDS:
        if intent_id not in seen:
            diagnostics.append(
                "curriculum.json: INVALID at /careNavigator: missing intent %r" % intent_id
            )
    return diagnostics
```

Add the curriculum branch to `validate_root()`:

```python
        if document_name == "question_bank.json":
            semantic = qbank_prefix_diagnostics(document)
        elif document_name == "pairings.json":
            semantic = pairings_integrity_diagnostics(document, root)
        elif document_name == "curriculum.json":
            semantic = care_navigator_diagnostics(document)
        else:
            semantic = []
```

- [ ] **Step 5: Run the schema and semantic gates**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
node --test --test-name-pattern='approved six-intent navigator map|curriculum schema governs' tests/fd-care.test.mjs
```

Expected: all commands exit 0; the validator reports `curriculum.json: OK (curriculum.schema.json)`.

- [ ] **Step 6: Commit the governed data contract**

```bash
git add curriculum.json curriculum.schema.json \
  13_Faculty_Resources/_automation/validate_registry_schemas.py \
  13_Faculty_Resources/_automation/test_validate_registry_schemas.py \
  tests/fd-care.test.mjs
git commit -m "feat(care): govern navigator intent map"
```

---

### Task 2: Project navigator data without entering Clerkship inventories

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js:194-224`
- Modify: `tests/fd-data.test.mjs:48-83,207-250`

**Interfaces:**
- Consumes: `curriculum.careNavigator` from Task 1.
- Produces: `fdBuildIndex(...).careNavigator`, a defensive ordered copy with independently copied `alternativeResourceIds` arrays.

- [ ] **Step 1: Add the navigator fixture and failing projection assertions**

Add this array to `FIX_CUR` after `careResources`:

```js
  careNavigator: [
    { id: 'services', label: 'Find community services',
      explanation: 'Start with the Resource Finder to review practical and treatment supports by need.',
      primaryResourceId: 'resource-finder', alternativeResourceIds: ['meeting-calendar'] },
    { id: 'meetings', label: 'Locate recovery meetings',
      explanation: 'Start with the meeting calendar when the immediate task is locating recovery support.',
      primaryResourceId: 'meeting-calendar', alternativeResourceIds: ['resource-finder'] },
  ],
```

Add a focused test after the existing care-resource projection test:

```js
test('care navigator intents join defensively outside content inventories', () => {
  const cur = structuredClone(FIX_CUR);
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.careNavigator, FIX_CUR.careNavigator);
  assert.notStrictEqual(idx.careNavigator, cur.careNavigator);
  assert.notStrictEqual(idx.careNavigator[0].alternativeResourceIds,
    cur.careNavigator[0].alternativeResourceIds);
  assert.equal(idx.byRef.services, undefined);
  assert.equal(idx.known.services, undefined);
  idx.careNavigator[0].alternativeResourceIds.push('mutated');
  assert.doesNotMatch(JSON.stringify(cur), /mutated/);
});

test('malformed navigator records cannot break index construction', () => {
  const cur = structuredClone(FIX_CUR);
  cur.careNavigator = [null, { id: 'services', label: 'Find community services',
    explanation: 'Start with the Resource Finder.', primaryResourceId: 'resource-finder',
    alternativeResourceIds: 'not-an-array' }];
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.careNavigator.length, 1);
  assert.deepEqual(idx.careNavigator[0].alternativeResourceIds, []);
  assert.equal(idx.careResources.length, FIX_CUR.careResources.length);
});
```

Extend the real two-audience projection test:

```js
    assert.deepEqual(idx.careNavigator.map(({ id, primaryResourceId }) => (
      { id, primaryResourceId }
    )), CUR.careNavigator.map(({ id, primaryResourceId }) => (
      { id, primaryResourceId }
    )), site);
```

- [ ] **Step 2: Run the focused projection tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='care navigator intents|same five canonical care resources' tests/fd-data.test.mjs
```

Expected: FAIL because `fdBuildIndex()` does not return `careNavigator`.

- [ ] **Step 3: Project a defensive navigator copy**

Add this block after the existing `careResources` projection in `fd_data.js`:

```js
  var careNavigator=[], cn=Array.isArray(cur.careNavigator)?cur.careNavigator:[];
  for(var cni=0;cni<cn.length;cni++){
    var navigatorIntent=cn[cni];
    if(!navigatorIntent||typeof navigatorIntent!=='object') continue;
    careNavigator.push({
      id:navigatorIntent.id,
      label:navigatorIntent.label,
      explanation:navigatorIntent.explanation,
      primaryResourceId:navigatorIntent.primaryResourceId,
      alternativeResourceIds:Array.isArray(navigatorIntent.alternativeResourceIds)
        ?navigatorIntent.alternativeResourceIds.slice():[]
    });
  }
```

Add `careNavigator:careNavigator` to the returned index beside `careResources`:

```js
  return { byRef:byRef, path:pathInfo, weeks:weeks, columns:columns, kit:kit, known:known,
    titles:titles, essentials:essentials, essentialsDropped:essentialsDropped,
    careResources:careResources, careNavigator:careNavigator, teachingResources:teachingResources };
```

- [ ] **Step 4: Run the data suite**

Run:

```bash
node --test tests/fd-data.test.mjs
```

Expected: all tests pass, including defensive-copy and both-audience assertions.

- [ ] **Step 5: Commit the projection**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js tests/fd-data.test.mjs
git commit -m "feat(care): project navigator intents"
```

---

### Task 3: Render the fixed-choice navigator from canonical resources

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_navigator.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_care.js:1-36`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py:816-820`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1822-1828,2323`
- Modify: `tests/fd-care.test.mjs:1-90`

**Interfaces:**
- Consumes: `index.careResources`, `index.careNavigator`, and optional `selectedIntentId: string`.
- Produces: `fdCareNavigatorEntries(index) -> Array<{id,label,explanation,primary,alternatives}>`, `fdCareNavigatorSelection(index, selectedIntentId) -> object|null`, `fdCareNavigator(index, selectedIntentId) -> string`, and the extended `fdCare(index, selectedIntentId) -> string`.

- [ ] **Step 1: Add failing pure-renderer and fallback tests**

Load the new source before `fd_care.js` in `tests/fd-care.test.mjs` and expose its functions:

```js
const navigatorUrl = new URL(`${BUILD}/frontdoor/fd_care_navigator.js`, import.meta.url);
const navigatorSrc = existsSync(navigatorUrl) ? readFileSync(navigatorUrl, 'utf8') : '';

F = new Function(`
  ${dataSrc}
  ${navigatorSrc}
  ${careSrc}
  return {
    fdCare,
    fdCareNavigator,
    fdCareNavigatorEntries,
    fdCareNavigatorSelection,
  };
`)();
```

Add these tests with the exact approved mappings from Task 1:

```js
test('the navigator renders six fixed choices and no initial result', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  const html = F.fdCareNavigator(index, '');
  assert.equal((html.match(/data-fd-care-intent=/g) || []).length, 6);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 6);
  assert.match(html, /Choose the task—not patient details/);
  assert.doesNotMatch(html, /Best starting point|data-fd-care-clear/);
});

test('every intent resolves canonical primary and alternative records', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  for (const [id, primaryId, alternativeIds] of expectedNavigator) {
    const selected = F.fdCareNavigatorSelection(index, id);
    assert.equal(selected.primary.id, primaryId, id);
    assert.deepEqual(selected.alternatives.map((item) => item.id), alternativeIds, id);
    const html = F.fdCareNavigator(index, id);
    assert.match(html, /Best starting point/);
    assert.equal((html.match(/data-care-recommendation=/g) || []).length,
      1 + alternativeIds.length);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  }
});

test('an unknown selected intent returns the complete unselected navigator', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  assert.equal(F.fdCareNavigatorSelection(index, 'not-an-intent'), null);
  const html = F.fdCareNavigator(index, 'not-an-intent');
  assert.equal((html.match(/data-fd-care-intent=/g) || []).length, 6);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 6);
  assert.doesNotMatch(html, /Best starting point|data-fd-care-clear/);
});

test('malformed navigator data fails soft without hiding the five-resource shelf', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: [{ id: 'broken', label: 'Broken', explanation: 'Broken mapping',
      primaryResourceId: 'missing', alternativeResourceIds: ['book-shelf'] }] };
  assert.equal(F.fdCareNavigator(index, 'broken'), '');
  const page = F.fdCare(index, 'broken');
  assert.equal((page.match(/class="fd-carelink"/g) || []).length, 5);
});

test('invalid alternatives drop while the valid primary remains', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: [{ id: 'partial', label: 'Partial choice',
      explanation: 'A valid primary remains available to the learner.',
      primaryResourceId: 'education-library',
      alternativeResourceIds: ['missing', 'book-shelf', 'book-shelf', 'education-library'] }] };
  const selected = F.fdCareNavigatorSelection(index, 'partial');
  assert.equal(selected.primary.id, 'education-library');
  assert.deepEqual(selected.alternatives.map((item) => item.id), ['book-shelf']);
});

test('navigator rendering escapes every supplied field and stays browser-global free', () => {
  const index = {
    careResources: [{ id: 'safe', title: '<img src=x onerror=1>',
      description: '<script>bad()</script>', url: 'https://example.test/&bad' }],
    careNavigator: [{ id: 'intent', label: '<b>label</b>',
      explanation: '<svg onload=bad()>', primaryResourceId: 'safe',
      alternativeResourceIds: [] }],
  };
  const html = F.fdCareNavigator(index, 'intent');
  assert.doesNotMatch(html, /<img|<script|<svg/);
  assert.match(html, /&lt;b&gt;label&lt;\/b&gt;/);
  assert.match(html, /https:\/\/example\.test\/&amp;bad/);
  const hostileIdIndex = { careResources: index.careResources,
    careNavigator: [{ id: 'intent" onclick="bad()', label: 'Unsafe identifier',
      explanation: 'This malformed identifier must never enter a selector or attribute.',
      primaryResourceId: 'safe', alternativeResourceIds: [] }] };
  assert.equal(F.fdCareNavigator(hostileIdIndex, 'intent" onclick="bad()'), '');
  assert.doesNotMatch(navigatorSrc,
    /localStorage\.|sessionStorage\.|document\.|window\.|fetch\(|XMLHttpRequest|cwAnalytics|\.record\(|\bconst\s|\blet\s|=>/);
});
```

- [ ] **Step 2: Run the renderer tests and confirm the module is missing**

Run:

```bash
node --test --test-name-pattern='navigator|malformed|invalid alternatives' tests/fd-care.test.mjs
```

Expected: FAIL because `fd_care_navigator.js` and its functions do not exist.

- [ ] **Step 3: Implement the pure resolver and renderer**

Create `fd_care_navigator.js` with these functions and no browser-global access:

```js
/* Fixed-choice Care navigator. Pure ES5: curriculum in, escaped HTML out. */

function fdCareNavigatorEntries(index){
  var idx=index||{}, resources=Array.isArray(idx.careResources)?idx.careResources:[];
  var intents=Array.isArray(idx.careNavigator)?idx.careNavigator:[], byId={}, out=[];
  var seenIntents={};
  var idPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var i,j,intent,primary,alternatives,seen,alternative;
  for(i=0;i<resources.length;i++){
    if(resources[i]&&typeof resources[i].id==='string'&&idPattern.test(resources[i].id)&&
       typeof resources[i].title==='string'&&resources[i].title&&
       typeof resources[i].description==='string'&&resources[i].description&&
       typeof resources[i].url==='string'&&/^https:\/\//.test(resources[i].url)){
      byId[resources[i].id]=resources[i];
    }
  }
  for(i=0;i<intents.length;i++){
    intent=intents[i];
    if(!intent||typeof intent.id!=='string'||!idPattern.test(intent.id)||
       typeof intent.label!=='string'||!intent.label||
       typeof intent.explanation!=='string'||!intent.explanation||seenIntents[intent.id]) continue;
    seenIntents[intent.id]=true;
    primary=byId[intent.primaryResourceId];
    if(!primary) continue;
    alternatives=[];
    seen={};
    seen[primary.id]=true;
    for(j=0;j<(intent.alternativeResourceIds||[]).length&&alternatives.length<2;j++){
      alternative=byId[intent.alternativeResourceIds[j]];
      if(!alternative||seen[alternative.id]) continue;
      seen[alternative.id]=true;
      alternatives.push(alternative);
    }
    out.push({
      id:intent.id,
      label:intent.label,
      explanation:intent.explanation,
      primary:primary,
      alternatives:alternatives
    });
  }
  return out;
}

function fdCareNavigatorSelection(index,selectedIntentId){
  var entries=fdCareNavigatorEntries(index), selected=String(selectedIntentId||'');
  for(var i=0;i<entries.length;i++) if(entries[i].id===selected) return entries[i];
  return null;
}

function fdCareNavigatorLink(item,kicker){
  return '<a class="fd-care-navigator__link" data-care-recommendation="'+fdEsc(item.id)+'" '+
    'data-care-resource="'+fdEsc(item.id)+'" href="'+fdEsc(item.url)+'" target="_blank" '+
    'rel="noopener noreferrer"><span class="fd-care-navigator__kicker">'+fdEsc(kicker)+'</span>'+
    '<span class="fd-care-navigator__link-title">'+fdEsc(item.title)+'</span>'+
    '<span class="fd-care-navigator__link-description">'+fdEsc(item.description)+'</span></a>';
}

function fdCareNavigator(index,selectedIntentId){
  var entries=fdCareNavigatorEntries(index);
  if(!entries.length) return '';
  var selected=fdCareNavigatorSelection(index,selectedIntentId), out='';
  out+='<section class="fd-care-navigator" aria-labelledby="fd-care-navigator-title">'+
    '<div class="fd-care-navigator__head"><h2 id="fd-care-navigator-title">What are you trying to do?</h2>'+
    '<p>Choose the task—not patient details.</p></div><div class="fd-care-navigator__choices">';
  for(var i=0;i<entries.length;i++){
    var active=!!selected&&selected.id===entries[i].id;
    out+='<button type="button" class="fd-care-navigator__choice'+(active?' is-selected':'')+'" '+
      'data-fd-care-intent="'+fdEsc(entries[i].id)+'" aria-pressed="'+(active?'true':'false')+'">'+
      '<span class="fd-care-navigator__check" aria-hidden="true">✓</span>'+
      '<span>'+fdEsc(entries[i].label)+'</span></button>';
  }
  out+='</div>';
  if(selected){
    out+='<span class="fd-visually-hidden" role="status" aria-live="polite">Selected '+
      fdEsc(selected.label)+'. Best starting point: '+fdEsc(selected.primary.title)+'.</span>'+
      '<section class="fd-care-navigator__result" aria-labelledby="fd-care-navigator-result-title">'+
      '<div class="fd-care-navigator__result-head"><h3 id="fd-care-navigator-result-title">Your starting point</h3>'+
      '<p>'+fdEsc(selected.explanation)+'</p></div>'+
      fdCareNavigatorLink(selected.primary,'Best starting point');
    if(selected.alternatives.length){
      out+='<div class="fd-care-navigator__alternatives" aria-label="Also useful">';
      for(var j=0;j<selected.alternatives.length;j++){
        out+=fdCareNavigatorLink(selected.alternatives[j],'Also useful');
      }
      out+='</div>';
    }
    out+='<button type="button" class="fd-care-navigator__clear" data-fd-care-clear>Clear choice</button></section>';
  }
  return out+'</section>';
}
```

- [ ] **Step 4: Register and compose the module**

Add this marker immediately before `FD_CARE` in `common.py` and `spa_index.html`:

```python
    "/*__FD_CARE_NAVIGATOR__*/": "frontdoor/fd_care_navigator.js",
```

```html
  /*__FD_CARE_NAVIGATOR__*/
```

Change the Care renderer signature and insert the navigator between the notice and groups:

```js
function fdCare(index,selectedIntentId){
  var idx=index||{}, resources=idx.careResources||[];
  return '<section class="fd-care-page" aria-labelledby="fd-care-title">'+
    '<header class="fd-care-page__head"><p class="fd-care-page__source">ReConnect collection</p>'+
    '<h1 id="fd-care-title">Patient care resources</h1>'+
    '<p class="fd-care-page__intro">Shortcuts for finding support, planning follow-up, and sharing understandable information during supervised care.</p>'+
    '<div class="fd-care-page__provenance" aria-label="Collection provenance"><strong>Created by Joshua Moss, MD</strong>'+
    '<span>Apps built from personally curated ReConnect databases developed over several years.</span></div></header>'+
    '<div class="fd-care-page__notice" role="note"><strong>Verify current details before sharing</strong><span>Resources open in a new tab. Do not enter patient-identifying information.</span></div>'+
    fdCareNavigator(idx,selectedIntentId)+
    '<div class="fd-care-page__groups">'+
    fdCareGroup(resources,'support','Find support and follow-up','Use while planning services, recovery support, or discharge follow-up.')+
    fdCareGroup(resources,'education','Teach and share','Plain-language guides, curated listening, and books for patients and families.')+
    '</div></section>';
}
```

Pass transient selection from `fdBaseMarkup()`:

```js
    if(state.tab==='care') return fdSurface('care',function(){
      return fdCare(FD_INDEX,state.careIntentId||'');
    });
```

Extend the registration test to require the new marker before `FD_CARE`.

- [ ] **Step 5: Run the complete Care renderer suite**

Run:

```bash
node --test tests/fd-care.test.mjs
```

Expected: all Care tests pass; the initial page still contains exactly five `.fd-carelink` anchors and selected recommendations use `.fd-care-navigator__link`.

- [ ] **Step 6: Commit the pure navigator**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_navigator.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_care.js \
  13_Faculty_Resources/_automation/site_build/common.py \
  13_Faculty_Resources/_automation/site_build/spa_index.html \
  tests/fd-care.test.mjs
git commit -m "feat(care): render resource navigator"
```

---

### Task 4: Add visit-only selection, reset, and focus behavior

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:7-59,492-512,905-916,1109-1135,1390-1490`
- Modify: `tests/fd-wire.test.mjs:5-30,780-823,930-1035`
- Modify: `tests/fd-state.test.mjs:67-86`
- Modify: `tests/fd-action-contract.test.mjs:23-70`

**Interfaces:**
- Consumes: `fdCareNavigatorSelection(index, selectedIntentId)` from Task 3 and renderer attributes `data-fd-care-intent`, `data-fd-care-clear`.
- Produces: transient controller state `state.careIntentId: string`; `fdDispatch()` results with no route or effect for selection and clear actions.

- [ ] **Step 1: Load the navigator helper and add failing dispatch tests**

Load `frontdoor/fd_care_navigator.js` between `data` and `wire` in the `fd-wire.test.mjs` test factory. Add a two-intent index fixture:

```js
const CARE_INDEX = {
  byRef: {}, weeks: FOUR_INDEX.weeks,
  careResources: [
    { id: 'resource-finder', title: 'Find services', description: 'Find support',
      url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html' },
    { id: 'meeting-calendar', title: 'Find meetings', description: 'Find recovery meetings',
      url: 'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html' },
  ],
  careNavigator: [
    { id: 'services', label: 'Find community services', explanation: 'Start with services.',
      primaryResourceId: 'resource-finder', alternativeResourceIds: ['meeting-calendar'] },
  ],
};
```

Add pure-dispatch tests:

```js
test('care intent selection and clear are route-free visit-only patches', () => {
  assert.deepEqual(F.fdDispatch({ 'data-fd-care-intent': 'services' },
    { index: CARE_INDEX }, { ...roleContext, tab: 'care' }), {
    patch: { careIntentId: 'services' }, route: null, effect: null,
  });
  assert.deepEqual(F.fdDispatch({ 'data-fd-care-intent': 'missing' },
    { index: CARE_INDEX }, { ...roleContext, tab: 'care' }), {
    patch: { careIntentId: '' }, route: null, effect: null,
  });
  assert.deepEqual(F.fdDispatch({ 'data-fd-care-clear': '' },
    { index: CARE_INDEX }, { ...roleContext, tab: 'care', careIntentId: 'services' }), {
    patch: { careIntentId: '' }, route: null, effect: null,
  });
});

test('leaving Care clears a transient intent while Care-to-Care does not invent one', () => {
  const away = F.fdDispatch({ 'data-fd-tab': 'library' }, { search: '?tab=care' },
    { ...roleContext, tab: 'care', careIntentId: 'services' });
  assert.equal(away.patch.careIntentId, '');
  const enter = F.fdDispatch({ 'data-fd-tab': 'care' }, { search: '?tab=library' },
    { ...roleContext, tab: 'library' });
  assert.equal(Object.hasOwn(enter.patch, 'careIntentId'), false);
});
```

- [ ] **Step 2: Add failing controller storage, history, and focus tests**

Use `fakeHarness()` with a replacement selected button and first choice:

```js
test('care selection rerenders, stays out of storage and history, and restores focus', () => {
  const storage = memStorage({ cw_frontdoor_v1: JSON.stringify({ role: 'first-role', tab: 'care' }) });
  const LocalF = make(storage);
  const renders = [];
  const historyCalls = [];
  const selected = { focused: 0, focus() { this.focused += 1; } };
  const first = { focused: 0, focus() { this.focused += 1; } };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'care' }, {
    F: LocalF,
    index: CARE_INDEX,
    render: (...args) => renders.push(args),
    querySelector: (selector) => {
      if (selector === '[data-fd-care-intent="services"]') return selected;
      if (selector === '[data-fd-care-intent]') return first;
      return null;
    },
    history: {
      replaceState: (...args) => historyCalls.push(['replace', ...args]),
      pushState: (...args) => historyCalls.push(['push', ...args]),
    },
  });
  const initialHistoryCount = historyCalls.length;
  const beforeStorage = storage.dump();

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-care-intent': 'services' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().careIntentId, 'services');
  assert.equal(renders.length, 1);
  assert.deepEqual(storage.dump(), beforeStorage);
  assert.equal(historyCalls.length, initialHistoryCount);
  assert.equal(selected.focused, 1);

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-care-clear': '' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().careIntentId, '');
  assert.equal(first.focused, 1);
});
```

Extend `fdSave persists only whitelisted keys, never done/streak/week` with the visit-only field:

```js
  fdSave({ role: 'ms3', done: { 'x.md': true }, streak: 9, week: 3,
    careIntentId: 'services' });
  const out = fdLoad();
  assert.equal(out.careIntentId, undefined);
```

Add `data-fd-care-clear` and `data-fd-care-intent` in sorted order to the exact emitted-attribute
inventory in `fd-action-contract.test.mjs`, then pin their distinct meanings:

```js
test('Care navigator actions are distinct visit-only controller semantics', () => {
  assert.equal(F.semantic('data-fd-care-intent'), 'choose a transient Care navigator task');
  assert.equal(F.semantic('data-fd-care-clear'), 'clear the transient Care navigator task');
  assert.notEqual(F.semantic('data-fd-care-intent'), F.semantic('data-fd-care-clear'));
});
```

- [ ] **Step 3: Run the controller tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='care intent|leaving Care|care selection' tests/fd-wire.test.mjs
```

Expected: FAIL because the new actions are not registered and selection does not change controller state.

- [ ] **Step 4: Add action semantics and pure dispatch**

Add both attributes to `FD_HANDLED_ATTRS`, `FD_ACTION_SEMANTICS`, and `FD_ACTION_SELECTOR`:

```js
  'data-fd-care-intent':'choose a transient Care navigator task',
  'data-fd-care-clear':'clear the transient Care navigator task'
```

```js
  '[data-fd-care-intent],[data-fd-care-clear],'+
```

Add these branches before the tab branch in `fdDispatch()`:

```js
  if(fdOwn(a,'data-fd-care-intent')){
    var careIntent=String(a['data-fd-care-intent']||'');
    var careChoice=typeof fdCareNavigatorSelection==='function'
      ?fdCareNavigatorSelection(c.index||{},careIntent):null;
    return {patch:{careIntentId:careChoice?careChoice.id:''},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-care-clear')){
    return {patch:{careIntentId:''},route:null,effect:null};
  }
```

Extend the tab patch without clearing a fresh Care entry:

```js
    patch={tab:tab,openId:null,searchOpen:false};
    if(tab!=='care') patch.careIntentId='';
```

- [ ] **Step 5: Make selection a base-only, nonpersistent transition and restore focus**

Add `careIntentId` to `baseChanged()`:

```js
    var keys=['openId','tab','screen','libraryView','kitSection','kitToolPreview','careIntentId'];
```

Replace the `kitOnly` save exemption with a visit-only check that excludes only the three named transient controls:

```js
    var visitOnly=fdOwn(patch,'kitSection')||fdOwn(patch,'kitToolPreview')||
      fdOwn(patch,'careIntentId');
    for(var saveKey in patch){
      if(fdOwn(patch,saveKey)&&saveKey!=='kitSection'&&saveKey!=='kitToolPreview'&&
         saveKey!=='careIntentId') visitOnly=false;
    }
    if(!visitOnly) fdSave(state);
```

After the existing Essentials focus restoration, add:

```js
    if(fdOwn(patch,'careIntentId')&&!afterOverlay&&!beforeHadOverlay&&root&&root.querySelector){
      var careFocus=state.careIntentId
        ?root.querySelector('[data-fd-care-intent="'+state.careIntentId+'"]')
        :root.querySelector('[data-fd-care-intent]');
      if(careFocus&&careFocus.focus) try{careFocus.focus();}catch(_){}
    }
```

Do not add `careIntentId` to `FD_KEYS`, `historySnapshot()`, `fdResolveState()`, or URL routing.

- [ ] **Step 6: Run the full controller and state suites**

Run:

```bash
node --test tests/fd-wire.test.mjs tests/fd-state.test.mjs tests/fd-action-contract.test.mjs
```

Expected: all tests pass; action semantics are named, and selection produces no storage or history mutation.

- [ ] **Step 7: Commit transient interaction behavior**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js \
  tests/fd-wire.test.mjs tests/fd-state.test.mjs tests/fd-action-contract.test.mjs
git commit -m "feat(care): add transient navigator selection"
```

---

### Task 5: Style and document the accessible responsive surface

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css:565-588,1568-1574`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md:264-294`
- Modify: `tests/fd-care.test.mjs`
- Modify: `tests/spa-shell-a11y.test.mjs`
- Modify: `tests/fd-contrast.test.mjs:45-76`

**Interfaces:**
- Consumes: navigator classes and `aria-pressed` state from Task 3.
- Produces: a two-column desktop/one-column phone choice layout, visible non-color selection cue, 44-pixel targets, and documented class contract.

- [ ] **Step 1: Add failing CSS and accessibility-contract assertions**

Read `frontdoor.css` and the class inventory in `fd-care.test.mjs`, then add:

```js
test('the navigator stylesheet and class inventory pin responsive accessible behavior', () => {
  const css = readFileSync(new URL(`${BUILD}/frontdoor/frontdoor.css`, import.meta.url), 'utf8');
  const inventory = readFileSync(new URL(
    '../docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md', import.meta.url), 'utf8');
  assert.match(css, /\.fd-care-navigator__choice\{[^}]*min-height:var\(--fd-target-touch\)/);
  assert.match(css, /\.fd-care-navigator__choice\[aria-pressed="true"\]/);
  assert.match(css, /\.fd-care-navigator__choice\[aria-pressed="true"\] \.fd-care-navigator__check\{[^}]*color:var\(--fd-on-accent\)/);
  assert.match(css, /\.fd-care-navigator__choice>span:last-child\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.fd-care-navigator__choices\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(inventory, /\.fd-care-navigator__choice/);
  assert.match(inventory, /\.fd-care-navigator__choice\.is-selected/);
});
```

Extend the accessibility source test to require native buttons, `aria-pressed`, the polite status,
and a labeled result region:

```js
assert.match(navigatorSrc, /<button type="button" class="fd-care-navigator__choice/);
assert.match(navigatorSrc, /aria-pressed=/);
assert.match(navigatorSrc, /role="status" aria-live="polite"/);
assert.match(navigatorSrc, /aria-labelledby="fd-care-navigator-result-title"/);
```

- [ ] **Step 2: Run the focused style tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='navigator stylesheet|Care navigator' tests/fd-care.test.mjs tests/spa-shell-a11y.test.mjs
```

Expected: FAIL because the navigator classes have no CSS or inventory entries.

- [ ] **Step 3: Add the navigator styles**

Add this block after the existing Care notice rules:

```css
.fd-care-navigator{margin:0 0 var(--fd-space-10);padding:var(--fd-space-6);border:1px solid var(--fd-line);border-radius:var(--fd-radius-lg);background:var(--fd-surface)}
.fd-care-navigator__head{max-width:calc(var(--fd-space-10) * 15);margin-bottom:var(--fd-space-5)}
.fd-care-navigator__head h2{margin:0 0 var(--fd-space-2);font-family:Georgia,'Times New Roman',serif;font-size:var(--fd-font-xl);line-height:1.3}
.fd-care-navigator__head p{margin:0;color:var(--fd-text-mid);font-size:var(--fd-font-sm);line-height:1.5}
.fd-care-navigator__choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--fd-space-3)}
.fd-care-navigator__choice{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:var(--fd-space-3);min-height:var(--fd-target-touch);padding:var(--fd-space-3) var(--fd-space-4);border:1px solid var(--fd-line);border-radius:var(--fd-radius-md);background:var(--fd-bg);color:var(--fd-text);font:inherit;font-size:var(--fd-font-sm);font-weight:700;text-align:left;cursor:pointer}
.fd-care-navigator__choice:hover{border-color:var(--fd-olive)}
.fd-care-navigator__choice:focus-visible,.fd-care-navigator__clear:focus-visible,.fd-care-navigator__link:focus-visible{outline:3px solid var(--fd-focus);outline-offset:2px}
.fd-care-navigator__check{display:grid;place-items:center;width:22px;height:22px;border:1px solid var(--fd-line);border-radius:var(--fd-radius-circle);color:transparent;font-weight:800}
.fd-care-navigator__choice>span:last-child{min-width:0;overflow-wrap:anywhere}
.fd-care-navigator__choice[aria-pressed="true"]{border-color:var(--fd-olive-deep);background:var(--fd-olive-wash);box-shadow:inset 3px 0 0 var(--fd-olive-deep)}
.fd-care-navigator__choice[aria-pressed="true"] .fd-care-navigator__check{border-color:var(--fd-olive-deep);background:var(--fd-olive-deep);color:var(--fd-on-accent)}
.fd-care-navigator__result{margin-top:var(--fd-space-6);padding-top:var(--fd-space-6);border-top:1px solid var(--fd-line)}
.fd-care-navigator__result-head{max-width:calc(var(--fd-space-10) * 15);margin-bottom:var(--fd-space-4)}
.fd-care-navigator__result-head h3{margin:0 0 var(--fd-space-2);font-size:var(--fd-font-lg)}
.fd-care-navigator__result-head p{margin:0;color:var(--fd-text-mid);font-size:var(--fd-font-sm);line-height:1.5;overflow-wrap:anywhere}
.fd-care-navigator__alternatives{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--fd-space-3);margin-top:var(--fd-space-3)}
.fd-care-navigator__link{display:block;min-height:var(--fd-target-touch);padding:var(--fd-space-4);border:1px solid var(--fd-line);border-radius:var(--fd-radius-md);color:var(--fd-text);text-decoration:none}
.fd-care-navigator__link:hover{border-color:var(--fd-olive);background:var(--fd-bg)}
.fd-care-navigator__kicker{display:block;margin-bottom:var(--fd-space-1);color:var(--fd-olive-deep);font-size:var(--fd-font-xs);font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.fd-care-navigator__link-title{display:block;font-size:var(--fd-font-sm);font-weight:750;line-height:1.35;overflow-wrap:anywhere}
.fd-care-navigator__link-description{display:block;margin-top:2px;color:var(--fd-text-mid);font-size:var(--fd-font-xs);line-height:1.4;overflow-wrap:anywhere}
.fd-care-navigator__clear{min-height:var(--fd-target-touch);margin-top:var(--fd-space-4);padding:var(--fd-space-2) var(--fd-space-3);border:0;background:transparent;color:var(--fd-olive-deep);font:inherit;font-size:var(--fd-font-sm);font-weight:750;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
```

Inside the existing `@media (max-width:640px)` Care block add:

```css
  .fd-care-navigator{padding:var(--fd-space-5)}
  .fd-care-navigator__choices,.fd-care-navigator__alternatives{grid-template-columns:minmax(0,1fr)}
```

- [ ] **Step 4: Extend the class inventory with exact nesting and state ownership**

Insert this subtree between `.fd-care-page__notice` and `.fd-care-page__groups`:

```text
  .fd-care-navigator
    .fd-care-navigator__head
      h2 / p
    .fd-care-navigator__choices
      .fd-care-navigator__choice <button> ×6
        .fd-care-navigator__check
        span
      .fd-care-navigator__choice.is-selected [aria-pressed="true"]
    .fd-visually-hidden role="status" aria-live="polite"
    .fd-care-navigator__result
      .fd-care-navigator__result-head
        h3 / p
      .fd-care-navigator__link <a> primary
        .fd-care-navigator__kicker / __link-title / __link-description
      .fd-care-navigator__alternatives
        .fd-care-navigator__link <a> ×0–2
      .fd-care-navigator__clear <button>
```

Add table entries stating that `.is-selected` belongs only to the active choice, the full resource
groups remain siblings below the navigator, and no navigator class participates in completion or
attestation.

Add `['fd-on-accent', 'fd-olive-deep', 4.5]` to `PAIRS` in `tests/fd-contrast.test.mjs` so the
new selected-check ink/background combination is checked in both light and dark palettes.

- [ ] **Step 5: Run style, accessibility, and contrast gates**

Run:

```bash
node --test tests/fd-care.test.mjs tests/spa-shell-a11y.test.mjs tests/fd-contrast.test.mjs
```

Expected: all tests pass; no unknown token or contrast regression is reported.

- [ ] **Step 6: Commit styles and their human contract together**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css \
  docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md \
  tests/fd-care.test.mjs tests/spa-shell-a11y.test.mjs tests/fd-contrast.test.mjs
git commit -m "style(care): add accessible navigator layout"
```

---

### Task 6: Prove MS3, resident, and APP browser behavior

**Files:**
- Modify: `tests/smoke/front-door.spec.js:1790-1858`
- Modify: `tests/smoke/app-pathway.spec.js:209-233`

**Interfaces:**
- Consumes: built MS3/resident Front Door, six navigator controls, transient controller state, and canonical external anchors from Tasks 1-5.
- Produces: end-to-end proof for mappings, keyboard/focus behavior, fixed URLs, privacy boundaries, phone/zoom layout, fallback, and APP availability.

- [ ] **Step 1: Extend the shared Care browser journey**

Add the approved browser mapping near `expectedUrls`:

```js
  const navigatorCases = [
    ['services', 'resource-finder', ['meeting-calendar']],
    ['meetings', 'meeting-calendar', ['resource-finder']],
    ['explain', 'education-library', ['book-shelf', 'podcast-navigator']],
    ['listen', 'podcast-navigator', ['education-library', 'book-shelf']],
    ['books', 'book-shelf', ['education-library', 'podcast-navigator']],
    ['family-conversation', 'education-library', ['book-shelf', 'podcast-navigator']],
  ];
```

After the existing five-link assertions, add:

```js
  const fullListOrder = await links.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-care-resource')));
  await expect(page.locator('[data-fd-care-intent]')).toHaveCount(6);
  const originalUrl = page.url();
  const storageBefore = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
  }));
  const cookiesBefore = await page.context().cookies();

  for (const [intentId, primaryId, alternativeIds] of navigatorCases) {
    const choice = page.locator(`[data-fd-care-intent="${intentId}"]`);
    await choice.focus();
    await page.keyboard.press('Enter');
    await expect(choice).toBeFocused();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.fd-care-navigator__result')).toBeVisible();
    await expect(page.locator('.fd-care-navigator__link').first())
      .toHaveAttribute('data-care-resource', primaryId);
    expect(await page.locator('.fd-care-navigator__alternatives .fd-care-navigator__link')
      .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-care-resource'))))
      .toEqual(alternativeIds);
    expect(await links.evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-care-resource')))).toEqual(fullListOrder);
  }

  const storageAfter = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
  }));
  expect(storageAfter).toEqual(storageBefore);
  expect(await page.context().cookies()).toEqual(cookiesBefore);
  expect(page.url()).toBe(originalUrl);

  const orderedChoices = page.locator('[data-fd-care-intent]');
  await orderedChoices.first().focus();
  for (let index = 0; index < navigatorCases.length; index += 1) {
    await expect(orderedChoices.nth(index)).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('.fd-care-navigator__link').first()).toBeFocused();
```

Add exact popup and Clear behavior:

```js
  await page.locator('[data-fd-care-intent="services"]').click();
  const recommended = page.locator('[data-care-recommendation="resource-finder"]');
  const recommendationPopup = page.waitForEvent('popup');
  await recommended.click();
  const recommendationPage = await recommendationPopup;
  await expect.poll(() => recommendationPage.url()).toBe(expectedUrls[0]);
  await recommendationPage.close();
  await expect(careTab).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.fd-reader,.fd-search')).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
  await page.locator('[data-fd-care-clear]').click();
  await expect(page.locator('[data-fd-care-intent]').first()).toBeFocused();
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);

  await page.keyboard.press('Space');
  await expect(page.locator('[data-fd-care-intent]').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-fd-tab="library"]').click();
  await page.locator('[data-fd-tab="care"]').click();
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);
  await page.locator('[data-fd-care-intent="services"]').click();
  await page.reload();
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);
```

- [ ] **Step 2: Add phone, zoom, and fallback assertions**

Inject schema-bounded, unbroken label/explanation copy through the controlled browser fixture, then
verify the true 320-pixel phone layout, one-column order, target size, and horizontal fit:

```js
  await page.evaluate(() => {
    const services = FD_INDEX.careNavigator.find(intent => intent.id === 'services');
    services.label = 'W'.repeat(64);
    services.explanation = 'W'.repeat(160);
    fdController.dispatch({ 'data-fd-care-intent': 'services' });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  const firstChoice = await page.locator('[data-fd-care-intent]').nth(0).boundingBox();
  const secondChoice = await page.locator('[data-fd-care-intent]').nth(1).boundingBox();
  expect(firstChoice).not.toBeNull();
  expect(secondChoice).not.toBeNull();
  expect(Math.abs(secondChoice.x - firstChoice.x)).toBeLessThan(1);
  expect(secondChoice.y).toBeGreaterThan(firstChoice.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const choice of await page.locator('[data-fd-care-intent]').all()) {
    const box = await choice.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
```

Then verify the same effective width under 200% document zoom:

```js
  await page.setViewportSize({ width: 640, height: 844 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
```

Exercise the controlled no-navigator fallback without changing live registry data:

```js
  await page.evaluate(() => {
    FD_INDEX.careNavigator = [];
    fdController.dispatch({ 'data-fd-tab': 'today' });
    fdController.dispatch({ 'data-fd-tab': 'care' });
  });
  await expect(page.locator('.fd-care-navigator')).toHaveCount(0);
  await expect(page.locator('.fd-carelink')).toHaveCount(5);
```

- [ ] **Step 3: Extend the APP phone journey**

After APP opens the Care tab, add:

```js
  await expect(page.locator('[data-fd-care-intent]')).toHaveCount(6);
  await page.locator('[data-fd-care-intent="meetings"]').click();
  await expect(page.locator('.fd-care-navigator__link').first())
    .toHaveAttribute('data-care-resource', 'meeting-calendar');
  await expect(page.locator('.fd-carelink')).toHaveCount(5);
```

- [ ] **Step 4: Build both audiences sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both builds and static QA gates pass; neither build reports an orphaned page, storage-key violation, or malformed curriculum.

- [ ] **Step 5: Run the targeted Playwright journeys against local builds**

Start temporary servers in separate terminals:

```bash
python3 -m http.server 8780 --directory _build/ms3
```

```bash
python3 -m http.server 8781 --directory _build/res
```

Then run:

```bash
cd tests/smoke
MS3_BASE_URL=http://127.0.0.1:8780 RES_BASE_URL=http://127.0.0.1:8781 \
  npx playwright test front-door.spec.js app-pathway.spec.js \
  --project=nav-ms3 --project=nav-res \
  --grep='Patient care resources|APP workspace stacks'
```

Expected: the shared Care journey passes for MS3 and resident, and the APP journey passes on the resident project with its intentional MS3 skip.

- [ ] **Step 6: Commit browser acceptance coverage**

```bash
git add tests/smoke/front-door.spec.js tests/smoke/app-pathway.spec.js
git commit -m "test(care): cover navigator journeys"
```

---

### Task 7: Run the repository-wide release gate and prepare review

**Files:**
- Verify only: all files changed in Tasks 1-6

**Interfaces:**
- Consumes: the complete implementation and every focused test from Tasks 1-6.
- Produces: a clean, reviewable branch with full local evidence; it does not merge, deploy, or claim production readiness.

- [ ] **Step 1: Run the full registry and Node suites**

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
node --test tests/*.test.mjs
```

Expected: every command exits 0. Record the final Node pass/skip/fail counts in the PR handoff.

- [ ] **Step 2: Run the one-command local gate**

```bash
bash bin/verify.sh
```

Expected: `ALL CHECKS PASSED`. Read any ratchet findings printed by the gate; a pass means the counts are at or below baseline, not necessarily zero.

- [ ] **Step 3: Re-run the final targeted browser proof on the freshly built outputs**

```bash
cd tests/smoke
MS3_BASE_URL=http://127.0.0.1:8780 RES_BASE_URL=http://127.0.0.1:8781 \
  npx playwright test front-door.spec.js app-pathway.spec.js \
  --project=nav-ms3 --project=nav-res \
  --grep='Patient care resources|APP workspace stacks'
```

Expected: all applicable tests pass with only the intentional APP-on-MS3 skip.

- [ ] **Step 4: Audit the final diff and transient-state boundaries**

```bash
git diff --check
git status --short
git diff origin/main...HEAD -- \
  curriculum.json curriculum.schema.json \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_navigator.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css
rg -n 'careIntentId|data-fd-care' \
  13_Faculty_Resources/_automation/site_build/frontdoor tests
rg -n 'careIntentId' 13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js
```

Expected: `git diff --check` is silent; only intended files are changed; the final `rg` against
`fd_state.js` returns no match; no recommendation URL contains a query or fragment.

- [ ] **Step 5: Run the coordination gate before requesting review**

```bash
care_paths_file="$(mktemp /tmp/care-navigator-paths.XXXXXX)"
git diff --name-only origin/main...HEAD > "$care_paths_file"
python3 tools/coordination/collision_report.py \
  --paths-file "$care_paths_file" --format json --check
rm "$care_paths_file"
unset care_paths_file
```

Expected: either `SAFE`, or a named `COORDINATE`/`OCCUPIED` result that is resolved with the owning
work before any push. A coordination result is not permission to overwrite an adjacent Front Door
branch.

- [ ] **Step 6: Request review with explicit evidence boundaries**

The review handoff must state:

- the six exact intent mappings;
- that selections are not persisted, routed, measured, or forwarded;
- that Family Therapy remains in The Essentials;
- the full Node, build, local-gate, and targeted Playwright results;
- whether collision coordination was required; and
- that merge, production deployment, external-site freshness, and faculty approval remain separate evidence states.

Do not push, open a PR, merge, or deploy until the user authorizes that external action.
