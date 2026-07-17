# Wave C — Hardening & Maintainability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Make the attestation ledger record a server-verified identity, enforce the JSON schemas in CI, and remove the two biggest sources of duplication (inline light-mode tokens; hand-maintained nav arrays).

**Architecture:** Independent changes to (WP-07) the faculty-console function + client, (WP-08) a new CI validation step, (WP-11) the shared stylesheet + build injection, (WP-12) a new nav source consumed by both build scripts. WP-07/WP-08 are low-risk; WP-11/WP-12 are big-diff refactors gated by output-parity checks.

**Tech stack:** Netlify Functions v2 (ESM), vanilla JS console, Python build, `ajv` (dev-only), Playwright visual regression.

## Global Constraints
Inherited from the master plan. WP-11/WP-12 add a hard rule: **the generated `nav.json` (both sites) and the visual-regression baseline must not change** — these refactors are output-preserving.

Merge order: WP-07 and WP-08 first (independent, low-risk), then WP-03 (Wave B) before WP-11, then WP-12.

---

### Task 1: WP-07 — Per-faculty attestation identity

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs` (add `FACULTY_KEYS` after line 23; edit `authed` lines 54-57; add `attesterFor`; edit POST attester line 133; add named exports; add `attester` to the GET state response)
- Modify: `faculty-console/index.html` (make the attester input read-only, populate from state — lines 75, 149)
- Modify: `faculty-console/README.md` (document `FACULTY_KEYS` — env table lines 40-47)
- Create: `faculty-console/attest.test.mjs`

**Interfaces:**
- Consumes: env `FACULTY_KEYS` (optional JSON map `{"<key>":"<Full Name, Credential>"}`), env `FACULTY_ATTEST_PASSWORD` (existing shared key — fallback).
- Produces: server-derived `attesterFor(request, bodyKey)` returning the mapped name; `authed()` accepts either the shared key or any faculty key; `body.attester` is IGNORED.

**Context (verbatim current code):** attester is client-supplied and only length-capped —
`attest.mjs:133`: `const attester = (body.attester || 'Joshua Moss, MD').toString().slice(0, 80);`
written to the ledger at `attest.mjs:144`: `rev[slug] = { status: 'reviewed', at, by: attester };`
The console input mutates it on every keystroke (`index.html:149`). Keys are checked with the constant-time `safeEqual` (`attest.mjs:48-53`).

- [ ] **Step 1: Write the failing test**

Create `faculty-console/attest.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// FACULTY_KEYS is parsed at module load, so set env BEFORE importing the module.
process.env.FACULTY_ATTEST_PASSWORD = 'shared-pw';
process.env.FACULTY_KEYS = JSON.stringify({ 'key-moss': 'Joshua Moss, MD', 'key-lee': 'Dana Lee, DO' });
process.env.GITHUB_TOKEN = 'x'; // presence-only; no network in these unit tests

const mod = await import('./netlify/functions/attest.mjs');

test('a faculty key resolves to its mapped name (client cannot spoof)', () => {
  const req = { headers: { get: () => null } };
  assert.equal(mod.attesterFor(req, 'key-lee'), 'Dana Lee, DO');
  assert.equal(mod.attesterFor(req, 'key-moss'), 'Joshua Moss, MD');
});

test('unknown key is not authed', () => {
  const req = { headers: { get: () => null } };
  assert.equal(mod.authed(req, 'not-a-key'), false);
});

test('shared password still authes and falls back to default identity', () => {
  const req = { headers: { get: () => null } };
  assert.equal(mod.authed(req, 'shared-pw'), true);
  assert.equal(mod.attesterFor(req, 'shared-pw'), 'Joshua Moss, MD');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node --test faculty-console/attest.test.mjs
```
Expected: FAIL — `mod.attesterFor` / `mod.authed` are not exported yet (import has no such members).

- [ ] **Step 3: Add the `FACULTY_KEYS` map**

In `attest.mjs`, immediately after line 23 (`const KEY = process.env.FACULTY_ATTEST_PASSWORD;`), insert:

```javascript
// Optional per-faculty identity map: {"<key>":"<Full Name, Credential>"}.
// When set, a presented key resolves to a fixed attester name the client cannot spoof.
// Falls back to the single shared FACULTY_ATTEST_PASSWORD (identity "Joshua Moss, MD") when absent.
let FACULTY_KEYS = {};
try { FACULTY_KEYS = JSON.parse(process.env.FACULTY_KEYS || '{}'); } catch (_) { FACULTY_KEYS = {}; }
```

- [ ] **Step 4: Replace `authed()` and add `attesterFor()`**

Replace `attest.mjs` lines 54-57:
```javascript
function authed(request, bodyKey) {
  const k = bodyKey != null ? bodyKey : request.headers.get('x-faculty-key');
  return KEY && safeEqual(k, KEY);
}
```
with:
```javascript
function presentedKey(request, bodyKey) {
  return bodyKey != null ? bodyKey : request.headers.get('x-faculty-key');
}
function authed(request, bodyKey) {
  const k = presentedKey(request, bodyKey);
  if (KEY && safeEqual(k, KEY)) return true;
  return Object.keys(FACULTY_KEYS).some((fk) => safeEqual(k, fk));
}
// Server-derived attester identity — NEVER trust the client's body.attester.
function attesterFor(request, bodyKey) {
  const k = presentedKey(request, bodyKey);
  for (const fk of Object.keys(FACULTY_KEYS)) if (safeEqual(k, fk)) return FACULTY_KEYS[fk];
  return 'Joshua Moss, MD'; // shared-password fallback identity
}
```

- [ ] **Step 5: Use the server-derived identity in the POST handler**

Replace `attest.mjs` line 133:
```javascript
      const attester = (body.attester || 'Joshua Moss, MD').toString().slice(0, 80);
```
with:
```javascript
      const attester = attesterFor(request, body.key).toString().slice(0, 80); // server-derived; body.attester ignored
```

- [ ] **Step 6: Export the helpers + expose the resolved identity to the client**

At the end of `attest.mjs`, add:
```javascript
export { safeEqual, authed, attesterFor };
```
In the GET branch that returns console state (the object that already carries `pagesReviewed`/`qbankAttested` counts), add `attester: attesterFor(request)` to the returned JSON so the client can display the true identity.

- [ ] **Step 7: Make the console input read-only**

In `faculty-console/index.html:149`, change the attester input so it is read-only and reflects the server value. Replace:
```javascript
      (function(){ var i=h("input",{type:"text",id:"att",value:attester}); i.addEventListener("input",function(){attester=i.value||attester;}); return i; })(),
```
with:
```javascript
      h("input",{type:"text",id:"att",value:attester,readonly:"readonly",title:"Identity is derived from your faculty key"}),
```
And where the GET state is applied, set `attester = state.attester || attester;` before rendering, so the read-only field shows the server-resolved name.

- [ ] **Step 8: Run the test to verify it passes**

Run:
```bash
node --test faculty-console/attest.test.mjs
```
Expected: PASS (all three tests).

- [ ] **Step 9: Document the env var**

In `faculty-console/README.md`, add a row to the env table (after line 44):
```markdown
| `FACULTY_KEYS` | *(optional)* JSON map of per-faculty keys to names, e.g. `{"k1":"Joshua Moss, MD","k2":"Dana Lee, DO"}`. When set, the attester `by` is derived from the presented key (client cannot spoof). Falls back to `FACULTY_ATTEST_PASSWORD` if unset. |
```
Also add `ATTESTER_EMAIL` and `STUDENT_SITE_URL` rows (the function reads them at lines 25/28 but the table omits them).

- [ ] **Step 10: Commit**

```bash
git add faculty-console/netlify/functions/attest.mjs faculty-console/index.html faculty-console/README.md faculty-console/attest.test.mjs
git commit -m "feat(faculty-console): server-derived attester identity via FACULTY_KEYS (no client spoofing)"
```

**Acceptance:** `by` is derived from the presented key; unknown keys 401; shared-password fallback preserved; input read-only; test green.
**Regression risk:** medium (auth path) — the shared-password fallback keeps existing single-key deployments working. Provision `FACULTY_KEYS` in Netlify before relying on identity. **Depends on:** none.

---

### Task 2: WP-08 — Schema-validate qbank + topic_meta in CI

**Files:**
- Create: `tests/validate-schemas.mjs`, `tests/schema-fixtures/qbank-bad.json`
- Create/Modify: `tests/package.json` (add `ajv` dev dep + script) — or a standalone `tests/schema/package.json`
- Modify: `.github/workflows/ci.yml`

**Context (verified):** current `question_bank.json` (192 items) and `topic_meta.json` (71 entries) BOTH pass their existing schemas — every `required` field is present, all enums/dependencies hold, and neither schema sets `additionalProperties:false` (so `topic_meta`'s undeclared `epa`/`shelfBlueprint` keys are tolerated). A CI gate is therefore green-by-construction on today's data. Schemas: `question_bank.schema.json`, `topic_meta.schema.json`.

- [ ] **Step 1: Write the validator script**

Create `tests/validate-schemas.mjs`:
```js
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

const pairs = [
  ['question_bank.json', 'question_bank.schema.json'],
  ['topic_meta.json', 'topic_meta.schema.json'],
];

let failed = false;
for (const [dataPath, schemaPath] of pairs) {
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    failed = true;
    console.error(`SCHEMA FAIL: ${dataPath} vs ${schemaPath}`);
    for (const e of validate.errors.slice(0, 20)) console.error(`  ${e.instancePath} ${e.message}`);
  } else {
    console.log(`schema OK: ${dataPath}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Add a negative fixture + prove the validator catches it**

Create `tests/schema-fixtures/qbank-bad.json` — a minimal invalid bank (item missing `why`):
```json
{ "_note": "fixture", "version": 1, "items": [
  { "id": "qb_bad_001", "status": "draft", "type": "sba", "category": "mood",
    "competency": ["dx"], "difficulty": 1, "pages": ["t_mood.md"],
    "stem": "x", "options": [{"key":"A","t":"a","c":true}], "pearl": "p", "evidence": "e" }
] }
```
Add a second check to `validate-schemas.mjs` (or a sibling assertion) that compiling `question_bank.schema.json` against this fixture returns `false` (proves the gate has teeth). Example addition before `process.exit`:
```js
const badSchema = JSON.parse(readFileSync('question_bank.schema.json', 'utf8'));
const badData = JSON.parse(readFileSync('tests/schema-fixtures/qbank-bad.json', 'utf8'));
if (ajv.compile(badSchema)(badData)) { console.error('NEGATIVE FIXTURE PASSED — gate is toothless'); process.exit(1); }
console.log('negative fixture correctly rejected');
```

- [ ] **Step 3: Add the dev dependency + run locally**

Add `ajv` (pin `^8`) as a dev dependency where the script runs (e.g. a `tests/package.json` with `"devDependencies": {"ajv": "^8.17.1"}` and a `"scripts": {"schemas": "node validate-schemas.mjs"}` — paths relative to repo root when invoked from root). Run:
```bash
cd tests && npm install
cd .. && node tests/validate-schemas.mjs
```
Expected: `schema OK: question_bank.json`, `schema OK: topic_meta.json`, `negative fixture correctly rejected`, exit 0.

- [ ] **Step 4: Wire into CI**

In `.github/workflows/ci.yml`, in `build-test-validate` after the Node setup (line 45-47) and `npm --prefix sp-proxy ci`, add:
```yaml
      - name: Validate — JSON schemas (qbank + topic_meta)
        run: |
          npm --prefix tests install
          node tests/validate-schemas.mjs
```

- [ ] **Step 5: Commit**

```bash
git add tests/validate-schemas.mjs tests/schema-fixtures/qbank-bad.json tests/package.json .github/workflows/ci.yml
git commit -m "ci: schema-validate question_bank + topic_meta (ajv dev-only, negative fixture)"
```

**Acceptance:** CI green on current data; red if a schema violation is introduced; negative fixture rejected. **Regression risk:** low — do NOT add `additionalProperties:false` to `topic_meta.schema.json` (would fail on `epa`/`shelfBlueprint`); document those two keys in the schema instead if desired. **Depends on:** WP-01 (so pushes are gated too). Not blocked by WP-16.

---

### Task 3: WP-11 — Extract light-mode "Clinical Warm" tokens

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/clinical-warm.css` (add a `:root{}` light block)
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (dark-mode/link-injection pass, lines 391-407; strip inline light `:root`)

**Context:** `clinical-warm.css` currently holds ONLY dark tokens (line 12 `[data-theme="dark"]{…}`); its header (lines 8-10) states light `:root` tokens are still inline per page and warns to centralize "once cross-tool light values are confirmed identical, to avoid shifting any tool's colors." The build already links `clinical-warm.css` before `</head>` for tool pages lacking a dark theme (`build_deploy.py:399-401`). **This task MUST be output-preserving** (visual-regression baseline unchanged).

- [ ] **Step 1: Inventory the inline light `:root` blocks and confirm they are identical**

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/psychiatry-platform-audit-089d2c
grep -rl ":root{" 13_Faculty_Resources/_automation/site_build/*.html 02_Clinical_Skills 03_Core_Topics 04_Acute_and_Safety --include="*.html" | head -50
# Extract each :root{...} light block and diff them to find the canonical set + any divergent tokens.
```
Produce a canonical light-token set and a list of pages whose values differ (those must keep their overrides). **Use the post-WP-03 AA-compliant values** (`--primary` → `#a84830` for normal text; `--text-light` already `#665a4f` via the build).

- [ ] **Step 2: Add the light `:root` block to `clinical-warm.css`**

Append a `:root{ … }` block with the canonical light tokens (mirroring the dark block's variable names: `--bg,--surface,--text,--text-mid,--text-light,--primary,--primary-dark,--accent,--warning,--danger,--good,--bad,--focus,--shadow*`, fonts, radii). Keep the dark block unchanged.

- [ ] **Step 3: Link `clinical-warm.css` on ALL served pages + strip duplicated inline light `:root`**

In the build pass (`build_deploy.py:391-407`), ensure the `<link rel="stylesheet" href="/clinical-warm.css">` is injected on every served page (currently gated by `'[data-theme="dark"]' not in _t and 'clinical-warm.css' not in _t`, line 399). Then remove the now-duplicated inline light `:root{…}` from pages whose values match the canonical set (leave divergent pages' overrides in place; those can be reconciled later). Because the link is injected before `</head>`, `clinical-warm.css` wins the cascade over any earlier inline block.

- [ ] **Step 4: Build both sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```
Expected: both exit 0.

- [ ] **Step 5: Visual-regression gate (MANDATORY)**

```bash
python3 -m http.server 4201 --directory _build/res &
cd tests/smoke && npx playwright test --project=visual
```
Expected: PASS within the 20% threshold — colors must not shift. If any page shifts, its inline `:root` diverged from canonical; restore that page's inline block and exclude it from the strip.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/clinical-warm.css 13_Faculty_Resources/_automation/site_build/build_deploy.py
git commit -m "refactor(design): centralize light-mode Clinical Warm tokens in clinical-warm.css (#100)"
```

**Acceptance:** light tokens defined once; visual regression unchanged; `check-static-site.mjs` still green. **Regression risk:** HIGH (touches every page's cascade) — the visual gate is the guardrail. **Depends on:** WP-03 (token values finalized first).

---

### Task 4: WP-12 — Single-source nav

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/nav_source.json`
- Modify: `build_deploy.py:226-241` (build MS3 nav from source), `resident_section.py:150-170` (build resident nav from source)

**Context:** Nav is hand-authored twice — MS3 in `build_deploy.py:226-238`, resident in `resident_section.py:150-170`. They diverge substantially: resident adds `adv_psychopharm.md`, `canon_200.md`, `systems_medlegal.md`, `supervision_teaching.md`, `cl_reference.md`, `rp-agitation.html`, `rp-brief-psych.html`, `rp-canon-quiz.html`, overrides `welcome.md`/`rotation.md` titles, and drops some MS3-only topics. A single source must encode per-site membership + hidden flags. **Output-preserving:** generated `nav.json` for each site must be byte-identical to today's.

- [ ] **Step 1: Capture the current nav.json baselines**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cp _build/ms3/nav.json /tmp/nav-ms3-baseline.json
cp _build/res/nav.json /tmp/nav-res-baseline.json
```

- [ ] **Step 2: Author `nav_source.json`**

Model each entry with a `sites` tag. Shape:
```json
{
  "_note": "Single source for both site navs. sites: which builds include the entry. Consumed by build_deploy.py (ms3) and resident_section.py (res).",
  "sections": [
    { "section": "Welcome and Orientation", "pinned": true, "items": [
      { "t": "Welcome to the Rotation", "tRes": "Welcome — Resident Rotation", "f": "welcome.md", "k": "md", "sites": ["ms3","res"] },
      { "t": "Advanced Psychopharmacology", "f": "adv_psychopharm.md", "k": "md", "sites": ["res"] }
    ] }
  ]
}
```
Populate it by merging the MS3 array (`build_deploy.py:226-238`) and resident array (`resident_section.py:150-170`), tagging each item with `sites` and per-site title/hidden overrides (`tRes`, `hiddenRes`). This is the meticulous part — transcribe both arrays exactly.

- [ ] **Step 3: Generate each site's nav from the source**

In `build_deploy.py`, replace the literal `nav=[…]` (226-238) with a loader that reads `nav_source.json`, keeps items where `"ms3" in sites`, and emits the same `{t,f,k[,hidden]}` shape. In `resident_section.py`, replace its literal `nav=[…]` (150-170) with the same loader keyed to `"res"`, applying `tRes`/`hiddenRes` overrides. Preserve the `_navorder` sort in both.

- [ ] **Step 4: Prove byte-parity**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
diff <(python3 -c "import json;print(json.dumps(json.load(open('_build/ms3/nav.json')),sort_keys=True))") \
     <(python3 -c "import json;print(json.dumps(json.load(open('/tmp/nav-ms3-baseline.json')),sort_keys=True))") && echo "MS3 nav parity OK"
diff <(python3 -c "import json;print(json.dumps(json.load(open('_build/res/nav.json')),sort_keys=True))") \
     <(python3 -c "import json;print(json.dumps(json.load(open('/tmp/nav-res-baseline.json')),sort_keys=True))") && echo "RES nav parity OK"
```
Expected: both "parity OK". (Semantic parity via sorted-key normalization; if you need exact byte parity, match key order in the emitter.)

- [ ] **Step 5: Add a drift guard**

Add a check (in `check-static-site.mjs` or a small python step) that every `md`/`tool` in `site_manifest.json` for the site appears in the generated nav, and vice-versa — so a future page can't be registered in one place but not the other.

- [ ] **Step 6: Run smoke + commit**

```bash
python3 -m http.server 4200 --directory _build/ms3 & python3 -m http.server 4201 --directory _build/res &
cd tests/smoke && npx playwright test --project=nav-ms3 --project=nav-res
cd ../.. && git add 13_Faculty_Resources/_automation/site_build/nav_source.json 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/site_build/resident_section.py 13_Faculty_Resources/_automation/site_build/check-static-site.mjs
git commit -m "build: single-source nav (nav_source.json) for both sites (kills duplicated arrays)"
```

**Acceptance:** nav defined once; both nav.json outputs match baseline; nav-crawl green; drift guard active. **Regression risk:** medium-high — parity check is the guardrail. **Depends on:** none; **eases** future page additions (TD-4) and WP-15.

## Self-Review
- WP-07 → Task 1 ✓ (server-derived identity, shared-key fallback, test); WP-08 → Task 2 ✓ (verified green-on-current-data, negative fixture); WP-11 → Task 3 ✓ (visual-gated); WP-12 → Task 4 ✓ (parity-gated).
- Type/name consistency: `attesterFor`/`authed`/`presentedKey` defined in Task 1 Steps 4 and exported Step 6, referenced by the test (Step 1). `nav_source.json` shape defined once (Task 4 Step 2), consumed by both scripts (Step 3). ✓
- No placeholders: exact before/after code for WP-07/08; WP-11/WP-12 are inherently repo-wide refactors — their "meticulous transcription" steps reference the exact source line ranges (build_deploy.py:226-238, resident_section.py:150-170) rather than restating hundreds of nav lines, and are guarded by output-parity/visual gates. ✓
- WP-08 sequencing corrected: NOT blocked by WP-16 (current data passes as-is, per extraction). ✓
