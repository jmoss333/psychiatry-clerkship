# Panel snapshots for both audiences — design

**Date:** 2026-09-05
**Status:** proposed
**Closes:** the two open Codex P2 threads on PR #539
**Supersedes the scope caveats in:** `tests/_panel_render.mjs`, `bin/render_panels.mjs`

## Problem

PR #539 landed a snapshot gate for the "On the Unit Practice and Tools" panel that renders
from the **source** registries (`topic_meta.json`, `site_manifest.json`, `curriculum.json`,
`tool_registry.json`). That render matches neither shipped site, and #539 says so in a printed
scope line rather than fixing it — narrow-and-honest, on the author's call, because both routes
to a fix were blocked at the time.

Three defects follow, two named by Codex and one found while measuring them.

### D-1 · Resident overlays are invisible (Codex P2, `3941015128`)

`resident_section.py` patches OUT's `topic_meta.json` with resident CTAs (`:301`) and rebuilds
the front-door index from resident navigation (`:358`). The two builds therefore inject
different `FD_TOPIC_META` and `FD_SITE_MANIFEST` payloads. Measured on the built output:

| payload | ms3 | res |
|---|---|---|
| `FD_TOPIC_META` | 252 842 B | 253 243 B |
| `FD_SITE_MANIFEST` | 10 511 B | 11 812 B |
| `FD_CURRICULUM` | 10 400 B | 8 759 B |

Concretely, `shelf-mode.html` renders as `Shelf Mode — Exam Simulation` on MS3 and
`Board-Style Question Bank` on resident. A resident-only panel change reports zero drift.

### D-2 · Case-of-the-Week panels are unsnapshotted (Codex P2, `3941015131`)

`cotw_registry.json` has 11 `weeks`; both builds derive per-case `topic_meta` at build time via
`cotw_meta.py` (`build_deploy.py:308`, `resident_section.py:318`). All 11 satisfy
`hasPracticeTpl` in each build, so 22 shipped panels render and none is snapshotted.

### D-3 · Six snapshots are filed under the wrong audience (found here)

`shipped_pages.json` scopes each page: 69 ship to both sites, 11 to ms3 only, 17 to res only —
6 of those 17 from the `resident_extra` producer. Those six (`rotation.md`, `adv_psychopharm.md`,
`cl_reference.md`, `systems_medlegal.md`, `supervision_teaching.md`, `canon_200.md`) have entries
in the **shared** `topic_meta.json`, so the MS3 build renders panels for them — but the MS3 site
never publishes those pages. Six of #539's 74 "MS3" snapshots describe resident-only content.

D-3 is the same overstatement class as D-1 and D-2, one level down, and the fix for it falls out
of the fix for the others.

## Why #539 could not do this

- **Read each build's own `topic_meta.json`.** Architecturally right, but `ci.yml` runs
  `node --test tests/*.test.mjs` on a fresh clone *before* the build, so a build-dependent gate
  would skip in CI and never enforce. A variant that fails on a stale `_build/` recreates the
  T17 trap: `build_and_check.sh` is `set -euo pipefail` and runs the node suite before
  `build_deploy.py`, so the red test aborts the build that would repair it.
- **Re-derive COTW in JS.** Forbidden by `tests/shipped-pages-readers.test.mjs`, whose
  direct-reader allowlist "may only shrink" — and it is the second-renderer failure the harness
  exists to prevent.

Both objections are about *where the gate runs*, not about what it should read. Moving it fixes
both.

## Design

### D1 · Render from the built artifact, end to end

`_build/<site>/index.html` is a complete render environment. All four renderer inputs are
injected as single-line JS literals on consecutive lines (1963–1966 in the ms3 build),
`fdBuildIndex` is inlined, and the panel code is present with its `PRACTICE_CASE_TITLES` needle
already replaced by `build_deploy.py`.

So the harness evaluates **the shipped renderer against the shipped data**. Nothing is
re-implemented and no producer is read a second time, which is precisely what
`shipped-pages-readers.test.mjs` protects. It also retires #539's `CASE_NEEDLE` replacement: the
build has already done that substitution.

All six slice markers were verified unique in both builds:
`var FD_CURRICULUM=`, `var FD_AUDIENCE=`, the two practice-panel markers, `var WF_STAGE_LABELS=`,
`function toolExtraFromParams`.

### D2 · One eval mechanism, two input bindings

`tests/_panel_render.mjs` gains a second entry point rather than a second renderer:

- `renderFromSource()` — today's path (source registries + `spa_index.html`). Kept because
  `tests/practice-panel.test.mjs` has ~28 property tests that must stay build-independent so
  they run on a fresh clone in CI.
- `renderFromBuild(site)` — payload block and panel code sliced out of
  `_build/<site>/index.html`.

The slicing helper and the `new Function` construction are shared. Only the inputs differ.

### D3 · The gate moves into `build_and_check.sh`

One line per branch, after `shipped_pages.py --check-build` (so the coverage assertion runs
against a build whose page set has already been verified):

```
echo "── Panel snapshots: $MS3_OUT"
node "$LIB/bin/render_panels.mjs" --check --site ms3
```

**This adds no CI step.** `ci.yml:220-224` and `bin/verify.sh:180-181` already invoke
`build_and_check.sh ms3` and `build_and_check.sh res`. None of the three contracts CLAUDE.md
warns about is touched:

| contract | status |
|---|---|
| `bin/check-verify-coverage.py` | untouched — matches by ci.yml step name; no step added, and "Build + static QA gate" is already `ALLOWED` as mirrored |
| `maintenance/validate_scheduled_workflows.py` | untouched — no workflow file edited, so no digest recompute |
| `test_validate_registry_schemas.py` `PAIRS` | untouched — no root registry added |

**The T17 trap does not reappear.** The gate runs *after* `build_deploy.py`, so when it fails
`_build/` is already current and `node bin/render_panels.mjs --write` repairs the snapshots with
no rebuild. `build_and_check.sh res` builds both trees, so one run regenerates both audiences.

### D4 · Snapshots are filtered to what that site publishes

`renderFromBuild(site)` renders every panel the build's payload can produce; the snapshot set is
then intersected with the pages `shipped_pages.json` scopes to that site. This is what fixes D-3,
and it makes the coverage claim exact rather than approximate.

Layout: `tests/__panels__/ms3/` (79 files) and `tests/__panels__/res/` (85 files).

Shared-but-identical panels are stored twice — 68 refs are stored under both audiences and only
4 render differently (`agitation.md`, `brief_psychotherapy.md`, `shelf.md`, `anki.md`). That 68 is
the shared-SNAPSHOT count, not the 69 pages that ship to both sites (D-2 above): `rapid_review.md`
is the 69th and renders no panel, so it has no snapshot to share. Deduplicating
would save 64 files and reintroduce the ambiguity that caused all three defects: a reader could
not tell which audience a file describes. Storage is cheap; the ambiguity is what was expensive.

### D5 · Ask the derived universe, with `sites` intact

`deriveContentUniverse()` collapses `sites` to one value (`'res'` for res-only, `'ms3'` for
everything else), which is lossy here — a page shipping to both must count as shipped on res.
The module's private `shippedPages()` already returns the full array with schema validation.

Export a site-aware reader from `faculty-console/content-universe.mjs` and use it. This keeps
"ask the derived universe, never the producers" literal, reuses the existing validation, and
adds no entry to the frozen `ALLOWED_DIRECT_READERS` list (which governs *producers*, not
`shipped_pages.json`).

### D6 · The node suite keeps the contracts that need no build

`tests/panel-snapshots.test.mjs` stops rendering and starts reading the committed corpus. Every
assertion below touches only tracked files, so all of them run on a fresh clone in CI:

- **format round-trip** — `formatPanel(unformatPanel(text)) === text` for every stored snapshot,
  proving the stored form can hide no render change.
- **vacuity guard** — every snapshot contains a real panel (`<details class="topic-tpl
  practice-panel">`, the panel title, a plausible length), so no check passes by comparing empty
  to empty.
- **orphan check** — every stored snapshot's ref ships on that audience's site.
- **coverage boundary** — for each site, `shipped(site) − snapshotted(site)` is exactly
  `{rapid_review.md}`, and that page has no `topic_meta` entry so no panel exists to store.

This is strictly stronger than #539's version, which pinned `{cotw_registry: 22,
site_manifest: 1}` — counts that move for several unrelated reasons and can be "fixed" by bumping
a number. Set equality names the page.

## Coverage after the change

| | shipped pages | snapshotted | uncovered |
|---|---|---|---|
| ms3 | 80 | 79 | `rapid_review.md` |
| res | 86 | 85 | `rapid_review.md` |
| distinct | 97 | **96** | `rapid_review.md` |

`rapid_review.md` has no `topic_meta` entry, so it renders no panel. It is the only page the gate
does not cover, and the coverage test names it explicitly rather than counting around it.

`bin/render_panels.mjs` prints coverage per audience with no "NOT covered" caveat.

## Risks and decisions

**R1 · A snapshot drift now fails a production Netlify deploy.** Accepted, and consistent with
house style: `shipped_pages.py --check-build` already hard-fails the deploy for exactly this
class of drift, and CLAUDE.md calls that "the structural guarantee behind ADR-002". Mitigations:
the failure names the drifted pages and the regeneration command, and because `_build/` is
already written when the gate fires, `--write` repairs without rebuilding.

**R2 · Existing ms3 snapshot bytes will change.** Expected. They move from a source-registry
render to the build's actual payload. The diff is part of the PR and is reviewable page by page —
that is the deliverable, not a side effect.

**R3 · The panel code could reference a global the harness does not supply.** Same exposure
as the #539 harness (both bind `esc`, `ctaHref`, `ctaAttrs`, `FD_INDEX`,
`FD_TOOL_REGISTRY`, `window: {}`), not a regression. All 164 panels were verified to
render during design.

**R4 · Slice markers could drift with an unrelated `spa_index.html` edit.** The slice asserts each
marker is present exactly once and throws otherwise, so a rename fails loudly rather than
rendering a degraded panel. `practice-panel.test.mjs` already pins the marker pair.

## Files touched

| file | change |
|---|---|
| `tests/_panel_render.mjs` | add `renderFromBuild(site)`; keep `renderFromSource()`; rewrite the scope header |
| `bin/render_panels.mjs` | take `--site`; render from the build; rewrite the scope header; per-audience coverage output |
| `13_Faculty_Resources/_automation/site_build/build_and_check.sh` | one gate line per branch |
| `tests/panel-snapshots.test.mjs` | assertions become committed-corpus contracts; coverage boundary becomes set equality |
| `faculty-console/content-universe.mjs` | export a site-aware shipped-pages reader |
| `tests/__panels__/ms3/` | regenerated, 74 → 79 files |
| `tests/__panels__/res/` | new, 85 files |

## Verification

1. `node bin/render_panels.mjs` reports 79 (ms3) + 85 (res) with no caveat line.
2. Perturb a resident-only overlay in `resident_section.py` → non-zero drift on res, zero on ms3.
3. Perturb `cotw_registry.json` → non-zero drift on both.
4. `node --test tests/*.test.mjs` green on a tree with no `_build/`.
5. `bash bin/verify.sh` green (runs both builds, so both gates fire).
6. `python3 bin/check-verify-coverage.py` green, confirming no new CI step needs mirroring.
