# Audience as a Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "which site a page ships to" a field in `site_manifest.json` rather than a `shutil.copytree` plus a second hand-maintained nav literal, so a new audience is a manifest edit instead of a new 245-line fork.

**Architecture:** Migrate `site_manifest.json` from positional arrays to named objects behind a loader seam, add a `sites[]` membership field with per-site overrides, move the nav tree into the manifest, generate `nav.json` from it, and replace `build_deploy.py` + `resident_section.py` with one `build_site.py --site` entrypoint.

**Tech Stack:** Python 3.11, JSON Schema draft-07 via `jsonschema==4.26.0`, Node `node:test`, Playwright, Netlify Functions v2, existing MS3/resident static build pipeline.

**Supersedes:** `docs/superpowers/plans/2026-07-15-wave-c-hardening.md` §WP-12 ("Single-source nav"), which proposed a separate `nav_source.json`. This plan folds nav into `site_manifest.json` instead — one registry, not two. Close WP-12 as superseded when Task 5 lands.

**Context:** `docs/ARCHITECTURE_REVIEW_2026-07-26.md` §S1 and §3 Phase 2.

---

## Prerequisite (blocking)

- [ ] **PR #264 (`chore/extract-shared-build-logic`) must be merged to `main` first.** This plan assumes `13_Faculty_Resources/_automation/site_build/common.py` exists and that both build scripts already import it. It does not exist on `origin/main` today. Do not start Task 1 until `git show origin/main:13_Faculty_Resources/_automation/site_build/common.py` succeeds.

---

## Global Constraints

- `site_manifest.json` becomes the single source of truth for **what ships, to which site, in what order**. Nav structure moves into it; the two Python nav literals are deleted.
- **Do not change the runtime shape of `nav.json`.** It stays a bare top-level JSON array of `{section, pinned?, items:[{t,f,k,hidden?}]}`. Six consumers depend on it (see File structure).
- **Order is semantic.** `nav.json` has no ordering key — order *is* array position, at both the section and item level. The manifest must own that order explicitly. Never derive item order from a flat list plus a `section` tag.
- **Section name strings are user-visible state keys.** `spa_index.html` keys `cw_nav_v1` (sidebar open/closed) and the DOM id `navgrp-<slug>` off `sec.section`. Renaming a section silently resets every learner's saved sidebar state. Do not rename sections in this plan.
- **Site vocabulary is `ms3` and `resident`** in all new data and code, matching `validate_tool_governance.py`. `build_and_check.sh` keeps accepting `ms3|res` (Netlify's per-site build command depends on it) and maps `res`→`resident` at exactly one place. `_build/ms3` and `_build/res` directory names do not change.
- The manifest membership field is named **`sites`**, not `audiences`. `audiences` is already taken: `validate_tool_governance.py:47` defines `ALLOWED_AUDIENCES = {"trainee","ms3","resident","faculty"}` for a per-tool *learner-level* marker parsed out of tool HTML. These are different concepts and must not share a name.
- **Every task must leave the build output byte-identical** except where the task explicitly declares a diff, and every declared diff must be enumerated and justified in the task's verification step.
- Preserve `hidden` semantics exactly: hidden items are excluded from the search index, still counted by the QA gate's orphan check, and still routable at runtime.
- Do not attest content, change review decisions, or edit clinical prose, doses, evidence claims, or question-bank items.
- Preserve existing `cw_*` / `rp_*` storage contracts.
- No PHI. Clinical content stays synthetic/de-identified.
- Build MS3 and resident sequentially — they share generated output today and will share a manifest read after.
- Execute in an isolated worktree created from current `origin/main`.

---

## Execution setup

Josh's checked-out branch is routinely **stale relative to `origin/main`** even when `git rev-list --count origin/main..HEAD` reports it as ahead. Copying files out of the working tree into a main-based branch silently reverts main-only work. Always re-apply changes to files as they exist on `origin/main`.

```bash
cd /Users/jm/Psychiatry-Clerkship-Library
git fetch origin
git worktree add .worktrees/audience-data-model origin/main -b feat/audience-as-a-data-model
cd .worktrees/audience-data-model
git status --short --branch
git log -3 --oneline
```

Expected: a clean branch at `origin/main`'s tip, no unrelated dirty files. `.worktrees/` is gitignored. Remove with `git worktree remove .worktrees/audience-data-model --force` when done — never disturb the primary checkout, which usually holds unrelated uncommitted work.

**Capture the parity baseline before Task 1** and keep it for the whole plan:

```bash
SB=13_Faculty_Resources/_automation/site_build
rm -rf /tmp/base_ms3 /tmp/base_res
OUT_DIR=/tmp/base_ms3 python3 $SB/build_deploy.py
MS3_DIR=/tmp/base_ms3 OUT_DIR=/tmp/base_res python3 $SB/resident_section.py
for d in base_ms3 base_res; do (cd /tmp/$d && find . -type f | sort | xargs md5sum > /tmp/$d.sums); done
# normalized nav (order-preserving, key-order-insensitive) for later semantic parity
for d in base_ms3 base_res; do python3 -c "import json,sys;print(json.dumps(json.load(open('/tmp/$d/nav.json')),sort_keys=True,indent=1))" > /tmp/$d.nav.norm; done
```

**Parity helper** — every task's verification uses this:

```bash
# usage: parity <baseline-dir> <new-dir>
parity () {
  (cd "$2" && find . -type f | sort | xargs md5sum > /tmp/new.sums)
  echo "-- added --";   comm -13 <(cut -d' ' -f3- "/tmp/$(basename $1).sums"|sort) <(cut -d' ' -f3- /tmp/new.sums|sort)
  echo "-- removed --"; comm -23 <(cut -d' ' -f3- "/tmp/$(basename $1).sums"|sort) <(cut -d' ' -f3- /tmp/new.sums|sort)
  echo "-- changed --"; join -j2 <(sort -k2 "/tmp/$(basename $1).sums") <(sort -k2 /tmp/new.sums) | awk '$2!=$3{print $1}'
}
```

Note `tools/*.html` will always show as changed because `quizzes.json?v=<epoch>` is time-based. Normalize with `sed 's/quizzes\.json?v=[0-9]*/TS/g'` before comparing any HTML file.

---

## ⚠️ Three hazards that will bite if not handled

1. **`faculty-console/netlify/functions/attest.mjs` is a deployed Netlify function that reads `site_manifest.json` from GitHub at runtime** (`MANIFEST_PATH`, `:19`), and destructures positionally: `markdown.map(([, slug]) => slug)` (`:546-560`). **No build gate covers it.** The moment the new format merges to `main`, the live faculty console breaks silently. It must be updated in the same commit as the format change (Task 2), and the console redeployed.

2. **A per-site source map is *narrower* than today's resident map.** `resident_section.py:100-108` currently unions MS3's map with resident extras, so the resident map is a superset. The QA gate's orphaned-source check (`check-static-site.mjs:354-390`) scans the whole `NN_Category/` tree against one map and HARD-fails anything matching the content-page naming conventions that isn't wired in. A correctly-narrow resident map could newly hard-fail on MS3-only pages. **Resolution: the source map stays union-of-all-sites, not per-site.** It answers "is this source wired into the build at all", not "does this ship to this site". Add a comment saying so.

3. **Deleting `_HIDDEN_INHERITED` changes learner-visible progress percentages on the resident site.** Those 23 pages currently ship to resident and count in `reviewableItems()` (`spa_index.html:529`, no hidden filter) and `navScan()`. Dropping them is correct — they were pure QA-gate appeasement — but resident completion percentages will jump. Call this out in the PR body; it is a behavior change, not a bug.

---

## Target manifest shape

Introduced incrementally across Tasks 2–5. Final form:

```jsonc
{
  "_note": "Single source of truth for what ships, to which site, in what order. ...",
  "sites": {
    "ms3":      { "buildDir": "ms3", "title": "MS3 Psychiatry Clerkship" },
    "resident": { "buildDir": "res", "title": "MMC Psychiatry Residency",
                  "branding": [
                    { "file": "index.html", "replacements": [ ["MS3 Psychiatry Clerkship", "MMC Psychiatry Residency"], ["MS3 Clerkship", "Resident Rotation"] ] },
                    { "file": "tools/learning-path.html", "replacements": [ ["Inpatient Psychiatry — Learning Path", "MMC Psychiatry — Learning Path"] ] }
                  ],
                  "dataOverrides": { "reasoning_cases.json": "reasoning_cases_resident.json" },
                  "ctaAdditions": { "agitation.md": [ { "label": "Open the Agitation Ladder trainer", "href": "tools/rp-agitation.html" } ] } }
  },
  "nav": [
    { "section": "Welcome and Orientation", "pinned": true, "items": [
        { "kind": "md", "slug": "welcome.md", "title": "Welcome to the Rotation",
          "source": "14_Tracks/MS3/Student_Ready_Pack/.../welcome.md",
          "sites": ["ms3", "resident"],
          "overrides": { "resident": { "source": "14_Tracks/Resident/resident_welcome.md",
                                       "title": "Welcome — Resident Rotation" } } },
        { "kind": "tool", "slug": "learning-path.html", "title": "Learning Path",
          "source": "01_Six_Week_Curriculum/learning-path.html",
          "sites": ["ms3", "resident"], "hidden": ["ms3", "resident"],
          "searchKeywords": "learning path home dashboard ..." }
    ] }
  ],
  "assets": [
    { "source": "_prototypes/sp-interview/sp-interview.pack.json",
      "dest": "tools/sp-interview.pack.json", "sites": ["ms3", "resident"] }
  ],
  "generated": [
    { "kind": "cotw", "registry": "08_Cases_and_Simulation/case-of-the-week/cotw_registry.json",
      "section": "Case of the Week" }
  ]
}
```

**Ordering rule:** `nav[]` order is section order (this deletes `_navorder`); `items[]` order is item order within a section. Nothing else may reorder them.

**`searchKeywords` lives on the manifest tool item, not on `tool_registry.json`.** This revises architecture-review rec 1.2, for a reason discovered during planning: `tool_registry.json` covers only 11 of the 23 shipped tools, and its schema requires `riskLevel`, `disclaimerType`, and `evidenceIds` on every entry — clinical-governance fields that would need faculty judgment for the other 12 tools. The manifest already covers every shipped tool. Keep `tool_registry.json` as the clinical-governance registry it is.

---

## File structure

### New files

- `13_Faculty_Resources/_automation/site_build/manifest.py` — typed loader, per-site filtering, nav generation, and legacy tuple accessors during migration.
- `13_Faculty_Resources/_automation/site_build/test_manifest.py` — unit tests for the loader, override resolution, site filtering, and nav generation.
- `13_Faculty_Resources/_automation/site_build/site_manifest.schema.json` — draft-07 contract for the manifest.
- `13_Faculty_Resources/_automation/site_build/build_site.py` — the single audience-parameterised entrypoint (Task 6).
- `tests/nav-generation.test.mjs` — static contract test: generated `nav.json` shape, ordering, and manifest↔nav bijection for both sites.

### Modified files

- `13_Faculty_Resources/_automation/site_build/site_manifest.json` — format migration, `sites[]`, nav tree, assets.
- `13_Faculty_Resources/_automation/site_build/build_deploy.py` — consume the loader; nav literal deleted; eventually replaced by `build_site.py`.
- `13_Faculty_Resources/_automation/site_build/resident_section.py` — deleted at Task 6.
- `13_Faculty_Resources/_automation/site_build/build_and_check.sh` — dispatch to `build_site.py --site`; map `res`→`resident`.
- `13_Faculty_Resources/_automation/site_build/common.py` — `TOOL_KEYWORDS` removed once keywords move to the manifest.
- `13_Faculty_Resources/_automation/validate_tool_governance.py` — `_tool_entries()` off the loader; `SITE_EXTRAS` and `EXPECTED_TOOL_COUNTS` derived from the manifest, not hardcoded.
- `13_Faculty_Resources/_automation/validate_attestation_consistency.py` — manifest access via the loader.
- `13_Faculty_Resources/_automation/validate_registry_schemas.py` — add the manifest schema pair.
- `13_Faculty_Resources/_automation/anki/pcl_anki/sources.py` — positional destructuring → loader (`:202-218`, fails closed on `len != 3`).
- `tools/pdf_library_export/export_website_pdf_library.py` — positional destructuring (`:151-158`).
- `faculty-console/netlify/functions/attest.mjs` — positional destructuring (`:546-560`). **Deployed; see Hazard 1.**
- `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` — `[...manifest.tools, ...manifest.md].map(([source]) => source)` (`:129, :168, :196`).
- `.github/workflows/ci.yml` — add the manifest unit-test step.
- `13_Faculty_Resources/reviewed.json` — entries for tools newly added to the manifest (Task 4).
- `CLAUDE.md` + `AGENTS.md` — "Where things live" and the "register a new page" instructions. **Run `cp CLAUDE.md AGENTS.md`; CI fails the PR if they diverge.**

---

### Task 1: Introduce the manifest loader seam with zero behavior change

Create the abstraction and route every consumer through it, while the on-disk format stays exactly as it is today. This is a pure refactor — the safest possible first step, and it means Task 2's format flip touches one file instead of ten.

- [ ] Write `site_build/manifest.py`: `load(lib_root)` returning a `Manifest` with `tools`, `tool_assets`, `md` as lists of typed records (`source`, `slug`, `title`), plus `legacy_tools()` / `legacy_md()` / `legacy_tool_assets()` returning the exact tuples callers use today.
- [ ] Write `site_manifest.schema.json` for the **current** positional format (`tools`/`md` = 3-string arrays, `toolAssets` = 2-string arrays). Register the pair in `validate_registry_schemas.py`.
- [ ] Write `test_manifest.py` covering: load, arity validation, duplicate-slug rejection, duplicate-source rejection, and legacy accessor shapes.
- [ ] Route every positional consumer through the loader: `build_deploy.py` (`:45-46, :57-58, :67-70, :218, :228, :237, :240`), `validate_tool_governance.py:330-336`, `validate_attestation_consistency.py:762-790`, `pcl_anki/sources.py:202-218`, `export_website_pdf_library.py:151-158`, `ci-build-contract.test.mjs:129,168,196`.
- [ ] Leave `attest.mjs` alone this task — it reads the raw file and the raw format has not changed.
- [ ] Add the CI step for `test_manifest.py` next to the `common.py` step in `.github/workflows/ci.yml`.

**Verification**

```bash
SB=13_Faculty_Resources/_automation/site_build
python3 $SB/test_manifest.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
rm -rf /tmp/t1_ms3 /tmp/t1_res
OUT_DIR=/tmp/t1_ms3 python3 $SB/build_deploy.py
MS3_DIR=/tmp/t1_ms3 OUT_DIR=/tmp/t1_res python3 $SB/resident_section.py
parity /tmp/base_ms3 /tmp/t1_ms3 && parity /tmp/base_res /tmp/t1_res
node --test tests/*.test.mjs
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
```

**Done when:** parity reports zero added, zero removed, and no changed files other than the time-based cache-bust in `tools/*.html`. All existing gates pass.

---

### Task 2: Flip the manifest to named objects

- [ ] Write a one-shot migration script that rewrites `site_manifest.json` deterministically: `tools`/`md` entries become `{"kind","source","slug","title"}`, `toolAssets` become `{"source","dest"}`. Keep the file pretty-printed with the existing 1-space indent. Run it, then delete the script (it is not a build input).
- [ ] Update `site_manifest.schema.json` and `manifest.py` to the object format. Legacy tuple accessors keep returning tuples so callers are untouched.
- [ ] Update `attest.mjs` (`:546-560`) to read the object format. **Redeploy the faculty console and confirm the live attestation list still populates before moving on.**
- [ ] Update `ci-build-contract.test.mjs` fixtures to the new shape.

**Verification**

```bash
python3 $SB/test_manifest.py && python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
rm -rf /tmp/t2_ms3 /tmp/t2_res
OUT_DIR=/tmp/t2_ms3 python3 $SB/build_deploy.py
MS3_DIR=/tmp/t2_ms3 OUT_DIR=/tmp/t2_res python3 $SB/resident_section.py
parity /tmp/base_ms3 /tmp/t2_ms3 && parity /tmp/base_res /tmp/t2_res
node --test tests/*.test.mjs && bash _prototypes/sp-interview/tests/run-all.sh
```

Plus a manual check of the deployed faculty console.

**Done when:** parity is clean, all gates pass, and the live faculty console lists pages and tools correctly.

---

### Task 3: Add `sites[]` membership and per-site source/title overrides

Still no nav generation and still two build scripts — this task only teaches the manifest to express membership.

- [ ] Add an optional `sites` array to every entry, defaulting to `["ms3","resident"]` when absent. Add an optional `overrides` object keyed by site, supporting `source` and `title`.
- [ ] Add `manifest.for_site(site)` returning entries filtered by membership with overrides resolved.
- [ ] Add the `sites{}` top-level config block with `buildDir` for each site. Add the `res`→`resident` mapping in `build_and_check.sh` and nowhere else.
- [ ] Tag the two known per-site source overrides: `welcome.md` (resident source `14_Tracks/Resident/resident_welcome.md`) and `cotw_index.md` (resident source `08_Cases_and_Simulation/case-of-the-week/index_resident.md`).
- [ ] Tag the 6 resident-only pages from `RES_EXTRA` with `sites:["resident"]`: `rotation.md`, `adv_psychopharm.md`, `systems_medlegal.md`, `supervision_teaching.md`, `canon_200.md`, `cl_reference.md`.
- [ ] Tag the 23 `_HIDDEN_INHERITED` pages with `sites:["ms3"]`. **Do not yet stop copying them** — `resident_section.py` still copytrees. This task only records intent.
- [ ] Extend `test_manifest.py`: membership filtering, override resolution, default-when-absent, and unknown-site rejection.

**Verification**

```bash
python3 $SB/test_manifest.py
python3 -c "
import sys; sys.path.insert(0,'$SB'); import manifest
m=manifest.load('.')
print('manifest md total', sum(1 for x in m.md))
for s in ('ms3','resident'):
    e=m.for_site(s); print(s,'md',sum(1 for x in e if x.kind=='md'),'tools',sum(1 for x in e if x.kind=='tool'))
"
# Arithmetic (verified against origin/main): the manifest starts at 67 md entries and
# grows to 73 when the 6 resident-only pages are added by this task.
#   manifest md total     73
#   ms3       md 67  (73 − 6 resident-only)          tools 20
#   resident  md 50  (73 − 23 ms3-only)              tools 20
# These are MANIFEST entries, not built files. The resident build also emits 5
# generated Case-of-the-Week pages, so `ls _build/res/content/*.md` will show 55.
rm -rf /tmp/t3_ms3 /tmp/t3_res
OUT_DIR=/tmp/t3_ms3 python3 $SB/build_deploy.py
MS3_DIR=/tmp/t3_ms3 OUT_DIR=/tmp/t3_res python3 $SB/resident_section.py
parity /tmp/base_ms3 /tmp/t3_ms3 && parity /tmp/base_res /tmp/t3_res
```

**Done when:** the counts above match, parity is still clean (nothing consumes `sites` yet), and all gates pass.

---

### Task 4: Bring the four unlisted tool bundles into the manifest

Three tool bundles ship today without a manifest entry, which is exactly why `validate_tool_governance.SITE_EXTRAS` and `EXPECTED_TOOL_COUNTS` are hardcoded.

- [ ] Add `learning-path.html` (`01_Six_Week_Curriculum/learning-path.html`, `sites:["ms3","resident"]`, `hidden:["ms3","resident"]`).
- [ ] Add `orientation-video.html` (`sites:["ms3"]`, `hidden:["ms3"]`) plus its 3 media siblings as `assets` with `sites:["ms3"]`.
- [ ] Add `rp-agitation.html`, `rp-brief-psych.html`, `rp-canon-quiz.html` (`sites:["resident"]`) plus their `.pack.json` siblings as `assets`. **Do not add a `polish:"raw"` flag** — PR #264 already routed these through the shared page pass; they are no longer raw copies.
- [ ] Add the 2 resident onboarding media files as `assets` with `sites:["resident"]`, and MS3's 17 `VIDEO_MEDIA` entries as `assets` with both sites. Keep both fail-soft (a missing media file is a warning, not a build failure).
- [ ] **`validate_attestation_consistency.py` requires a `reviewed.json` entry for every manifest slug** (`:767-769`) and a valid `[CLERKSHIP-META v1]` / `[RC-META]` marker on every manifest tool source (`:790-807`). Add `reviewed.json` entries for the newly-listed tools, preserving their current review state — **do not attest anything**. If a source lacks a meta marker, add the marker with its existing status; do not invent one.
- [ ] Delete `SITE_EXTRAS` from `validate_tool_governance.py`; derive tool lists from `manifest.for_site(site)`. Replace `EXPECTED_TOOL_COUNTS` with a manifest-derived count, keeping the hard assertion.

**Verification**

```bash
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py   # must be OK, not INVALID
python3 13_Faculty_Resources/_automation/validate_tool_governance.py           # ms3: 22, resident: 24
python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
rm -rf /tmp/t4_ms3 /tmp/t4_res
OUT_DIR=/tmp/t4_ms3 python3 $SB/build_deploy.py
MS3_DIR=/tmp/t4_ms3 OUT_DIR=/tmp/t4_res python3 $SB/resident_section.py
parity /tmp/base_ms3 /tmp/t4_ms3 && parity /tmp/base_res /tmp/t4_res
```

**Done when:** governance still reports exactly ms3 22 / resident 24 tools, now derived rather than hardcoded; parity clean.

---

### Task 5: Move nav into the manifest and generate `nav.json`

- [ ] Add the `nav[]` block: ordered sections, each owning its ordered `items[]`. Merge the two existing literals — for each slug, union the sites, and record per-site `title` overrides where MS3 and resident use different titles (e.g. `shelf-mode.html` is "Shelf Mode — Exam Simulation" on MS3 and "Board-Style Question Bank" on resident).
- [ ] Add `hidden` as a per-site list. Preserve today's exact hidden sets.
- [ ] Add the `generated[]` block for Case of the Week and teach the generator to expand one registry row into per-site items using the existing `cotw_<YYYYMMDD>_<topic>_<ms3|res>.md` slug function. **This is the pattern being generalized — keep the registry file where it lives, next to the content it indexes, so the weekly automation is unaffected.**
- [ ] Implement `manifest.build_nav(site)` returning the `nav.json` structure, emitting item keys in `t, f, k[, hidden]` order and section keys in `section[, pinned], items` order.
- [ ] Replace the nav literals in `build_deploy.py` and `resident_section.py` with `build_nav()`. Delete both `_navorder` copies and both nav literals.
- [ ] Write `tests/nav-generation.test.mjs`: nav is a bare array; every section has `items`; every item has `t`/`f`/`k`; `k ∈ {md,tool}`; and the manifest↔nav bijection holds per site (every shipped `content/*.md` and `tools/*.html` appears exactly once in nav, and vice versa).

**Verification** — semantic parity, per the wave-c precedent (`2026-07-15-wave-c-hardening.md:355-360`); byte parity is not required because key order may differ.

```bash
rm -rf /tmp/t5_ms3 /tmp/t5_res
OUT_DIR=/tmp/t5_ms3 python3 $SB/build_deploy.py
MS3_DIR=/tmp/t5_ms3 OUT_DIR=/tmp/t5_res python3 $SB/resident_section.py
for s in ms3 res; do
  python3 -c "import json;print(json.dumps(json.load(open('/tmp/t5_$s/nav.json')),sort_keys=True,indent=1))" > /tmp/t5_$s.nav.norm
  diff /tmp/base_$s.nav.norm /tmp/t5_$s.nav.norm && echo "$s nav: SEMANTICALLY IDENTICAL"
done
node --test tests/nav-generation.test.mjs
node $SB/check-static-site.mjs /tmp/t5_ms3 && node $SB/check-static-site.mjs /tmp/t5_res
python3 $SB/check_search_quality.py /tmp/t5_ms3 ms3 && python3 $SB/check_search_quality.py /tmp/t5_res resident
```

**Done when:** normalized `nav.json` is identical to baseline for **both** sites — including order — and `search-index.json` is unchanged (nav order and hidden flags drive doc ids, so an identical nav means an identical index).

---

### Task 6: Replace the copytree with `build_site.py --site`

The payoff task. Both scripts collapse into one that takes a site and filters.

- [ ] Write `build_site.py` accepting `--site {ms3,resident}` and `--out`. Sequence: preflight required sources → copy `for_site(site)` pages, tools, and assets → shared page pass (`common.apply_full_page_pass`) → per-site branding replacements → `dataOverrides` → `ctaAdditions` → `media_guard.strip_missing_media` → write `nav.json` → `common.build_search_index` → `common.assert_page_contract` → emit `tool-governance.json` → write the union source map.
- [ ] Move the `_headers` / `robots.txt` / `404.html` / `favicon.svg` emission into `build_site.py`. **Keep `_headers` a single statically-inspectable string literal** — `tests/faculty-console-handler.test.mjs:471-500` regex-extracts it from source to assert the learner CSP. Update that test's path from `build_deploy.py` to `build_site.py` in the same commit.
- [ ] Move `index.html` and `learning-path.html` rebranding into per-site `branding` replacements. **Order matters**: `MS3 Psychiatry Clerkship` must be replaced before `MS3 Clerkship`, or the shorter pattern eats the longer one. Add a test.
- [ ] Move the `reasoning_cases.json` swap into `dataOverrides`, and the two resident tool CTAs into `ctaAdditions`. `check-static-site.mjs:189` already scopes CTA validation to pages the build ships, so an MS3 build must simply not receive the resident CTAs.
- [ ] **Delete `_HIDDEN_INHERITED`.** Those 23 pages are `sites:["ms3"]` and are now never copied into the resident build, so there is no orphan to appease.
- [ ] Keep the source map union-of-all-sites (Hazard 2). Add a comment explaining that it answers "wired into the build at all", not "ships to this site".
- [ ] Update `build_and_check.sh` to call `build_site.py --site`, mapping `res`→`resident`. **Keep the `ms3|res` CLI tokens and the `_build/{ms3,res}` output paths** — Netlify's per-site build command and publish directory are configured in the Netlify UI and are not in this repo.
- [ ] Delete `resident_section.py` and `build_deploy.py`.

**Verification**

```bash
bash $SB/build_and_check.sh ms3 && bash $SB/build_and_check.sh res
for s in ms3 res; do
  python3 -c "import json;print(json.dumps(json.load(open('_build/$s/nav.json')),sort_keys=True,indent=1))" > /tmp/t6_$s.nav.norm
  diff /tmp/base_$s.nav.norm /tmp/t6_$s.nav.norm || echo "$s nav DIFFERS — expected only for res (23 pages dropped)"
done
parity /tmp/base_ms3 _build/ms3     # expect: clean
parity /tmp/base_res _build/res     # expect: 23 content/*.md REMOVED, nav.json + search-index.json changed
node --test tests/*.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
```

**Expected and acceptable diffs, resident only:**
- 23 `content/*.md` files removed (the `_HIDDEN_INHERITED` set) — they were shipped but hidden.
- `nav.json` loses those 23 hidden entries.
- `search-index.json` unchanged in *content* (hidden items were already excluded from the index) but `n` and doc ids may shift — **verify `check_search_quality.py` still passes on both sites**, which is the real gate.
- Learner-visible: resident progress denominators drop. Expected; note it in the PR body.

**Done when:** MS3 output is byte-identical to baseline, resident differs only by the enumerated set, and every gate passes.

---

### Task 7: Move search keywords into the manifest

- [ ] Add an optional `searchKeywords` string to manifest tool items. Populate from `common.TOOL_KEYWORDS` (already merged and de-drifted by PR #264).
- [ ] Add a `searchKeywords` entry for `sp-interview.html`, which has none today and therefore indexes with an empty body.
- [ ] Change `common.build_search_index()` to take keywords from the manifest; delete `TOOL_KEYWORDS`, `_TOOLKW_MS3`, and `_TOOLKW_RES` from `common.py`. Update `test_common.py` accordingly.

**Verification**

```bash
python3 $SB/test_common.py && python3 $SB/test_manifest.py
bash $SB/build_and_check.sh ms3 && bash $SB/build_and_check.sh res
python3 $SB/check_search_quality.py _build/ms3 ms3
python3 $SB/check_search_quality.py _build/res resident
# every prior keyword must survive the move
python3 -c "
import json,sys; sys.path.insert(0,'$SB')
idx=json.load(open('_build/ms3/search-index.json'))
print('tokens', len(idx['postings']), 'docs', idx['n'])
"
```

**Done when:** search quality passes on both sites and no keyword token present before the move is absent after (except the intended `sp-interview.html` addition).

---

### Task 8: Documentation, release gates, and completion audit

- [ ] Update `CLAUDE.md` "Where things live" and the build/registration instructions: registering a new page is now **one manifest entry**, not a manifest entry plus a nav literal edit in one or two Python files. Run `cp CLAUDE.md AGENTS.md`.
- [ ] Write `docs/CONTENT_CONTRIBUTION.md` — the end-to-end "add a page" path, including how to ship to one site vs both (architecture-review rec 4.4).
- [ ] Mark `2026-07-15-wave-c-hardening.md` §WP-12 superseded by this plan.
- [ ] Update `docs/ARCHITECTURE_REVIEW_2026-07-26.md`: mark Phase 2 (2.1–2.5) and rec 1.2 done; update the metrics table (hand-maintained nav items 184 → 0; locations edited to ship one dual-site page 4 → 1).
- [ ] **Regenerate visual-regression baselines.** `tests/smoke/visual-regression.spec.js` screenshots `#nav`. Hidden items are `display:none` so removing them is visually neutral, but confirm — and if the sidebar changed, regenerate via the **"Refresh visual baselines" `workflow_dispatch`**, never locally. Baselines must be produced on Ubuntu/Chromium.
- [ ] Full local gate, then open the PR:

```bash
python3 -m pip install -r requirements.txt
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_reconnect_snapshot_provenance.py
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
node --test tests/*.test.mjs
node tests/contrast-check.mjs
bash _prototypes/sp-interview/tests/run-all.sh
bash $SB/build_and_check.sh ms3
bash $SB/build_and_check.sh res
cmp -s CLAUDE.md AGENTS.md && echo "agent docs parity OK"
```

- [ ] PR body must state: the resident progress-percentage change, the faculty-console redeploy, and the enumerated resident output diff.
- [ ] Confirm on the PR: `build-test-validate` green, `Smoke tests` green, **both** Netlify deploy previews green. Do not auto-merge — Josh reviews and merges.

**Done when:** all gates green on the PR and both deploy previews build.

---

## Completion audit

The plan is done when all of the following are true:

| Assertion | How to check |
|---|---|
| One build entrypoint | `build_deploy.py` and `resident_section.py` are deleted; `build_site.py` exists |
| Zero hand-maintained nav items | No nav list literal in any `.py`; `grep -rn '_navorder' 13_Faculty_Resources/` is empty |
| Adding a page is one edit | `docs/CONTENT_CONTRIBUTION.md` documents a single manifest entry |
| Audience is a field | `grep -c '"sites"' site_manifest.json` > 0; no `copytree` from one build dir to another |
| `_HIDDEN_INHERITED` gone | `grep -rn '_HIDDEN_INHERITED'` is empty |
| Governance counts derived | `EXPECTED_TOOL_COUNTS` and `SITE_EXTRAS` no longer literal in `validate_tool_governance.py` |
| A third site is a config edit | Adding a `sites{}` entry plus `sites:[...]` tags produces a build with no new Python |

## Explicitly out of scope

Do not attempt in this plan: making `safetyLevel` required (rec 3.1), the attestation freshness gate (rec 3.2), unifying the attestation ledgers (rec 3.3 — already designed in `2026-07-26-risk-aware-publishing-warnings-design.md`), turning on `STRICT=1` (rec 3.4), relocating raw source material out of `NN_Category/` (rec 4.1), or archiving root docs (rec 4.3). Those are Phase 3/4 and touch disjoint files.
