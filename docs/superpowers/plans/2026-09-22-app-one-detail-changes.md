# APP “One detail changes” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, nonclinical change-classification rehearsal to each resident-site APP workplace task without scoring, persistence, analytics, or clinical guidance.

**Architecture:** Store three strict nonclinical practice packs inside `curriculum.json`, where the existing audience projection removes them from MS3 with the rest of `appPathway`. Promote the existing pure ES5 practice engine into the Front Door build, let `fd_wire.js` hold an immutable practice session only in controller memory, and let `fd_app.js` render one full-width change-seam surface below the task grid.

**Tech Stack:** Python 3 validators, JSON Schema Draft 7, ES5 JavaScript snippets, Node `node:test`, static HTML/CSS, Playwright 1.63, Netlify static build scripts.

**Spec:** `docs/superpowers/specs/2026-09-22-app-one-detail-changes-design.md`

## Global Constraints

- New practice-pack copy is nonclinical workflow rehearsal only.
- Do not add clinical explanations, local policy, doses, diagnoses, treatment recommendations, readiness claims, or supervisor attestation.
- Do not add answer keys, expected categories, feedback maps, scores, thresholds, pass/fail language, or evaluation results.
- Do not add free text, uploads, microphones, AI/model calls, analytics events, network submission, or durable response storage.
- The only durable APP preference remains `appBridge`; no `appPractice` field may enter `FD_KEYS` or `cw_frontdoor_v1`.
- Use one canonical pack set for PA and PMHNP; do not fork content by bridge.
- Keep `fd_app_practice.js`, `fd_app.js`, and `fd_wire.js` pure ES5.
- Reuse existing Front Door type, spacing, color, focus, and reduced-motion tokens; add no font, dependency, route, page, manifest entry, or shipped-page producer.
- Do not edit `13_Faculty_Resources/reviewed.json`, generate attestation hashes, enable analytics, deploy, merge, or claim fellowship readiness.
- Run MS3 and resident builds sequentially because they share generated output.

---

## File map

- `curriculum.json` — canonical resident APP practice data and activity-to-pack references.
- `curriculum.schema.json` — closed structural contract for practice packs.
- `13_Faculty_Resources/_automation/validate_curriculum.py` — cross-record IDs, exact pack count, neutral-content vocabulary, and activity-reference validation.
- `13_Faculty_Resources/_automation/test_validate_curriculum.py` — validator and Draft 7 regression tests.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js` — pure validation, immutable state transitions, and escaped markup.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js` — APP task entry controls, pack resolution, scoped fallback, and active practice host.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js` — delegated practice actions and transient controller state.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js` — unchanged persistence allowlist, covered by a stronger privacy test.
- `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css` — change-seam layout, responsive stacking, focus, touch targets, and reduced motion.
- `13_Faculty_Resources/_automation/site_build/common.py` and `spa_index.html` — practice-engine snippet registration and injection before the APP renderer.
- `tests/app-practice.test.mjs` — pure engine and CSS contract.
- `tests/app-pathway.test.mjs` — APP renderer and pack-placement contract.
- `tests/fd-wire.test.mjs`, `tests/fd-state.test.mjs`, `tests/fd-action-contract.test.mjs`, `tests/fd-inject.test.mjs` — controller, privacy, action vocabulary, and build injection.
- `tests/parallel-ceilings.test.mjs` — intentional snippet-marker ceiling increase from 31 to 32.
- `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py` — resident retention and MS3 omission of pack data.
- `tests/smoke/app-pathway.spec.js` — both-audience browser, keyboard, phone, privacy, and reduced-motion checks.
- `tests/fixtures/app-practice/nonclinical-cases.json` — delete after tests consume the single canonical pack data from `curriculum.json`.

---

### Task 1: Add the strict nonclinical curriculum contract

**Files:**
- Modify: `curriculum.json`
- Modify: `curriculum.schema.json`
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_curriculum.py`
- Modify: `tests/app-pathway.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`

**Interfaces:**
- Produces: `appPathway.practicePacks: AppPracticePack[3]`.
- Produces: `appPathway.activities[n].practiceId: string` resolving to exactly one pack.
- `AppPracticePack = {id, title, snapshot, change, statements, supervisorQuestions}`.
- `statements` and `supervisorQuestions` each contain exactly three `{id, text}` records.

- [ ] **Step 1: Write failing validator, schema, projection, and canonical-data tests**

Add a `_practice_packs()` helper to `test_validate_curriculum.py` returning the three exact pack shapes shown in Step 3. Update `_curriculum()` so its three activities carry these IDs in order:

```python
PRACTICE_IDS = (
    "training-briefing",
    "workshop-equipment-checkout",
    "community-event-handoff",
)

# In _curriculum()
"practicePacks": _practice_packs(),

# In each activity comprehension
"practiceId": PRACTICE_IDS[index],
```

Add validator mutations that must be rejected:

```python
def test_app_practice_requires_unique_resolved_nonclinical_packs(self):
    mutations = (
        lambda p: p["activities"][0].__setitem__("practiceId", "missing-pack"),
        lambda p: p["practicePacks"][1].__setitem__("id", p["practicePacks"][0]["id"]),
        lambda p: p["practicePacks"][0]["statements"].pop(),
        lambda p: p["practicePacks"][0].__setitem__("change", "A patient detail changed."),
        lambda p: p["practicePacks"][0].__setitem__("score", 1),
    )
    for mutate in mutations:
        with self.subTest(mutate=mutate), tempfile.TemporaryDirectory() as tmp:
            curriculum = _curriculum([])
            mutate(curriculum["appPathway"])
            cpath, root = _write(tmp, curriculum)
            result = _run(cpath, root)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("appPathway.practicePacks", result.stdout)
```

Add a Draft 7 test that first injects `_practice_packs()` and the three `practiceId` values into `_document()`, expects no errors, then independently removes a required property, adds `score`, supplies two statements, and supplies four questions; each mutation must produce an error beneath `/appPathway`.

In `tests/app-pathway.test.mjs`, add:

```js
const PRACTICE_IDS = [
  'training-briefing',
  'workshop-equipment-checkout',
  'community-event-handoff',
];

test('each APP activity resolves one unique nonclinical practice pack', () => {
  const { activities, practicePacks } = CUR.appPathway;
  assert.deepEqual(activities.map((activity) => activity.practiceId), PRACTICE_IDS);
  assert.deepEqual(practicePacks.map((pack) => pack.id), PRACTICE_IDS);
  assert.equal(new Set(practicePacks.map((pack) => pack.id)).size, 3);
  assert.ok(practicePacks.every((pack) =>
    pack.statements.length === 3 && pack.supervisorQuestions.length === 3));
  assert.doesNotMatch(JSON.stringify(practicePacks),
    /clinical|patient|diagnos|medicat|dose|treatment|capacity|suicide|agitation|symptom|disease|disorder|score|pass|fail|correct|answer|competent|entrust|ready/i);
});
```

Extend `test_site_projections_have_expected_placed_counts_and_roles` to assert:

```python
self.assertNotIn("appPathway", ms3["curriculum"])
self.assertEqual(
    [pack["id"] for pack in resident["curriculum"]["appPathway"]["practicePacks"]],
    ["training-briefing", "workshop-equipment-checkout", "community-event-handoff"],
)
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/app-pathway.test.mjs
```

Expected: the new schema acceptance test rejects `practicePacks`/`practiceId` as extra properties; the validator mutation cases remain exit 0; the canonical-data test reports missing packs.

- [ ] **Step 3: Implement the schema, canonical packs, and validator**

Change `appPathway.required` to include `practicePacks`, add a three-item `practicePacks` array referencing a new `appPracticePack` definition, and add required `practiceId` to `appActivity`:

```json
"practicePacks": {
  "type": "array",
  "minItems": 3,
  "maxItems": 3,
  "items": { "$ref": "#/definitions/appPracticePack" }
}
```

```json
"appPracticeText": {
  "type": "object",
  "required": ["id", "text"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    "text": { "type": "string", "minLength": 1 }
  }
},
"appPracticePack": {
  "type": "object",
  "required": ["id", "title", "snapshot", "change", "statements", "supervisorQuestions"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    "title": { "type": "string", "minLength": 1 },
    "snapshot": {
      "type": "array", "minItems": 2, "maxItems": 3,
      "items": { "type": "string", "minLength": 1 }
    },
    "change": { "type": "string", "minLength": 1 },
    "statements": {
      "type": "array", "minItems": 3, "maxItems": 3,
      "items": { "$ref": "#/definitions/appPracticeText" }
    },
    "supervisorQuestions": {
      "type": "array", "minItems": 3, "maxItems": 3,
      "items": { "$ref": "#/definitions/appPracticeText" }
    }
  }
}
```

Set `practiceId` to an enum of the three canonical IDs. Add these exact packs to `curriculum.json`:

```json
"practicePacks": [
  {
    "id": "training-briefing",
    "title": "Training-room briefing",
    "snapshot": [
      "A facilitator asks you to prepare a two-minute update from a shared brief.",
      "The update has a named owner and a scheduled review time."
    ],
    "change": "A source note is now marked unconfirmed.",
    "statements": [
      { "id": "review-time", "text": "The scheduled review time has not changed." },
      { "id": "source-status", "text": "Every source in the brief is confirmed." },
      { "id": "verification-owner", "text": "The person responsible for checking the source note is clear." }
    ],
    "supervisorQuestions": [
      { "id": "name-uncertainty", "text": "Which uncertainty should I name in the update?" },
      { "id": "confirm-owner", "text": "Who should confirm the source note?" },
      { "id": "prepare-review", "text": "What should I prepare before we review it together?" }
    ]
  },
  {
    "id": "workshop-equipment-checkout",
    "title": "Workshop equipment checkout",
    "snapshot": [
      "A workshop kit has a named setup owner.",
      "The delivery window is listed on the shared schedule."
    ],
    "change": "The delivery window moves to after the setup owner leaves.",
    "statements": [
      { "id": "setup-owner", "text": "The setup owner is still named." },
      { "id": "delivery-window", "text": "The kit will arrive during the original delivery window." },
      { "id": "new-time-owner", "text": "The person who will receive the kit at the new time is clear." }
    ],
    "supervisorQuestions": [
      { "id": "handoff-owner", "text": "Who should own the handoff at the new time?" },
      { "id": "plan-parts", "text": "Which parts of the original plan still hold?" },
      { "id": "confirm-before-start", "text": "What needs confirmation before the workshop starts?" }
    ]
  },
  {
    "id": "community-event-handoff",
    "title": "Community event handoff",
    "snapshot": [
      "A volunteer says the welcome table is set up.",
      "One volunteer owns the remaining setup checklist."
    ],
    "change": "The accessibility signs have not arrived.",
    "statements": [
      { "id": "table-status", "text": "The welcome table is set up." },
      { "id": "item-status", "text": "Every setup item has arrived." },
      { "id": "sign-owner", "text": "The person who will obtain the signs is clear." }
    ],
    "supervisorQuestions": [
      { "id": "remaining-owner", "text": "Who should own the remaining setup?" },
      { "id": "handoff-check", "text": "Which part of the handoff needs confirmation?" },
      { "id": "opening-check", "text": "What should be checked before the event opens?" }
    ]
  }
]
```

Add `practiceId` to the three activities in the same order. In `validate_curriculum.py`, change `APP_ACTIVITIES` to these triples and add the content guard:

```python
APP_ACTIVITIES = [
    ("initial-evaluation", "Initial psychiatric evaluation and presentation", "training-briefing"),
    ("medication-follow-through", "Medication plan and follow-through", "workshop-equipment-checkout"),
    ("collateral-transition", "Collateral and safe transition", "community-event-handoff"),
]
APP_PRACTICE_FORBIDDEN_RE = re.compile(
    r"clinical|patient|diagnos|medicat|dose|treatment|capacity|suicide|agitation|"
    r"symptom|disease|disorder|score|pass|fail|correct|answer|competent|entrust|ready",
    re.IGNORECASE,
)
```

Validate exactly three packs, exact canonical order, unique pack/statement/question IDs, two-to-three snapshot strings, three statements, three questions, no extra keys, no forbidden string content, and every activity’s expected `practiceId`. Use explicit expected-key sets and collect errors through the existing `bad()` function:

```python
APP_PRACTICE_KEYS = {
    "id", "title", "snapshot", "change", "statements", "supervisorQuestions",
}
APP_PRACTICE_TEXT_KEYS = {"id", "text"}

practice_packs = app_pathway.get("practicePacks")
if not isinstance(practice_packs, list) or len(practice_packs) != 3:
    bad("appPathway.practicePacks", "must contain exactly three packs")
    practice_packs = practice_packs if isinstance(practice_packs, list) else []
pack_ids = []
for pack_index, pack in enumerate(practice_packs):
    label = "appPathway.practicePacks[%d]" % pack_index
    if not isinstance(pack, dict):
        bad(label, "must be an object")
        continue
    if set(pack) != APP_PRACTICE_KEYS:
        bad(label, "must contain exactly %r" % sorted(APP_PRACTICE_KEYS))
    pack_id = pack.get("id")
    if not isinstance(pack_id, str) or not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", pack_id):
        bad(label, "id must be kebab-case")
    else:
        pack_ids.append(pack_id)
    snapshot = pack.get("snapshot")
    snapshot_values = snapshot if isinstance(snapshot, list) else []
    if not isinstance(snapshot, list) or not 2 <= len(snapshot) <= 3:
        bad(label, "snapshot must contain two or three strings")
    for field in ("statements", "supervisorQuestions"):
        rows = pack.get(field)
        if not isinstance(rows, list) or len(rows) != 3:
            bad(label, "%s must contain exactly three entries" % field)
            rows = rows if isinstance(rows, list) else []
        row_ids = []
        for row in rows:
            if not isinstance(row, dict) or set(row) != APP_PRACTICE_TEXT_KEYS:
                bad(label, "%s entries must contain exactly id and text" % field)
                continue
            row_id = row.get("id")
            if not isinstance(row_id, str):
                bad(label, "%s ids must be strings" % field)
            else:
                row_ids.append(row_id)
        if len(set(row_ids)) != len(row_ids):
            bad(label, "%s ids must be unique" % field)
    for value in [pack.get("title"), pack.get("change")] + snapshot_values + [
        row.get("text") for field in ("statements", "supervisorQuestions")
        for row in (pack.get(field) or []) if isinstance(row, dict)
    ]:
        if not isinstance(value, str) or not value.strip():
            bad(label, "display strings must be non-empty")
        elif APP_PRACTICE_FORBIDDEN_RE.search(value):
            bad(label, "display strings must remain nonclinical and non-evaluative")
if pack_ids != [row[2] for row in APP_ACTIVITIES]:
    bad("appPathway.practicePacks", "pack ids must match the three activity contracts")
```

Report every failure under `appPathway.practicePacks` or the affected activity label rather than raising.

- [ ] **Step 4: Run the focused tests and validators and verify GREEN**

Run:

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/app-pathway.test.mjs
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the curriculum contract**

```bash
git add curriculum.json curriculum.schema.json \
  13_Faculty_Resources/_automation/validate_curriculum.py \
  13_Faculty_Resources/_automation/test_validate_curriculum.py \
  13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py \
  tests/app-pathway.test.mjs
git commit -m "feat: define nonclinical APP practice packs"
```

---

### Task 2: Refactor the pure practice engine around non-evaluative classification

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `tests/app-practice.test.mjs`
- Modify: `tests/fd-action-contract.test.mjs`
- Delete: `tests/fixtures/app-practice/nonclinical-cases.json`

**Interfaces:**
- Consumes: `AppPracticePack` from Task 1.
- Produces: `fdAppPracticeFind(packs, id) -> pack|null`.
- Produces: `fdAppPracticeStart(pack) -> PracticeSession`.
- Produces: `fdAppPracticeReveal(session) -> PracticeSession`.
- Produces: `fdAppPracticeClassify(session, statementId, categoryId) -> PracticeSession`.
- Produces: `fdAppPracticeChooseQuestion(session, questionId) -> PracticeSession`.
- Produces: `fdAppPracticeReset(session) -> PracticeSession`.
- Produces: `fdAppPracticeRender(session) -> escaped HTML string`.
- `PracticeSession = {pack, revealed, classifications, questionId}`.
- Reserves six unique controller actions for the engine’s rendered controls; Task 4 adds their state transitions before browser testing.

- [ ] **Step 1: Replace the old linear-choice tests with failing classification tests**

Load `CUR.appPathway.practicePacks[0]` instead of the fixture file. Add tests with these assertions:

```js
test('one change is hidden until an immutable reveal', () => {
  const session = F.fdAppPracticeStart(pack);
  const before = JSON.stringify(session);
  assert.match(F.fdAppPracticeRender(session), /two-minute update/i);
  assert.doesNotMatch(F.fdAppPracticeRender(session), /marked unconfirmed/i);
  const revealed = F.fdAppPracticeReveal(session);
  assert.equal(JSON.stringify(session), before);
  assert.equal(revealed.revealed, true);
  assert.match(F.fdAppPracticeRender(revealed), /marked unconfirmed/i);
});

test('all three statements must be classified before a fixed question is chosen', () => {
  let session = F.fdAppPracticeReveal(F.fdAppPracticeStart(pack));
  assert.throws(() => F.fdAppPracticeChooseQuestion(session, 'confirm-owner'), /classify/i);
  session = F.fdAppPracticeClassify(session, 'review-time', 'still-known');
  session = F.fdAppPracticeClassify(session, 'source-status', 'changed');
  session = F.fdAppPracticeClassify(session, 'verification-owner', 'clarify');
  const complete = F.fdAppPracticeChooseQuestion(session, 'confirm-owner');
  assert.equal(complete.questionId, 'confirm-owner');
  assert.match(F.fdAppPracticeRender(complete), /Who should confirm the source note/);
  assert.doesNotMatch(F.fdAppPracticeRender(complete), /score|pass|fail|correct|answer key/i);
});

test('reclassification replaces one category and reset clears the session', () => {
  let session = F.fdAppPracticeReveal(F.fdAppPracticeStart(pack));
  session = F.fdAppPracticeClassify(session, 'review-time', 'changed');
  session = F.fdAppPracticeClassify(session, 'review-time', 'still-known');
  assert.deepEqual({ ...session.classifications }, { 'review-time': 'still-known' });
  const reset = F.fdAppPracticeReset(session);
  assert.equal(reset.revealed, false);
  assert.deepEqual({ ...reset.classifications }, {});
  assert.equal(reset.questionId, null);
});
```

Retain and adapt the validation, escaping, unknown-ID, forbidden-field, pure-ES5, and no-I/O tests. Remove the old `feedback`, `stageIndex`, `complete`, and development-only registration assertions.

In `tests/fd-action-contract.test.mjs`, add these attributes to the emitted inventory and to the APP semantic assertion:

```js
const practiceActions = [
  'data-fd-app-practice-open', 'data-fd-app-practice-reveal',
  'data-fd-app-practice-classify', 'data-fd-app-practice-question',
  'data-fd-app-practice-reset', 'data-fd-app-practice-close',
];
for (const attr of practiceActions) {
  assert.ok(F.handled.includes(attr), `${attr} must be reserved before the engine ships`);
  assert.equal(typeof F.semantic(attr), 'string');
}
assert.equal(new Set(practiceActions.map(F.semantic)).size, practiceActions.length);
```

- [ ] **Step 2: Run the engine test and verify RED**

Run:

```bash
node --test tests/app-practice.test.mjs tests/fd-action-contract.test.mjs
```

Expected: FAIL because `fdAppPracticeReveal`, `fdAppPracticeClassify`, and `fdAppPracticeChooseQuestion` do not exist, the old engine expects `stages`/`feedback`, and the six action attributes have no controller vocabulary.

- [ ] **Step 3: Implement the minimal immutable engine**

Keep `FD_APP_PRACTICE_FORBIDDEN`, adding `expectedCategory`, `result`, and `evaluation` as normalized forbidden field names. Define categories once:

```js
var FD_APP_PRACTICE_CATEGORIES=['still-known','changed','clarify'];
```

Validate the exact pack shape, lengths, unique IDs, kebab-case IDs, non-empty strings, and recursive forbidden fields. Implement transitions using fresh objects:

```js
function fdAppPracticeFind(packs,id){
  var list=Array.isArray(packs)?packs:[];
  for(var i=0;i<list.length;i++) if(list[i]&&list[i].id===id) return list[i];
  return null;
}

function fdAppPracticeStart(pack){
  fdAppPracticeValidate(pack);
  return {pack:pack,revealed:false,classifications:{},questionId:null};
}

function fdAppPracticeReveal(session){
  fdAppPracticeValidateSession(session);
  return {pack:session.pack,revealed:true,
    classifications:fdAppPracticeCopy(session.classifications),questionId:session.questionId};
}

function fdAppPracticeClassify(session,statementId,categoryId){
  fdAppPracticeValidateSession(session);
  if(!session.revealed) throw new Error('Reveal the change before classifying statements');
  if(FD_APP_PRACTICE_CATEGORIES.indexOf(categoryId)<0) throw new Error('Unknown category '+categoryId);
  if(!fdAppPracticeHasId(session.pack.statements,statementId)) throw new Error('Unknown statement '+statementId);
  var classifications=fdAppPracticeCopy(session.classifications);
  classifications[statementId]=categoryId;
  return {pack:session.pack,revealed:true,classifications:classifications,questionId:null};
}

function fdAppPracticeChooseQuestion(session,questionId){
  fdAppPracticeValidateSession(session);
  if(!fdAppPracticeAllClassified(session)) throw new Error('Classify every statement first');
  if(!fdAppPracticeHasId(session.pack.supervisorQuestions,questionId)){
    throw new Error('Unknown supervision question '+questionId);
  }
  return {pack:session.pack,revealed:true,
    classifications:fdAppPracticeCopy(session.classifications),questionId:questionId};
}

function fdAppPracticeReset(session){
  fdAppPracticeValidateSession(session);
  return fdAppPracticeStart(session.pack);
}
```

Render the snapshot first; after reveal, render the before/now seam, three `aria-pressed` category groups using `data-fd-app-practice-classify="statementId:categoryId"`, fixed questions using `data-fd-app-practice-question`, and a completion summary that only counts the learner’s own categories. Use this structure so no expected assignment can enter the renderer:

```js
function fdAppPracticeRender(session){
  fdAppPracticeValidateSession(session);
  var pack=session.pack,out='<section class="fd-app-practice'+
    (session.revealed?' is-revealed':'')+'" aria-labelledby="fd-app-practice-title">';
  out+='<div class="fd-app-practice__head"><div><span>One detail changes</span>'+
    '<h2 id="fd-app-practice-title">'+fdAppPracticeEsc(pack.title)+'</h2></div>'+
    '<button type="button" class="fd-app-practice__close" data-fd-app-practice-close>Close</button></div>';
  out+='<div class="fd-app-practice__snapshot"><h3>Starting snapshot</h3><ul>';
  for(var i=0;i<pack.snapshot.length;i++) out+='<li>'+fdAppPracticeEsc(pack.snapshot[i])+'</li>';
  out+='</ul></div>';
  if(!session.revealed){
    out+='<button type="button" class="fd-app-practice__action" data-fd-app-practice-reveal>'+
      'Reveal one change</button>';
  }else{
    out+='<div class="fd-app-practice__change"><div class="fd-app-practice__before">'+
      '<strong>Before</strong><p>'+fdAppPracticeEsc(pack.snapshot[pack.snapshot.length-1])+'</p></div>'+
      '<div class="fd-app-practice__seam" aria-hidden="true">Changed</div>'+
      '<div class="fd-app-practice__now"><strong>Now</strong><p>'+fdAppPracticeEsc(pack.change)+'</p></div></div>';
    for(var s=0;s<pack.statements.length;s++){
      var statement=pack.statements[s],selected=session.classifications[statement.id]||'';
      out+='<div class="fd-app-practice__row"><p>'+fdAppPracticeEsc(statement.text)+'</p>'+
        '<div class="fd-app-practice__choices" role="group" aria-label="Classify statement '+(s+1)+'">';
      for(var c=0;c<FD_APP_PRACTICE_CATEGORIES.length;c++){
        var category=FD_APP_PRACTICE_CATEGORIES[c];
        out+='<button type="button" data-fd-app-practice-classify="'+
          fdAppPracticeEsc(statement.id+':'+category)+'" aria-pressed="'+
          (selected===category?'true':'false')+'">'+fdAppPracticeCategoryLabel(category)+'</button>';
      }
      out+='</div></div>';
    }
    if(fdAppPracticeAllClassified(session)){
      out+='<div class="fd-app-practice__questions" role="group" aria-label="Question to bring to supervision">';
      for(var q=0;q<pack.supervisorQuestions.length;q++){
        var question=pack.supervisorQuestions[q];
        out+='<button type="button" data-fd-app-practice-question="'+fdAppPracticeEsc(question.id)+
          '" aria-pressed="'+(session.questionId===question.id?'true':'false')+'">'+
          fdAppPracticeEsc(question.text)+'</button>';
      }
      out+='</div>';
    }
    if(session.questionId){
      out+='<p class="fd-app-practice__recap" role="status">Question selected for supervision.</p>';
    }
    out+='<button type="button" class="fd-app-practice__reset" data-fd-app-practice-reset>Start again</button>';
  }
  out+='<p class="fd-app-practice__privacy">Private rehearsal. No score, no saved response, and nothing is sent.</p>';
  return out+'</section>';
}
```

`fdAppPracticeCategoryLabel` maps only `still-known` → `Still known`, `changed` → `Changed`, and `clarify` → `Need to clarify`. Escape every pack string and attribute value.

Reserve all six emitted action attributes in `FD_HANDLED_ATTRS` and `FD_ACTION_SELECTOR`, and give each one a distinct plain-language entry in `fdActionSemantic`. Do not implement dispatch in this task; the engine is still unregistered from learner builds, and Task 4 adds every transition test-first before browser verification.

- [ ] **Step 4: Run the engine test and verify GREEN**

Run:

```bash
node --test tests/app-practice.test.mjs tests/fd-action-contract.test.mjs
```

Expected: all engine tests pass with no warnings.

- [ ] **Step 5: Commit the pure engine**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js \
  tests/app-practice.test.mjs tests/fd-action-contract.test.mjs \
  tests/fixtures/app-practice/nonclinical-cases.json
git commit -m "feat: add private APP change practice engine"
```

---

### Task 3: Inject the engine and render practice entries in the APP workspace

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js`
- Modify: `tests/fd-inject.test.mjs`
- Modify: `tests/fd-action-contract.test.mjs`
- Modify: `tests/parallel-ceilings.test.mjs`
- Modify: `tests/app-pathway.test.mjs`

**Interfaces:**
- Consumes: all Task 2 `fdAppPractice*` functions.
- Produces: one `data-fd-app-practice-open="pack-id"` control per valid activity.
- Produces: a full-width `.fd-app__practice-host` after `.fd-app__tasks` when `state.appPractice` exists.
- Produces: scoped `.fd-app__practice-error[role="alert"]` for an invalid referenced pack.

- [ ] **Step 1: Write failing injection and renderer tests**

Add `/*__FD_APP_PRACTICE__*/` immediately before `/*__FD_APP__*/` in the expected marker order. Assert it appears once, precedes APP and WIRE, and maps to `frontdoor/fd_app_practice.js` in `common.py`.

Update the `tests/app-pathway.test.mjs` evaluator to concatenate `fd_app_practice.js` before `fd_app.js`. Add:

```js
test('each workplace task opens its mapped practice pack', () => {
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway, { appBridge: 'pa' });
  assert.equal((html.match(/data-fd-app-practice-open=/g) || []).length, 3);
  for (const id of PRACTICE_IDS) assert.match(html, new RegExp(`data-fd-app-practice-open="${id}"`));
});

test('an active session renders once after the task grid without evaluative copy', () => {
  const session = APP.fdAppPracticeStart(CUR.appPathway.practicePacks[0]);
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway,
    { appBridge: 'pa', appPractice: session });
  assert.equal((html.match(/class="fd-app-practice/g) || []).length, 1);
  assert.ok(html.indexOf('fd-app__tasks') < html.indexOf('fd-app__practice-host'));
  assert.doesNotMatch(html, /score|grade|pass|fail|correct|competent|entrust/i);
});

test('an invalid mapped pack leaves resources usable and shows a scoped alert', () => {
  const pathway = structuredClone(CUR.appPathway);
  pathway.activities[0].practiceId = 'missing-pack';
  const html = APP.fdAppWorkspace(appIndex(pathway), pathway, { appBridge: 'pa' });
  assert.match(html, /Practice unavailable\. Your preparation resources are still available\./);
  assert.match(html, /Canonical pg_interview\.md/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/fd-inject.test.mjs tests/fd-action-contract.test.mjs \
  tests/parallel-ceilings.test.mjs tests/app-pathway.test.mjs
```

Expected: FAIL for the missing marker, marker ceiling 31 versus 32, and absent practice entry/host markup.

- [ ] **Step 3: Register the snippet and implement renderer integration**

Add to `SNIPPET_MARKERS`:

```python
"/*__FD_APP_PRACTICE__*/": "frontdoor/fd_app_practice.js",
```

Add the marker directly before `/*__FD_APP__*/` in `spa_index.html`. Change `EXPECTED_MARKER_COUNT` to `32` with a dated comment naming `fd_app_practice.js`.

In `fd_app.js`, build a pack lookup once in `fdAppModel`, attach `{practice, practiceError}` to each activity, and validate with `fdAppPracticeValidate` inside `try/catch`. In the existing **Rehearse here** stage, append one of:

```js
'<button type="button" class="fd-app__practice-open" data-fd-app-practice-open="'+
  fdEsc(activity.practice.id)+'">Practice one change</button>'
```

```js
'<p class="fd-app__practice-error" role="alert">Practice unavailable. '+
  'Your preparation resources are still available.</p>'
```

After closing `.fd-app__tasks`, render the active session once:

```js
if(model.practiceSession){
  try{
    out+='<div class="fd-app__practice-host">'+fdAppPracticeRender(model.practiceSession)+'</div>';
  }catch(ignorePractice){
    out+='<p class="fd-app__practice-error" role="alert">Practice unavailable. '+
      'Your preparation resources are still available.</p>';
  }
}
```

Return the Task 2 engine functions needed by the unit-test evaluator. Keep the active host outside the three-column task grid.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/fd-inject.test.mjs tests/fd-action-contract.test.mjs \
  tests/parallel-ceilings.test.mjs tests/app-pathway.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit snippet and renderer integration**

```bash
git add 13_Faculty_Resources/_automation/site_build/common.py \
  13_Faculty_Resources/_automation/site_build/spa_index.html \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js \
  tests/fd-inject.test.mjs tests/fd-action-contract.test.mjs \
  tests/parallel-ceilings.test.mjs tests/app-pathway.test.mjs
git commit -m "feat: render APP one-detail practice"
```

---

### Task 4: Wire transient practice actions without persistence

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `tests/fd-wire.test.mjs`
- Modify: `tests/fd-state.test.mjs`
- Modify: `tests/fd-action-contract.test.mjs`

**Interfaces:**
- Consumes: `opts.appPracticePacks` passed from the shell.
- Consumes: Task 2 transition functions.
- Produces actions: `data-fd-app-practice-open`, `-reveal`, `-classify`, `-question`, `-reset`, and `-close`.
- Classification action values use the exact format `statementId:categoryId`.
- Produces only `state.appPractice`; it does not add a persisted key.

- [ ] **Step 1: Write failing dispatch, vocabulary, and persistence tests**

Load `fd_app_practice.js` before `fd_wire.js` in the wire-test evaluator. Add a test that opens the first canonical pack, reveals it, classifies all three statements, selects `confirm-owner`, resets, and closes:

```js
test('APP practice actions advance only transient immutable state', () => {
  const packs = CUR.appPathway.practicePacks;
  const opened = F.fdDispatch(
    { 'data-fd-app-practice-open': 'training-briefing' },
    { appPracticePacks: packs }, { role: 'app' });
  assert.equal(opened.patch.appPractice.pack.id, 'training-briefing');
  assert.equal(opened.patch.appPractice.revealed, false);

  let session = F.fdDispatch({ 'data-fd-app-practice-reveal': '' }, {},
    { role: 'app', appPractice: opened.patch.appPractice }).patch.appPractice;
  for (const value of [
    'review-time:still-known', 'source-status:changed', 'verification-owner:clarify',
  ]) {
    session = F.fdDispatch({ 'data-fd-app-practice-classify': value }, {},
      { role: 'app', appPractice: session }).patch.appPractice;
  }
  session = F.fdDispatch({ 'data-fd-app-practice-question': 'confirm-owner' }, {},
    { role: 'app', appPractice: session }).patch.appPractice;
  assert.equal(session.questionId, 'confirm-owner');
  assert.equal(F.fdDispatch({ 'data-fd-app-practice-reset': '' }, {},
    { role: 'app', appPractice: session }).patch.appPractice.revealed, false);
  assert.deepEqual(F.fdDispatch({ 'data-fd-app-practice-close': '' }, {},
    { role: 'app', appPractice: session }).patch, { appPractice: null });
});
```

Extend the `fdSave` APP test:

```js
fdSave({ role: 'app', appBridge: 'pmhnp',
  appPractice: { pack: { id: 'training-briefing' }, revealed: true,
    classifications: { 'review-time': 'still-known' }, questionId: 'confirm-owner' } });
assert.deepEqual(fdLoad(), { role: 'app', appBridge: 'pmhnp' });
```

Add all six attributes to the emitted inventory and assert six unique semantics.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/fd-wire.test.mjs tests/fd-state.test.mjs tests/fd-action-contract.test.mjs
```

Expected: FAIL because the new attributes are absent from the controller vocabulary and dispatch returns empty patches.

- [ ] **Step 3: Implement pure dispatch and shell context**

Pass packs when constructing the controller:

```js
appPracticePacks:(FD_CURRICULUM.appPathway&&FD_CURRICULUM.appPathway.practicePacks)||[],
```

Add them to `context()`:

```js
appPracticePacks:o.appPracticePacks||[]
```

Register the six attributes in `FD_HANDLED_ATTRS`, `FD_ACTION_SELECTOR`, and `fdActionSemantic`. Implement dispatch by calling the engine:

```js
if(fdOwn(a,'data-fd-app-practice-open')){
  picked=String(a['data-fd-app-practice-open']||'');
  var pack=fdAppPracticeFind(c.appPracticePacks,picked);
  if(!pack) return {patch:{},route:null,effect:null};
  try{return {patch:{appPractice:fdAppPracticeStart(pack)},route:null,effect:null};}
  catch(ignorePracticeOpen){return {patch:{},route:null,effect:null};}
}
if(fdOwn(a,'data-fd-app-practice-reveal')){
  try{return {patch:{appPractice:fdAppPracticeReveal(s.appPractice)},route:null,effect:null};}
  catch(ignorePracticeReveal){return {patch:{},route:null,effect:null};}
}
if(fdOwn(a,'data-fd-app-practice-classify')){
  picked=String(a['data-fd-app-practice-classify']||'');
  var split=picked.indexOf(':');
  if(split<1) return {patch:{},route:null,effect:null};
  try{return {patch:{appPractice:fdAppPracticeClassify(
    s.appPractice,picked.slice(0,split),picked.slice(split+1))},route:null,effect:null};}
  catch(ignorePracticeClassify){return {patch:{},route:null,effect:null};}
}
if(fdOwn(a,'data-fd-app-practice-question')){
  try{return {patch:{appPractice:fdAppPracticeChooseQuestion(
    s.appPractice,String(a['data-fd-app-practice-question']||''))},route:null,effect:null};}
  catch(ignorePracticeQuestion){return {patch:{},route:null,effect:null};}
}
if(fdOwn(a,'data-fd-app-practice-reset')){
  try{return {patch:{appPractice:fdAppPracticeReset(s.appPractice)},route:null,effect:null};}
  catch(ignorePracticeReset){return {patch:{},route:null,effect:null};}
}
if(fdOwn(a,'data-fd-app-practice-close')){
  return {patch:{appPractice:null},route:null,effect:null};
}
```

Clear `appPractice` when the bridge changes or the existing APP reset runs. Do not add `appPractice` to `FD_KEYS` or `fdResolveState`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/fd-wire.test.mjs tests/fd-state.test.mjs tests/fd-action-contract.test.mjs
```

Expected: all tests pass; the persistence assertion returns only `role` and `appBridge`.

- [ ] **Step 5: Commit controller integration**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js \
  13_Faculty_Resources/_automation/site_build/spa_index.html \
  tests/fd-wire.test.mjs tests/fd-state.test.mjs tests/fd-action-contract.test.mjs
git commit -m "feat: keep APP practice session private"
```

---

### Task 5: Style and browser-test the change seam

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `tests/app-practice.test.mjs`
- Modify: `tests/smoke/app-pathway.spec.js`

**Interfaces:**
- Consumes: Task 2 markup classes and Task 4 actions.
- Produces: side-by-side `.fd-app-practice__before` / `.fd-app-practice__now` at wide widths.
- Produces: a horizontal stacked change seam at `max-width: 640px`.
- Produces: no seam animation under `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Write failing CSS and browser behavior tests**

In `tests/app-practice.test.mjs`, read `frontdoor.css` and assert the practice surface, seam animation, 640 px stack, 44 px targets, `:focus-visible`, and reduced-motion override exist.

Extend `tests/smoke/app-pathway.spec.js` with a resident-only keyboard journey that:

1. Enters APP.
2. Focuses the first **Practice one change** button and presses Enter.
3. Verifies the changed detail is absent before reveal.
4. Reveals it with Enter.
5. Classifies all three statements using the three fixed categories.
6. Chooses `confirm-owner`.
7. Verifies the selected question and privacy sentence appear without score/pass/fail/correct language.
8. Verifies `cw_frontdoor_v1` contains no serialized pack, statement, category, or question ID.
9. Verifies no non-GET request body contains those identifiers.

Use the canonical first-pack IDs so the test proves the built curriculum and renderer agree:

```js
test('APP change practice is keyboard-operable, non-evaluative, and private', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP practice is resident-build only');
  const writes = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.postData() || '');
  });
  await enterApp(page);

  const open = page.locator('[data-fd-app-practice-open="training-briefing"]');
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fd-app-practice')).toBeVisible();
  await expect(page.locator('.fd-app-practice')).not.toContainText('marked unconfirmed');

  await page.locator('[data-fd-app-practice-reveal]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fd-app-practice')).toContainText('marked unconfirmed');

  for (const value of [
    'review-time:still-known', 'source-status:changed', 'verification-owner:clarify',
  ]) {
    await page.locator(`[data-fd-app-practice-classify="${value}"]`).focus();
    await page.keyboard.press('Enter');
  }
  await page.locator('[data-fd-app-practice-question="confirm-owner"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fd-app-practice')).toContainText('Who should confirm the source note?');
  await expect(page.locator('.fd-app-practice')).toContainText(
    'Private rehearsal. No score, no saved response, and nothing is sent.');
  await expect(page.locator('.fd-app-practice')).not.toContainText(/pass|fail|correct|competent|entrust/i);

  const stored = await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1') || '');
  expect(stored).not.toMatch(/training-briefing|review-time|still-known|confirm-owner/);
  expect(writes.join('\n')).not.toMatch(/training-briefing|review-time|still-known|confirm-owner/);
});
```

Add these phone and reduced-motion assertions after opening and revealing the same pack:

```js
await page.setViewportSize({ width: 390, height: 844 });
expect(await page.locator('.fd-app-practice').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
await expect(page.locator('[data-fd-app-practice-classify]').first()).toHaveCSS('min-height', '44px');

await page.emulateMedia({ reducedMotion: 'reduce' });
await expect(page.locator('.fd-app-practice__seam')).toHaveCSS('animation-name', 'none');
```

Extend the MS3 branch to assert `.fd-app-practice` and `[data-fd-app-practice-open]` have count 0.

- [ ] **Step 2: Run the CSS unit test and verify RED**

Run:

```bash
node --test tests/app-practice.test.mjs
```

Expected: FAIL because no `.fd-app-practice` CSS or reduced-motion seam rule exists.

- [ ] **Step 3: Implement the focused visual system**

Add styles after the existing APP block using only Front Door tokens. The required structural rules are:

```css
.fd-app__practice-open{min-height:var(--fd-target-touch);width:100%;padding:var(--fd-space-3) var(--fd-space-4);border:1px solid var(--fd-teal);background:var(--fd-teal-wash);color:var(--fd-teal-deep);font:inherit;font-weight:750;text-align:left;cursor:pointer}
.fd-app__practice-open:focus-visible,.fd-app-practice button:focus-visible{outline:3px solid var(--fd-focus);outline-offset:3px}
.fd-app__practice-host{grid-column:1/-1;margin-top:var(--fd-space-7)}
.fd-app-practice{position:relative;padding:var(--fd-space-8);border:1px solid var(--fd-line-strong);border-radius:var(--fd-radius-lg);background:var(--fd-surface);box-shadow:var(--fd-shadow-lift)}
.fd-app-practice__change{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:stretch;margin:var(--fd-space-7) 0}
.fd-app-practice__before,.fd-app-practice__now{padding:var(--fd-space-6);background:var(--fd-callout)}
.fd-app-practice__seam{display:grid;place-items:center;width:54px;background:var(--fd-olive-wash);color:var(--fd-olive-deep);font-size:var(--fd-font-xs);font-weight:800;writing-mode:vertical-rl;transform:rotate(180deg)}
.fd-app-practice.is-revealed .fd-app-practice__seam{animation:fdAppChangeSeam .35s ease both}
.fd-app-practice__row{padding:var(--fd-space-5) 0;border-top:1px solid var(--fd-line)}
.fd-app-practice__choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--fd-space-3)}
.fd-app-practice__choices button,.fd-app-practice__questions button,.fd-app-practice__action{min-height:var(--fd-target-touch);padding:var(--fd-space-3) var(--fd-space-4);border:1px solid var(--fd-line-strong);background:var(--fd-surface);color:var(--fd-text);font:inherit;cursor:pointer}
.fd-app-practice__choices button[aria-pressed="true"],.fd-app-practice__questions button[aria-pressed="true"]{border-color:var(--fd-teal);background:var(--fd-teal-wash);color:var(--fd-teal-deep)}
@keyframes fdAppChangeSeam{from{clip-path:inset(50% 0 50% 0)}to{clip-path:inset(0 0 0 0)}}
@media (max-width:640px){
  .fd-app-practice{padding:var(--fd-space-5)}
  .fd-app-practice__change{grid-template-columns:minmax(0,1fr)}
  .fd-app-practice__seam{width:100%;min-height:36px;writing-mode:horizontal-tb;transform:none}
  .fd-app-practice__choices{grid-template-columns:minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){
  .fd-app-practice.is-revealed .fd-app-practice__seam{animation:none}
}
```

Add restrained heading, privacy, question, reset, close, and recap spacing rules without creating additional card treatments. Ensure completion uses text labels and counts rather than color alone.

- [ ] **Step 4: Run unit tests, sequential builds, and both-audience browser tests**

Run:

```bash
node --test tests/app-practice.test.mjs tests/app-pathway.test.mjs \
  tests/fd-wire.test.mjs tests/fd-state.test.mjs tests/fd-action-contract.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
npm --prefix tests/smoke ci
bash tests/smoke/run-local-playwright.sh app-pathway.spec.js \
  --project=nav-ms3 --project=nav-res
```

Expected: all unit tests, builds, and APP browser tests pass. MS3 has no APP practice surface; resident completes the flow without persistence or request payloads.

- [ ] **Step 5: Commit visual and browser behavior**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css \
  tests/app-practice.test.mjs tests/smoke/app-pathway.spec.js
git commit -m "feat: add APP change-seam interaction"
```

---

### Task 6: Run the complete verification and prepare review evidence

**Files:**
- Verify only; do not intentionally modify tracked files.
- Create untracked screenshots under `tests/smoke/test-results/artifacts/`.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: local test evidence, desktop/mobile screenshots, a reviewable commit series, and an exact unresolved-decision list.

- [ ] **Step 1: Run registry, curriculum, and root test gates**

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
node --test tests/*.test.mjs
```

Expected: every command exits 0.

- [ ] **Step 2: Rebuild both audiences sequentially and rerun the affected browser projects**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash tests/smoke/run-local-playwright.sh app-pathway.spec.js \
  --project=nav-ms3 --project=nav-res
```

Expected: both static QA gates and both browser projects pass.

- [ ] **Step 3: Run the repository’s full local verification gate**

```bash
bash bin/verify.sh
```

Expected: PASS. If a ratchet reports existing findings at or below baseline, record its named count; do not describe that as “no findings.”

- [ ] **Step 4: Capture local desktop and phone screenshots**

Start the repository smoke server in a dedicated terminal:

```bash
bash tests/smoke/start-local-servers.sh
```

From `tests/smoke`, use the installed Playwright browser to visit `http://127.0.0.1:4201/`, select **APP / PA / NP**, open the first practice pack, reveal the change, and save:

```text
test-results/artifacts/app-one-detail-desktop.png
test-results/artifacts/app-one-detail-mobile.png
```

Capture the desktop image at 1280 × 900 and the mobile image at 390 × 844. Stop the dedicated server with Ctrl-C after capture. Do not update visual-regression baselines on macOS.

Run this from `tests/smoke` while the server is active:

```bash
node --input-type=module <<'NODE'
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

await mkdir('test-results/artifacts', { recursive: true });
const browser = await chromium.launch();
for (const shot of [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
]) {
  const context = await browser.newContext({ viewport: shot.viewport });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4201/');
  await page.locator('[data-fd-role="app"]').click();
  await page.locator('[data-fd-app-practice-open="training-briefing"]').click();
  await page.locator('[data-fd-app-practice-reveal]').click();
  await page.screenshot({
    path: `test-results/artifacts/app-one-detail-${shot.name}.png`,
    fullPage: true,
  });
  await context.close();
}
await browser.close();
NODE
```

- [ ] **Step 5: Review the final diff and report boundaries**

Run:

```bash
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: no tracked build artifacts or test outputs, a clean worktree, the spec/plan plus focused implementation commits, and no changes to `reviewed.json`, clinical source pages, analytics configuration, or deployment settings.

Report in plain language that the interaction practices handling changed information but supplies no clinical guidance or score. List the direct `?audience=app` route as a separate future option, not part of this branch. Stop before push, PR creation, merge, or deployment unless the user separately authorizes those actions.
