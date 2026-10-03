# Panel Snapshots for Both Audiences — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "On the Unit Practice and Tools" panel snapshot gate cover both shipped sites by rendering from each build's own `index.html`, closing the two Codex P2 threads on PR #539.

**Architecture:** `tests/_panel_render.mjs` keeps its source-registry render for `practice-panel.test.mjs`'s property tests and gains `renderFromBuild(site)`, which slices the injected payloads and the panel code out of `_build/<site>/index.html` and evaluates the shipped renderer against the shipped data. The byte-comparison gate moves out of the pre-build node suite into `build_and_check.sh`, which `ci.yml` and `bin/verify.sh` already invoke for both sites. `tests/panel-snapshots.test.mjs` keeps the contracts that read only committed files.

**Tech Stack:** Node 22 `node:test`, `node:vm`, `new Function` evaluation of sliced browser JS; bash gate wiring; Python only for verification commands.

**Spec:** `docs/superpowers/specs/2026-09-05-panel-snapshot-both-audiences-design.md`

## Global Constraints

- Branch is `claude/panel-snapshot-harness` (PR #539). Work folds into that PR; do not open a new one.
- **Never re-derive a producer.** `cotw_registry.json` and `site_manifest.json` must not appear as quoted path literals in any new non-test file — `tests/shipped-pages-readers.test.mjs` scans for `/(['"`])[A-Za-z0-9_./-]*(site_manifest|cotw_registry)\.json\1/` outside `tests/`. Ask `shipped_pages.json` instead.
- **No second renderer.** All rendering goes through `tests/_panel_render.mjs`. `bin/render_panels.mjs` imports; it does not re-implement.
- macOS `/bin/bash` is 3.2.57: write `${ARR[@]+"${ARR[@]}"}`, never bare `"${ARR[@]}"` on a possibly-empty array under `set -u`.
- No hard-coded `/Users` or `/sessions` paths in tracked `.py`; derive from `__file__`. (This plan adds no Python.)
- Snapshot storage is per audience: `tests/__panels__/ms3/` and `tests/__panels__/res/`.
- Expected end state: **79** ms3 snapshots, **85** res snapshots, **96 of 97** shipped pages covered, `rapid_review.md` the only uncovered page.
- The gate hard-fails the Netlify production deploy on drift. This is the ratified decision (spec R1); do not soften it to a warning.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `faculty-console/content-universe.mjs` | **Modify.** Export the validated shipped-pages rows with `sites` intact (`deriveContentUniverse` collapses them). |
| `faculty-console/content-universe.test.mjs` | **Modify.** Pin the new export's shape and its non-collapsing behaviour. |
| `tests/_panel_render.mjs` | **Modify.** Rename `renderAll` → `renderFromSource`; add `renderFromBuild(site)`, `snapshotDir(site)`, `shippedPanelRefs(site)`, `builtIndexPath(site)`, `PANEL_BUILD_INPUTS`; rewrite the scope header. |
| `tests/practice-panel.test.mjs` | **Modify.** One import line: `renderAll` → `renderFromSource`. |
| `tests/panel-build-render.test.mjs` | **Create.** Build-dependent regression pins for the two Codex defects (resident overlay, COTW), guarded by `staleBuildReason`. |
| `tests/panel-snapshots.test.mjs` | **Rewrite** (Task 4). Committed-corpus contracts only: round-trip, vacuity, orphan, coverage set-equality. No rendering. Task 2 first makes two mechanical renames in it so the node suite stays green — see the C1 ruling in the ledger. |
| `bin/render_panels.mjs` | **Rewrite.** `--site`, `--check`, `--write`; per-audience coverage output; no caveat line. |
| `13_Faculty_Resources/_automation/site_build/build_and_check.sh` | **Modify.** One gate invocation per site branch. |
| `tests/__panels__/ms3/` | **Regenerate.** 74 → 79 files. |
| `tests/__panels__/res/` | **Create.** 85 files. |

---

### Task 1: Site-aware shipped-pages reader

`deriveContentUniverse()` maps `sites` to a single value — `'res'` when a page ships only to
resident, `'ms3'` otherwise. That is lossy here: the 69 pages that ship to *both* sites must count
as shipped on res. The module's private `shippedPages()` already returns the full array with
schema validation, so this exposes it rather than re-parsing the file elsewhere.

**Files:**
- Modify: `faculty-console/content-universe.mjs` (add an export after `deriveContentUniverse`, around line 137)
- Test: `faculty-console/content-universe.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `shippedItemsWithSites({ shipped }) -> Array<{ slug: string, title: string, kind: 'page'|'tool', sites: string[] }>`. Throws `TypeError` on a malformed `shipped_pages.json`. Used by Task 2's `shippedPanelRefs(site)`.

- [ ] **Step 1: Write the failing test**

Append to `faculty-console/content-universe.test.mjs`:

```javascript
test('shippedItemsWithSites keeps both sites on a page that ships to both', () => {
  const shipped = {
    version: 1,
    pages: [
      { slug: 'shared.md', title: 'Shared', kind: 'page', sites: ['ms3', 'res'] },
      { slug: 'resonly.md', title: 'Res only', kind: 'page', sites: ['res'] },
    ],
  };
  const rows = shippedItemsWithSites({ shipped });
  assert.deepEqual(rows.map(r => r.sites), [['ms3', 'res'], ['res']]);

  // deriveContentUniverse collapses the shared page to 'ms3', which is why this exists.
  assert.deepEqual(deriveContentUniverse({ shipped }).map(r => r.site), ['ms3', 'res']);
});

test('shippedItemsWithSites rejects a malformed listing rather than shortening it', () => {
  assert.throws(
    () => shippedItemsWithSites({ shipped: { version: 1, pages: [{ slug: 'a.md', title: 'A', kind: 'page', sites: [] }] } }),
    /invalid sites/,
  );
});
```

Add `shippedItemsWithSites` to that file's existing import from `./content-universe.mjs`
(keep `deriveContentUniverse`, which the first test uses).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test faculty-console/content-universe.test.mjs`
Expected: FAIL — `shippedItemsWithSites is not a function` (or an import error naming it).

- [ ] **Step 3: Write minimal implementation**

In `faculty-console/content-universe.mjs`, immediately after the `deriveContentUniverse`
function, add:

```javascript
/* The same validated rows deriveContentUniverse() reads, with `sites` left intact.

   deriveContentUniverse answers "which ONE deployment does the console preview this
   against?" and collapses sites to a single value for that. A caller asking "does this
   page ship on res?" needs the array: 69 pages ship to BOTH sites and collapse to 'ms3',
   so reading `site` would say no. The panel snapshot harness asks exactly that question
   per audience — see tests/_panel_render.mjs. */
export function shippedItemsWithSites({ shipped } = {}) {
  return shippedPages(shipped);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test faculty-console/content-universe.test.mjs`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Confirm no neighbouring suite regressed**

Run: `node --test faculty-console/*.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add faculty-console/content-universe.mjs faculty-console/content-universe.test.mjs
git commit -m "feat(console): expose shipped rows with sites intact

deriveContentUniverse collapses sites to one value, which cannot answer
\"does this page ship on res?\" for the 69 pages that ship to both.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `renderFromBuild(site)` in the shared render module

The built `index.html` carries all four renderer inputs as single-line injected literals,
`fdBuildIndex` inlined, and the panel code with its `PRACTICE_CASE_TITLES` needle already
replaced by `build_deploy.py`. Evaluating those is the shipped renderer over the shipped data.

**Files:**
- Modify: `tests/_panel_render.mjs`
- Modify: `tests/practice-panel.test.mjs` (import line only, around line 30-33)

**Interfaces:**
- Consumes: `shippedItemsWithSites` (Task 1); `staleBuildReason` from `tests/_build_freshness.mjs` (already on main).
- Produces, all used by Tasks 3–5:
  - `renderFromSource() -> Array<[ref: string, html: string]>` — the former `renderAll`, unchanged behaviour.
  - `renderFromBuild(site: 'ms3'|'res') -> Array<[ref, html]>` — sorted by ref, filtered to pages that ship on `site`.
  - `snapshotDir(site: 'ms3'|'res') -> URL` — replaces the single `SNAPSHOT_DIR` export.
  - `shippedPanelRefs(site: 'ms3'|'res') -> Set<string>` — every `kind: "page"` slug scoped to that site.
  - `builtIndexPath(site) -> string` (absolute), `PANEL_BUILD_INPUTS: string[]` (absolute paths for `staleBuildReason`), `AUDIENCES = ['ms3','res']`.
  - Unchanged and still exported: `F`, `topicEntries`, `esc`, `actionKey`, `manifestTitle`, `source`, `TOPIC_META`, `TOOL_REGISTRY`, `FD_INDEX`, `RIGHTS_REFS`, `CASE_TITLES`, `read`, `formatPanel`, `unformatPanel`, `snapshotName`.

- [ ] **Step 1: Write the failing test**

Create `tests/panel-build-render.test.mjs`:

```javascript
/* Build-dependent regression pins for the two defects Codex reported on #539.
 *
 * These are LOCAL-ONLY contracts by construction: node --test runs before build_and_check.sh
 * reaches build_deploy.py, and CI clones fresh, so _build/ is absent there and these skip.
 * The enforcing gate is the byte-comparison inside build_and_check.sh — this file exists so
 * the two specific defects have named, readable pins rather than living only in 164 snapshots.
 *
 * Guarded with staleBuildReason(), never existsSync(): a _build/ older than the sources under
 * test fails honestly and that red would abort the build that repairs it (CLAUDE.md, T17).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';
import { renderFromBuild, shippedPanelRefs, PANEL_BUILD_INPUTS } from './_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const stale = (site) => staleBuildReason(REPO, site, PANEL_BUILD_INPUTS);

test('the resident build renders its own shelf-mode title, the MS3 build does not', (t) => {
  for (const site of ['ms3', 'res']) {
    const reason = stale(site);
    if (reason) return t.skip(reason);
  }
  const titleOf = (site) => {
    const seen = new Set();
    for (const [, html] of renderFromBuild(site)) {
      for (const m of html.matchAll(/Board-Style Question Bank|Shelf Mode — Exam Simulation/g)) seen.add(m[0]);
    }
    return seen;
  };
  assert.deepEqual([...titleOf('ms3')], ['Shelf Mode — Exam Simulation']);
  assert.deepEqual([...titleOf('res')], ['Board-Style Question Bank']);
});

test('every Case-of-the-Week page that ships renders a snapshotted panel', (t) => {
  for (const site of ['ms3', 'res']) {
    const reason = stale(site);
    if (reason) return t.skip(reason);
  }
  for (const site of ['ms3', 'res']) {
    const rendered = new Set(renderFromBuild(site).map(([ref]) => ref));
    const cotw = [...shippedPanelRefs(site)].filter((ref) => ref.startsWith('cotw_2'));
    assert.ok(cotw.length >= 11, `${site}: expected the COTW registry's cases to ship, saw ${cotw.length}`);
    assert.deepEqual(cotw.filter((ref) => !rendered.has(ref)), [],
      `${site}: a shipped Case-of-the-Week page renders no panel`);
  }
});

test('a build renders no panel for a page that site does not publish', (t) => {
  const reason = stale('ms3');
  if (reason) return t.skip(reason);
  // The six resident_extra pages have entries in the shared topic_meta.json, so the MS3
  // build CAN render them — but the MS3 site never publishes them. Filtering by what ships
  // is what keeps them out of the MS3 snapshots (spec D-3).
  const shipped = shippedPanelRefs('ms3');
  for (const [ref] of renderFromBuild('ms3')) {
    assert.ok(shipped.has(ref), `${ref} is rendered for ms3 but does not ship there`);
  }
  assert.ok(!shipped.has('rotation.md'), 'rotation.md is expected to be resident-only');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/panel-build-render.test.mjs`
Expected: FAIL — `renderFromBuild`/`shippedPanelRefs`/`PANEL_BUILD_INPUTS` are not exported.

- [ ] **Step 3: Rename the source render and add the build render**

In `tests/_panel_render.mjs`:

(a) Rename the existing export. Change

```javascript
export const renderAll = () => topicEntries
```

to

```javascript
export const renderFromSource = () => topicEntries
```

and update its doc comment's first line to read
`/** Every page that renders a panel FROM THE SOURCE REGISTRIES, as [ref, html]. …`.

(b) Add these imports at the top, beside the existing ones:

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippedItemsWithSites } from '../faculty-console/content-universe.mjs';
```

(`fileURLToPath` turns the `ROOT` URL into a real path — `URL.pathname` percent-encodes, so a
repo checked out under a path with a space would silently resolve wrong.)

(c) Replace the `SNAPSHOT_DIR` export (and its trailing SCOPE comment block) with:

```javascript
// ---- the built-artifact render path -----------------------------------------------------------
//
// WHY THE BUILD AND NOT THE REGISTRIES: neither shipped site renders from the source registries.
// resident_section.py patches OUT's topic_meta with resident CTAs (:301) and rebuilds the index
// from resident nav (:358); both builds append Case-of-the-Week topic_meta derived at build time
// (build_deploy.py:308, resident_section.py:318). Reading _build/<site>/index.html evaluates the
// SHIPPED renderer over the SHIPPED data, so both are covered without re-deriving either — which
// is also what keeps this out of tests/shipped-pages-readers.test.mjs's way.

export const AUDIENCES = Object.freeze(['ms3', 'res']);

const REPO = fileURLToPath(ROOT);
export const builtIndexPath = (site) => path.join(REPO, '_build', assertSite(site), 'index.html');

function assertSite(site) {
  assert.ok(AUDIENCES.includes(site), `unknown audience '${site}' (expected ${AUDIENCES.join('|')})`);
  return site;
}

/* Every input whose edit invalidates a rendered panel, for staleBuildReason(). A path that does
   not exist throws there — a typo would make the freshness check vacuously "fresh" and retire
   the contract silently. */
export const PANEL_BUILD_INPUTS = [
  '13_Faculty_Resources/_automation/site_build/spa_index.html',
  '13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js',
  '13_Faculty_Resources/_automation/site_build/build_deploy.py',
  '13_Faculty_Resources/_automation/site_build/resident_section.py',
  '13_Faculty_Resources/_automation/site_build/shipped_pages.json',
  'topic_meta.json',
  'curriculum.json',
  'tool_registry.json',
  'communication_cases.json',
].map((rel) => path.join(REPO, rel));

const SHIPPED = readJSON('13_Faculty_Resources/_automation/site_build/shipped_pages.json');

/** Every page slug the derived universe scopes to `site`. Asking shipped_pages.json rather
 *  than a producer is ADR-002's rule; `sites` must stay an array, hence shippedItemsWithSites. */
export const shippedPanelRefs = (site) => new Set(
  shippedItemsWithSites({ shipped: SHIPPED })
    .filter((row) => row.kind === 'page' && row.sites.includes(assertSite(site)))
    .map((row) => row.slug),
);

/* Each payload is one `var FD_X={…};` line the build injected. Extracted by name rather than as
   one span so a missing or duplicated injection names itself, and so an unrelated neighbour
   (FD_ROLES sits between two of them) is never dragged in. */
const PAYLOAD_VARS = ['FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY', 'FD_SITE_MANIFEST'];

function payloadSource(html, site) {
  return PAYLOAD_VARS.map((name) => {
    const needle = `var ${name}=`;
    const at = html.indexOf(needle);
    assert.ok(at !== -1, `${site}: built index.html injects no ${name}`);
    assert.equal(html.indexOf(needle, at + 1), -1, `${site}: ${name} is injected more than once`);
    const end = html.indexOf('\n', at);
    assert.ok(end !== -1, `${site}: ${name} is not newline-terminated; it is no longer one line`);
    return html.slice(at, end);
  }).join('\n');
}

/** Render every panel the `site` build publishes, as [ref, html], sorted by ref.
 *  Sorted so the set is order-stable regardless of key order in the injected payload. */
export function renderFromBuild(site) {
  const html = readFileSync(builtIndexPath(site), 'utf8');

  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js'), ctx);
  vm.runInContext(payloadSource(html, site), ctx);
  for (const name of PAYLOAD_VARS) {
    assert.ok(ctx[name] && typeof ctx[name] === 'object', `${site}: ${name} did not evaluate to an object`);
  }
  const index = ctx.fdBuildIndex(ctx.FD_CURRICULUM, ctx.FD_TOPIC_META, ctx.FD_TOOL_REGISTRY, ctx.FD_SITE_MANIFEST);

  // The build already replaced the PRACTICE_CASE_TITLES needle, so unlike the source path
  // there is nothing to inject here — this is the renderer exactly as it ships.
  const builtPanel = slice(html, '/* ---- practice panel ---- */', '/* ---- end practice panel ---- */');
  const builtWorkflow = slice(html, '  var WF_STAGE_LABELS=', '  function toolExtraFromParams', { keepEnd: false });
  assert.ok(!builtPanel.includes('var PRACTICE_CASE_TITLES={};'),
    `${site}: the build left PRACTICE_CASE_TITLES uninjected; drills would render unnamed`);

  const built = new Function('esc', 'ctaHref', 'ctaAttrs', 'FD_INDEX', 'FD_TOOL_REGISTRY', 'window',
    `${builtWorkflow}\n${builtPanel}\nreturn { buildTpl: buildTpl, hasPracticeTpl: hasPracticeTpl };`,
  )(esc, ctaHref, ctaAttrs, index, ctx.FD_TOOL_REGISTRY, {});

  const ships = shippedPanelRefs(site);
  return Object.entries(ctx.FD_TOPIC_META)
    .filter(([ref, m]) => m && typeof m === 'object' && ships.has(ref) && built.hasPracticeTpl(m))
    .map(([ref, m]) => [ref, built.buildTpl(m, ref)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** tests/__panels__/<site>/ — one directory per audience, because a single directory could
 *  not say which site a file described. That ambiguity is what produced all three defects. */
export const snapshotDir = (site) => new URL(`__panels__/${assertSite(site)}/`, new URL('tests/', ROOT));
```

(d) Rewrite the module's header comment. Replace the two paragraphs beginning
`* WHAT IT COVERS: the MS3 source-registry render` and `* NOTE ON ORDERING:` with:

```
 * TWO INPUT BINDINGS, ONE EVALUATOR. renderFromSource() reads the source registries and backs
 * tests/practice-panel.test.mjs's property assertions, which must run on a fresh clone in CI.
 * renderFromBuild(site) reads _build/<site>/index.html — the shipped renderer over the shipped
 * data — and backs the per-audience snapshots. The slicing and the `new Function` construction
 * are shared; only the inputs differ, so there is still no second renderer.
 *
 * COVERAGE: 96 of the 97 shipped pages, across both audiences. rapid_review.md has no
 * topic_meta entry and therefore renders no panel; tests/panel-snapshots.test.mjs asserts that
 * it is the only page missing, by name, rather than counting around it.
 *
 * ORDERING: the byte-comparison gate runs from build_and_check.sh AFTER build_deploy.py, so a
 * failure leaves _build/ current and `node bin/render_panels.mjs --write` repairs it with no
 * rebuild. A build-dependent test in the PRE-build node suite would wedge the build that fixes
 * it (CLAUDE.md, T17); that is why the comparison is not there.
```

- [ ] **Step 4: De-reference the two removed exports**

`renderAll` and `SNAPSHOT_DIR` are gone. Two files still name them, and both must be updated in
THIS commit: `build_and_check.sh` runs `node --test tests/*.test.mjs` (line 59) *before*
`build_deploy.py` (line 72), so a red node suite blocks the build that Task 4 needs.

(a) In `tests/practice-panel.test.mjs`, change

```javascript
  F, renderAll, topicEntries, esc, actionKey, manifestTitle, source,
```

to

```javascript
  F, renderFromSource, topicEntries, esc, actionKey, manifestTitle, source,
```

Then replace every `renderAll(` call in that file with `renderFromSource(`.

(b) In `tests/panel-snapshots.test.mjs`, make the same two mechanical renames — nothing else.
Task 4 rewrites this file wholesale; these two lines only keep the suite loading until then.
Change the import

```javascript
  renderAll, formatPanel, unformatPanel, snapshotName, SNAPSHOT_DIR, topicEntries,
```

to

```javascript
  renderFromSource, formatPanel, unformatPanel, snapshotName, snapshotDir, topicEntries,
```

then change `const panels = renderAll();` to `const panels = renderFromSource();` and
`const DIR = fileURLToPath(SNAPSHOT_DIR);` to `const DIR = fileURLToPath(snapshotDir('ms3'));`.

Its assertions render from source and compare against the existing 74-file ms3 corpus, so they
keep passing untouched.

Run: `grep -rn "renderAll\|SNAPSHOT_DIR" tests/ bin/ --include=*.mjs | grep -v "^bin/render_panels.mjs"`
Expected: no output. (`bin/render_panels.mjs` is excluded — Task 3 replaces it wholesale; it is
not in the node suite and is not invoked by the build until Task 5.)

- [ ] **Step 5: Run the tests**

Run: `node --test tests/panel-build-render.test.mjs tests/practice-panel.test.mjs`
Expected: `panel-build-render` PASS (or all three skip with a rebuild message if `_build/` is
stale — in that case run `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`
first, which builds both trees, then re-run). `practice-panel` PASS, same count as before.

Then confirm the whole suite still loads, which is what Step 4(b) protects:

Run: `node --test tests/*.test.mjs 2>&1 | tail -8`
Expected: `fail 0`. A `renderAll is not exported` error here means Step 4(b) was skipped.

- [ ] **Step 6: Prove the freshness guard is not vacuous**

Run: `node -e "import('./tests/_panel_render.mjs').then(m=>{const fs=require('fs');for(const p of m.PANEL_BUILD_INPUTS) if(!fs.existsSync(p)) throw new Error('missing '+p); console.log('all',m.PANEL_BUILD_INPUTS.length,'declared inputs exist')})"`
Expected: `all 9 declared inputs exist`

- [ ] **Step 7: Commit**

```bash
git add tests/_panel_render.mjs tests/practice-panel.test.mjs tests/panel-build-render.test.mjs
git commit -m "feat(panel): render from each build's own index.html

renderFromBuild(site) evaluates the shipped renderer over the shipped
payload, so resident overlays and the build-derived Case-of-the-Week
metadata are covered without re-deriving either producer.

renderAll becomes renderFromSource: with two bindings the old name no
longer says which one it is.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Rewrite the CLI to take a site and report real coverage

**Files:**
- Modify: `bin/render_panels.mjs` (full rewrite)

**Interfaces:**
- Consumes: `renderFromBuild`, `snapshotDir`, `shippedPanelRefs`, `formatPanel`, `snapshotName`, `AUDIENCES`, `PANEL_BUILD_INPUTS` (Task 2); `staleBuildReason` (on main).
- Produces: the executable gate `node bin/render_panels.mjs [--check|--write] [--site ms3|res]`. Exit 0 clean, 1 on drift, 2 when the build is missing or stale. `build_and_check.sh` (Task 6) calls `--check --site <site>`.

- [ ] **Step 1: Replace the file**

Replace all of `bin/render_panels.mjs` with:

```javascript
#!/usr/bin/env node
/* Render every "On the Unit Practice and Tools" panel each site publishes and compare it
 * against tests/__panels__/<site>/.
 *
 * WHAT IT ANSWERS: "does this change what a learner actually sees?" — the question that came up
 * in WP-A, WP-B and WP-F and was answered each time by a hand-written script that was then
 * thrown away. The headline output is the measurement those answers turned on:
 *
 *     0 of 164 panels changed
 *
 * It renders from _build/<site>/index.html, which carries the injected payloads AND the panel
 * code with its case-title needle already replaced. So this is the shipped renderer over the
 * shipped data, per audience: resident overlays and the build-derived Case-of-the-Week panels
 * are covered, and nothing is re-derived.
 *
 * USAGE
 *   node bin/render_panels.mjs                     # check both audiences
 *   node bin/render_panels.mjs --site res          # check one
 *   node bin/render_panels.mjs --write             # accept the current render as the snapshot
 *
 * Needs a current _build/. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`
 * builds BOTH trees, so one run is enough to regenerate both audiences.
 *
 * HOW TO USE IT ON A CHANGE. Run it before you edit to confirm you start clean, then after. If
 * the count is 0, your edit is provably invisible to learners and you can say so with a number.
 * If it is not 0, run --write and read the diff of tests/__panels__/ — that diff IS the set of
 * learner-visible changes, page by page, and it belongs in the PR as the evidence for them.
 *
 * WHY JS AND NOT PYTHON, unlike the rest of bin/: the renderer being pinned is JavaScript, and
 * it is evaluated for real rather than re-implemented. A Python port would be a second renderer
 * that could disagree with the shipped one, which is the failure this prevents.
 *
 * THE ENFORCING GATE is build_and_check.sh, which calls this with --check after build_deploy.py.
 * ci.yml and bin/verify.sh already run that script for both sites, so this adds no CI step and
 * trips none of the three contracts CLAUDE.md warns a new one trips. Running after the build is
 * also what keeps --write always available: a failure leaves _build/ current.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from '../tests/_build_freshness.mjs';
import {
  AUDIENCES, PANEL_BUILD_INPUTS, formatPanel, renderFromBuild, shippedPanelRefs,
  snapshotDir, snapshotName,
} from '../tests/_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('usage: node bin/render_panels.mjs [--check|--write] [--site ms3|res]\n'
    + '  --check   (default) compare the live render against tests/__panels__/; exit 1 on drift\n'
    + '  --write   accept the current render as the new snapshot\n'
    + '  --site    limit to one audience (default: both)');
  process.exit(0);
}

const WRITE = argv.includes('--write');
const siteFlag = argv.indexOf('--site');
if (siteFlag !== -1 && !AUDIENCES.includes(argv[siteFlag + 1] || '')) {
  console.error(`--site needs one of ${AUDIENCES.join('|')}`);
  process.exit(2);
}
const sites = siteFlag === -1 ? [...AUDIENCES] : [argv[siteFlag + 1]];

let drift = 0;
let covered = 0;
let shippedTotal = 0;
const shippedSeen = new Set();

for (const site of sites) {
  const stale = staleBuildReason(REPO, site, PANEL_BUILD_INPUTS);
  if (stale) {
    console.error(`cannot render ${site}: ${stale}`);
    process.exit(2);
  }

  const dir = fileURLToPath(snapshotDir(site));
  const panels = renderFromBuild(site);
  const expected = new Map(panels.map(([ref, html]) => [snapshotName(ref), formatPanel(html)]));

  if (WRITE) mkdirSync(dir, { recursive: true });
  const onDisk = existsSync(dir)
    ? new Set(readdirSync(dir).filter((f) => f.endsWith('.html')))
    : new Set();

  const changed = [];
  const added = [];
  for (const [name, want] of expected) {
    if (!onDisk.has(name)) { added.push(name); continue; }
    if (readFileSync(path.join(dir, name), 'utf8') !== want) changed.push(name);
  }
  // An orphan is a page that stopped publishing a panel on this site. Leaving it behind would
  // let a snapshot outlive the page it describes, so --write removes it and says which.
  const orphaned = [...onDisk].filter((f) => !expected.has(f));

  if (WRITE) {
    for (const [name, text] of expected) writeFileSync(path.join(dir, name), text);
    for (const f of orphaned) rmSync(path.join(dir, f));
  }

  const ships = shippedPanelRefs(site);
  const noPanel = [...ships].filter((ref) => !expected.has(snapshotName(ref))).sort();
  for (const ref of ships) shippedSeen.add(ref);
  shippedTotal += ships.size;
  covered += panels.length;
  drift += changed.length + added.length + orphaned.length;

  console.log(`${site}: ${panels.length} panels ${WRITE ? 'written' : 'compared'}`
    + ` · ${ships.size} pages ship`
    + (noPanel.length ? ` · ${noPanel.length} render no panel (${noPanel.join(', ')})` : ''));
  const list = (label, names) => { for (const n of names) console.log(`    ${label} ${n}`); };
  list('changed ', changed);
  list('new     ', added);
  list('orphaned', orphaned);
}

if (sites.length === AUDIENCES.length) {
  console.log(`coverage: ${covered} panels over ${shippedSeen.size} distinct shipped pages`
    + ` (${shippedTotal} page-site pairs)`);
}
console.log(`${drift} of ${covered} panels changed`);

if (!drift) process.exit(0);
if (WRITE) {
  console.log('\nSnapshots updated. Read the diff — it is the learner-visible change.');
  process.exit(0);
}
console.log('\nThe rendered panels no longer match their snapshots.\n'
  + 'If the change is intended, run `node bin/render_panels.mjs --write` and commit the diff.');
process.exit(1);
```

- [ ] **Step 2: Verify it refuses to run without a build**

Run: `mv _build _build.away && node bin/render_panels.mjs --site ms3; echo "exit=$?"; mv _build.away _build`
Expected: `cannot render ms3: _build/ms3 is not built …` and `exit=2`.

- [ ] **Step 3: Verify the producers are not read directly**

Run: `node --test tests/shipped-pages-readers.test.mjs`
Expected: PASS. (`bin/render_panels.mjs` is outside `tests/`, so it is scanned; it must never
name `site_manifest.json` or `cotw_registry.json` in a quoted path.)

- [ ] **Step 4: Commit**

```bash
git add bin/render_panels.mjs
git commit -m "feat(panel): render per audience from the build, drop the scope caveat

Takes --site, reports coverage per audience against shipped_pages.json,
and exits 2 with the rebuild command when _build/ is missing or stale.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Regenerate the corpus and re-point its contracts at it

Two halves of one change, and the order between them is forced. `build_and_check.sh` runs
`node --test tests/*.test.mjs` (line 59) *before* `build_deploy.py` (line 72), so the contracts
must stop rendering before the build can run — and the new contracts cannot be verified until the
build has produced the corpus. Hence: rewrite, build, write, verify, one commit.

**Files:**
- Rewrite: `tests/panel-snapshots.test.mjs`
- Modify: `tests/__panels__/ms3/` (74 -> 79 files)
- Create: `tests/__panels__/res/` (85 files)

**Interfaces:**
- Consumes: `snapshotDir`, `shippedPanelRefs`, `snapshotName`, `formatPanel`, `unformatPanel`,
  `TOPIC_META`, `AUDIENCES` (Task 2); the CLI from Task 3.
- Produces: the committed corpus the Task 5 gate compares against.

- [ ] **Step 1: Replace the file**

Replace all of `tests/panel-snapshots.test.mjs` with:

```javascript
/* Snapshot contracts for the pinned "On the Unit Practice and Tools" panel.
 *
 * WHAT RUNS WHERE, and why it is split. The byte-comparison — "did any panel change?" — needs a
 * build, so it runs from build_and_check.sh AFTER build_deploy.py (see bin/render_panels.mjs).
 * Everything in THIS file reads only committed files, so it runs on a fresh clone in CI, where
 * _build/ does not exist. Putting the comparison here instead would either skip in CI or wedge
 * the build that repairs it (CLAUDE.md, T17).
 *
 * WHAT THIS PINS, that tests/practice-panel.test.mjs does not: that file asserts PROPERTIES of a
 * rendered panel. This asserts properties of the stored corpus — that it is complete against what
 * ships, that it contains real panels, and that its storage format can hide nothing.
 *
 * THE FRICTION IS THE FEATURE. An intended change to the panel requires regenerating these
 * snapshots, and the resulting diff of tests/__panels__/ is the learner-visible delta, page by
 * page. Reviewing that diff is the point; committing it is how the change gets evidenced. Do not
 * relax these tests to avoid regenerating — regenerate.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  AUDIENCES, TOPIC_META, formatPanel, shippedPanelRefs, snapshotDir, snapshotName, unformatPanel,
} from './_panel_render.mjs';

const REGEN = 'rebuild, then run `node bin/render_panels.mjs --write` and commit the diff';
const dirOf = (site) => fileURLToPath(snapshotDir(site));
const filesOf = (site) => readdirSync(dirOf(site)).filter((f) => f.endsWith('.html')).sort();

test('both audiences have a populated snapshot directory', () => {
  for (const site of AUDIENCES) {
    assert.ok(existsSync(dirOf(site)), `tests/__panels__/${site}/ is missing — ${REGEN}`);
    assert.ok(filesOf(site).length > 0, `tests/__panels__/${site}/ is empty — ${REGEN}`);
  }
});

test('every shipped page that renders a panel has a snapshot, and nothing else does', () => {
  // The set difference, not a count. #539 pinned {cotw_registry: 22, site_manifest: 1}; those
  // numbers move for several unrelated reasons and invite being bumped. A named set does not.
  for (const site of AUDIENCES) {
    const stored = new Set(filesOf(site));
    const shipped = [...shippedPanelRefs(site)].sort();

    const missing = shipped.filter((ref) => !stored.has(snapshotName(ref)));
    assert.deepEqual(missing, ['rapid_review.md'],
      `${site}: the set of shipped pages with no snapshot changed.\n`
      + '  rapid_review.md is expected here and only here: it has no topic_meta entry, so it\n'
      + '  renders no panel. Anything else means a page that ships lost or gained a panel, or a\n'
      + `  new page-producing route appeared — snapshot it (${REGEN}) or record why not.`);

    const shippedFiles = new Set(shipped.map(snapshotName));
    const extra = [...stored].filter((f) => !shippedFiles.has(f)).sort();
    assert.deepEqual(extra, [],
      `${site}: snapshots for pages that site does not publish — ${REGEN}`);
  }
});

test('the one uncovered page is uncovered because it has no metadata at all', () => {
  // Guards the exemption above from decaying into a permanent excuse. If rapid_review.md ever
  // gains a topic_meta entry it can render a panel, and it needs a snapshot like everything else.
  assert.ok(!TOPIC_META['rapid_review.md'],
    'rapid_review.md now has a topic_meta entry — it may render a panel and needs snapshotting');
});

test('the stored snapshots are real panels, not an empty render agreeing with an empty file', () => {
  // The failure this guards is the one that made a WP-B assertion vacuous on #480: a check that
  // passes because both sides are empty proves nothing. A snapshot must actually contain a panel.
  for (const site of AUDIENCES) {
    for (const file of filesOf(site)) {
      const got = readFileSync(path.join(dirOf(site), file), 'utf8');
      assert.match(got, /<details class="topic-tpl practice-panel">/, `${site}/${file}: not a panel`);
      assert.match(got, /<span class="practice-title">On the Unit Practice and Tools<\/span>/,
        `${site}/${file}: has lost the panel title`);
      assert.ok(got.length > 200, `${site}/${file}: implausibly short (${got.length} bytes)`);
    }
  }
});

test('the snapshot format only inserts line breaks — no render change can hide in it', () => {
  // formatPanel breaks between adjacent tags so the diff is readable. If it also normalised or
  // dropped anything, a real change could be formatted away and the gate would pass through it.
  // Pinned on the whole stored corpus, because the property has to hold for the content that
  // exists — and reading the corpus keeps this build-independent.
  for (const site of AUDIENCES) {
    for (const file of filesOf(site)) {
      const stored = readFileSync(path.join(dirOf(site), file), 'utf8');
      assert.equal(formatPanel(unformatPanel(stored)), stored,
        `${site}/${file}: unformatting a snapshot and reformatting it does not return the original`);
    }
  }
});

test('the audiences are stored apart, and their difference is real', () => {
  // 68 refs ship to both sites and only a handful render differently. Storing them per audience
  // costs duplication and buys the ability to say WHICH site a file describes — the ambiguity
  // that let a resident-only change report zero drift (Codex P2 on #539).
  const resFiles = new Set(filesOf('res'));
  const shared = filesOf('ms3').filter((f) => resFiles.has(f));
  assert.ok(shared.length > 50, `expected many pages to ship to both sites, saw ${shared.length}`);
  const differing = shared.filter((f) => readFileSync(path.join(dirOf('ms3'), f), 'utf8')
    !== readFileSync(path.join(dirOf('res'), f), 'utf8'));
  assert.ok(differing.length > 0,
    'no shared page renders differently between audiences; the resident overlay may have stopped '
    + 'being applied, or the two corpora are no longer built from different payloads');
});
```

- [ ] **Step 2: Build both trees**

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res 2>&1 | tail -20`
Expected: `build_and_check: res OK`. (The `res` branch builds MS3 first, so both trees land.)

- [ ] **Step 3: Write both audiences**

Run: `node bin/render_panels.mjs --write`
Expected output ends with a coverage line and a non-zero change count (the corpus is moving from
a source render to a build render, so this is the intended diff).

- [ ] **Step 4: Verify the corpus has the expected shape**

Run: `ls tests/__panels__/ms3 | wc -l; ls tests/__panels__/res | wc -l`
Expected: `79` then `85`.

Run: `ls tests/__panels__/ms3 | grep -c '^cotw_2'; ls tests/__panels__/res | grep -c '^cotw_2'`
Expected: `11` then `11`.

Run: `ls tests/__panels__/ms3 | grep -cE '^(rotation|adv_psychopharm|cl_reference|systems_medlegal|supervision_teaching|canon_200)\.md\.html$'`
Expected: `0` — the six resident-only pages are gone from the MS3 corpus (spec D-3).

Run: `grep -l 'Board-Style Question Bank' tests/__panels__/res/*.html | wc -l; grep -l 'Board-Style Question Bank' tests/__panels__/ms3/*.html | wc -l`
Expected: a non-zero count then `0`.

- [ ] **Step 5: Confirm a re-run is clean**

Run: `node bin/render_panels.mjs`
Expected: `0 of 164 panels changed`.

- [ ] **Step 6: Run it**

Run: `node --test tests/panel-snapshots.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 7: Prove it runs without a build**

Run: `mv _build _build.away && node --test tests/panel-snapshots.test.mjs; echo "exit=$?"; mv _build.away _build`
Expected: PASS, `exit=0` — no test skipped, none errored on a missing `_build/`.

- [ ] **Step 8: Prove the coverage test is not vacuous**

Run: `mv tests/__panels__/res/suicide.md.html /tmp/ && node --test tests/panel-snapshots.test.mjs; echo "exit=$?"; mv /tmp/suicide.md.html tests/__panels__/res/`
Expected: FAIL naming `suicide.md` in the `missing` list, `exit=1`. Then the corpus is restored.

- [ ] **Step 9: Run the whole node suite**

Run: `node --test tests/*.test.mjs 2>&1 | tail -15`
Expected: `pass` count up, `fail 0`.


- [ ] **Step 10: Commit**

```bash
git add tests/panel-snapshots.test.mjs tests/__panels__
git commit -m "test(panel): snapshot both audiences, pin the stored corpus

ms3 74 -> 79 (six resident-only pages out, eleven Case-of-the-Week in);
res 85, new. 96 of 97 shipped pages now have a panel snapshot.

The contracts now read only committed files, so they run on a fresh clone;
the byte-comparison moves to the post-build gate. Coverage becomes a named
set difference instead of two counts that invite being bumped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 5: Wire the gate into the build

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh` (after line 80 and after line 97)

**Interfaces:**
- Consumes: `bin/render_panels.mjs --check --site <site>` (Task 3).
- Produces: the enforcing gate. No `ci.yml` change — `ci.yml:220-224` and `bin/verify.sh:180-181` already invoke this script for both sites.

- [ ] **Step 1: Add the ms3 gate**

In the `ms3)` branch, immediately after the `shipped_pages.py --check-build … --site ms3` line
and before the Anki line, insert:

```bash
    echo "── Panel snapshots: $MS3_OUT"
    node "$LIB/bin/render_panels.mjs" --check --site ms3
```

- [ ] **Step 2: Add the res gate**

In the `res)` branch, in the same position relative to its `--check-build … --site res` line:

```bash
    echo "── Panel snapshots: $RES_OUT"
    node "$LIB/bin/render_panels.mjs" --check --site res
```

- [ ] **Step 3: Document the gate in the script header**

In the `Gate semantics:` block at the top of the file, after the `shipped_pages.py --check-build`
bullet, add:

```
# - render_panels.mjs --check re-renders every panel this build publishes and compares it
#   against tests/__panels__/<site>/. It runs HERE rather than in the node suite because it
#   needs the build: the suite runs before build_deploy.py, so a build-dependent test there
#   would skip in CI and wedge the build that repairs it. Running after the build also means
#   a failure leaves _build/ current, so `node bin/render_panels.mjs --write` always fixes it.
```

- [ ] **Step 4: Verify both gates fire and pass**

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 2>&1 | grep -A2 "Panel snapshots"`
Expected: the header line, then `ms3: 79 panels compared …` and `0 of 79 panels changed`.

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res 2>&1 | grep -A2 "Panel snapshots"`
Expected: the same for `res: 85 panels compared`.

- [ ] **Step 5: Verify no CI contract moved**

Run: `python3 bin/check-verify-coverage.py; echo "exit=$?"`
Expected: `exit=0`.

Run: `python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py; echo "exit=$?"`
Expected: `exit=0` — no workflow file was edited, so no digest recompute is owed.

Run: `git diff --name-only origin/main...HEAD -- .github/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_and_check.sh
git commit -m "feat(build): gate panel snapshots after the build, per site

ci.yml and bin/verify.sh already run this script for both sites, so the
gate needs no CI step and trips none of the three contracts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Falsify the gate, then run the full battery

A gate nobody has seen fail is a claim, not a gate. Both Codex defects get a live demonstration.

**Files:** none modified permanently — each perturbation is reverted in the same step.

- [ ] **Step 1: Prove a resident-only change produces resident-only drift**

`resident_section.py` titles `shelf-mode.html` "Board-Style Question Bank". Change that string
to `Board-Style Question Bank (drift probe)`:

```bash
python3 - <<'EOF'
import pathlib
p = pathlib.Path('13_Faculty_Resources/_automation/site_build/resident_section.py')
t = p.read_text(encoding='utf-8')
assert t.count('Board-Style Question Bank') == 1, 'expected exactly one occurrence to perturb'
p.write_text(t.replace('Board-Style Question Bank', 'Board-Style Question Bank (drift probe)'), encoding='utf-8')
EOF
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res 2>&1 | tail -12
```

Expected: the build FAILS at `── Panel snapshots: …/res` with a non-zero changed count naming
`shelf.md.html` (and any other page linking the tool).

Then confirm MS3 is untouched and revert:

```bash
node bin/render_panels.mjs --site ms3; echo "ms3 exit=$?"
git checkout -- 13_Faculty_Resources/_automation/site_build/resident_section.py
```

Expected: `0 of 79 panels changed`, `ms3 exit=0`. **This is the D-1 defect demonstrated fixed:
before this change the same perturbation reported zero drift.**

- [ ] **Step 2: Prove a Case-of-the-Week change produces drift on both**

```bash
python3 - <<'EOF'
import json, pathlib
p = pathlib.Path('08_Cases_and_Simulation/case-of-the-week/cotw_registry.json')
d = json.loads(p.read_text(encoding='utf-8'))
d['weeks'][0]['label'] += ' (drift probe)'
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
EOF
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res 2>&1 | tail -12
```

Expected: FAIL at the panel gate naming a `cotw_*` snapshot.

Then check ms3 and revert:

```bash
node bin/render_panels.mjs --site ms3; echo "ms3 exit=$?"
git checkout -- 08_Cases_and_Simulation/case-of-the-week/cotw_registry.json
```

Expected: non-zero drift on ms3 too (`ms3 exit=1`), naming a `cotw_*` snapshot.
**This is the D-2 defect demonstrated fixed.**

- [ ] **Step 3: Rebuild clean and confirm the tree is back to zero drift**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res 2>&1 | tail -3
node bin/render_panels.mjs
git status --porcelain
```

Expected: `build_and_check: res OK`, `0 of 164 panels changed`, and a clean working tree.

- [ ] **Step 4: Run the full local gate**

Run: `bash bin/verify.sh 2>&1 | tail -30`
Expected: every step PASS, `0` failures. (~90 s+; background it to a log and poll if preferred.)

- [ ] **Step 5: Confirm the scope caveats are gone**

Run: `grep -rn "74 of 97\|NOT covered\|source registries — 74\|is not what the resident site ships" bin/render_panels.mjs tests/_panel_render.mjs tests/panel-snapshots.test.mjs`
Expected: no output.

- [ ] **Step 6: Push and update the PR**

```bash
git push origin claude/panel-snapshot-harness
gh pr checks 539 --watch
```

Expected: `build-test-validate` and the smoke job green.

- [ ] **Step 7: Answer both Codex threads and update the PR body**

Reply on review comment `3941015128` (resident overlays) and `3941015131` (COTW), each stating
what now covers it and the falsification evidence from Steps 1–2. Update the PR description's
scope paragraph to the real coverage: 164 panels, 96 of 97 shipped pages, `rapid_review.md` the
only uncovered page and why.

---

## Self-Review

**Spec coverage.** D1 → Task 2. D2 → Task 2 (`renderFromSource` kept, `renderFromBuild` added).
D3 → Task 5. D4 → Task 2 (`shippedPanelRefs` filter) + Task 4 (per-audience dirs). D5 → Task 1.
D6 → Task 4. Coverage table → Task 4 Step 4 and Task 4's set-equality test. R1 (hard fail) →
Task 5, unsoftened. R2 → Task 4's expected non-zero diff. R3 → Task 2's payload assertions.
R4 → Task 2's `payloadSource` duplicate/missing assertions. All six verification items in the
spec appear: (1) Task 4 Step 5, (2) Task 6 Step 1, (3) Task 6 Step 2, (4) Task 4 Step 7,
(5) Task 6 Step 4, (6) Task 5 Step 5.

**Placeholders.** None. Every code step carries the code; every run step carries the command and
its expected output.

**Type consistency.** `renderFromBuild(site) -> [ref, html][]`, `snapshotDir(site) -> URL`,
`shippedPanelRefs(site) -> Set<string>`, `shippedItemsWithSites({shipped}) -> rows[]`,
`PANEL_BUILD_INPUTS: string[]`, `AUDIENCES: readonly string[]` — used with those shapes in
Tasks 3, 5 and the Task 2 test. `snapshotName(ref) -> string` and `formatPanel`/`unformatPanel`
keep their #539 signatures. The old `SNAPSHOT_DIR` constant and `renderAll` are both removed and
have no remaining referents: Task 2 Step 4 updates both files that name them and greps to prove
it, and Task 3 replaces `bin/render_panels.mjs` — the only other consumer — wholesale.
