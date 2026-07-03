# Hub sidebar reorganization (MS3 + resident) — design

**Date:** 2026-07-03
**Author:** Joshua Moss, MD (with Claude)
**Scope:** the sidebar on **both** sites — the MMC resident hub
(`mmc-psychiatry-residents-sanford`) and the MS3 student site (`une-ms3-psychiatry`). The structural
regrouping applies to both; the tool-consolidation and Canon-pairing changes are resident-only
because MS3 has neither the `rp-*` tools nor the Canon.
**Status:** approved design, pending implementation plan.

## Problem

Both sites use the same shared shell (`spa_index.html`) and render a single-tier accordion of
equally-weighted sections: **~11 on the resident hub, 12 on MS3** (MS3's Core Topics alone holds 19
items). Three concrete problems (items 2 and 3 are resident-specific; item 1 affects both):

1. **Wall of headers.** Eleven top-level sections compete for attention with no sense of scale; a
   resident can't tell the two-minute-under-pressure sections from the deep-reading ones before
   opening them.
2. **Tools are scattered and under-discoverable.** Interactive tools live across five sections. The
   "Interactive tools" section holds 15, but the three newest and most-worked tools —
   `rp-agitation`, `rp-brief-psych`, `rp-canon-quiz` — are *not* in it; they sit only next to their
   topic content. A resident who opens "Interactive tools" to find something to drill with never
   sees them.
3. **Silent duplication.** `canon_200.md` is listed in both "Resident depth" and "Evidence &
   reading" as two identical entries; the same is true of `adv_psychopharm.md` (Resident depth +
   Psychopharmacology). Nothing signals they are the same page.

## Decisions (locked with the user)

1. **Two-tier accordion.** Collapse the ~11 sections into a small set of super-categories, with the
   existing sections nested one level deeper. Target: 7 top-level entries.
2. **Consolidate all *learner* tools under one "Practice" section**, each listed once.
   `review-attest` stays under Faculty — it is a faculty attestation workflow, not a learner tool.
3. **Preserve topic context via inline CTAs, not nav duplication.** Each topic-specific tool is
   linked from its topic *page* using the existing `topic_meta.json` `cta` mechanism
   (`agitation.md` → Agitation Ladder; the unit-therapy page → Five Good Minutes), so the tool is
   listed once in the sidebar but still reachable in context.
4. **Pair the Canon.** `canon_200.md` (the 200-paper reading list) and `rp-canon-quiz` (the quiz
   over it) sit adjacent as a read→test unit under a renamed "Evidence & the Canon" section. The
   duplicate `canon_200.md` entry in "Resident depth" is removed.
5. **Pin Acute & Safety at the top level, default-open** — it is time-sensitive, not just another
   topic.

## Target structure — resident

```
Overview                         standalone, always open   (Home · Start here)

▾ Get oriented                   GROUP
    Start here                   Welcome · 4-Week Plan · Core Readings
    Resident depth               Adv Psychopharm · Systems & Med-Legal · Supervision/EPAs

▾ Learn the topics               GROUP
    Core Topics                  (11 topic pages)
    Psychopharmacology           Primer · Advanced · Protocols
    Skills & reference           (11 pocket guides)

  Practice                       standalone   (all 18 learner tools, one shelf)

  Acute & Safety                 standalone, PINNED open
                                 Catatonia · Delirium · Agitation & Restraint · C-L Reference

  Evidence & the Canon           standalone
                                 Evidence-Based Inpatient · Landmark Trials — Listen & Test
                                 ── The Canon ── : The Psychiatry Canon (200) [read] · Canon Quiz [test]

▾ Reference                      GROUP
    Books & Podcasts
    Faculty                      Review & Attest
```

Seven top-level entries (down from eleven). The two under-pressure destinations — **Practice** and
**Acute & Safety** — stay one click from the top; deep reading is tucked two levels under "Learn the
topics."

## Target structure — MS3

MS3's sections differ (it has Six-Week Curriculum, Ethics/Law/Culture, Pocket guides, and
Skills/cases/exam; it has no Resident depth and no Canon), so it gets its own group mapping. Tools on
MS3 are already consolidated in one "Interactive tools" section, so no tool moves are needed — only
the grouping is applied.

```
Overview                         standalone, always open   (Home · Start here)

▾ Get oriented                   GROUP
    Start here
    Six-Week Curriculum

▾ Learn the topics               GROUP
    Core Topics                  (19 items)
    Psychopharmacology
    Ethics, Law & Culture

  Practice                       standalone   (Interactive tools, 15)

  Acute & Safety                 standalone, PINNED open

▾ Skills & exam                  GROUP
    Pocket guides
    Skills, cases & exam

▾ Evidence & reference           GROUP
    Evidence & reading
    Books & Podcasts
    Faculty
```

Seven top-level entries, matching the resident shape, so the two sites stay visually consistent.

## Architecture

### Data model — flat sections with an optional `group` tag

`nav.json` stays a **flat ordered array of sections**. Each section gains two optional keys:

- `group` (string) — the super-category label a section nests under. Sections sharing a `group`
  value, appearing consecutively, render inside one outer accordion. A section with no `group`
  renders at the top level, exactly as today.
- `pinned` (bool) — a top-level section that defaults to open (Acute & Safety).

Rationale for not nesting the JSON: `spa_index.html` is shared by both sites, and the search-index
builder in both `build_deploy.py` and `resident_section.py` iterates `for sec in nav: for it in
sec["items"]`. A flat array with a `group` tag keeps that loop working unchanged on both sites — the
tokenizer never needs to know about groups. It is also **forward/backward-compatible**: a section
with no `group` renders top-level exactly as today, which is how the standalone entries (Overview,
Practice, and Acute & Safety on both sites; Evidence & the Canon on resident) render, and how any
not-yet-tagged section would degrade gracefully. Both sites' nav generators emit `group` tags; the
renderer treats untagged sections as top-level.

Example section objects:
```json
{ "section": "Start here",    "group": "Get oriented",   "items": [ ... ] }
{ "section": "Core Topics",   "group": "Learn the topics","items": [ ... ] }
{ "section": "Practice",      "items": [ ... ] }
{ "section": "Acute & Safety","pinned": true, "items": [ ... ] }
```

### Renderer — two-tier accordion (`spa_index.html`)

The `fetch('nav.json')` render loop is extended to:

1. Walk sections in order, bucketing consecutive same-`group` sections into an outer group
   accordion (`.navgroup-wrap` → group header → inner `.navsec-wrap` sections). Ungrouped sections
   render as standalone top-level `.navsec-wrap` (current behavior).
2. Persist group open/closed state under a new `cw_navgroup_v1` localStorage key, mirroring the
   existing per-section `cw_nav_v1`. Default-open groups: "Get oriented" and the "Overview"
   standalone; `pinned` sections default open; all others default closed.
3. Update the search-result open-path: `show()` currently walks `btn.closest('.navsec-wrap')` to
   open the section containing a matched item. It must also walk out to the enclosing
   `.navgroup-wrap` and open it, so a search hit inside a collapsed group reveals itself.
4. Mobile drawer, theme toggle, path/library mode, and the `postMessage` open-by-file bridge are
   unchanged.

### Content changes

- **`resident_section.py`** (resident nav) — rebuild the `nav` array with `group`/`pinned` tags per
  the resident target structure; add the 3 rp-* tools into the Practice/tools section (`TOOLS` list
  or an appended block); remove the duplicate `canon_200.md` from "Resident depth"; rename "Evidence
  & reading" → "Evidence & the Canon" and order it Evidence → Landmark → Canon(200) → Canon Quiz.
  The section currently named "Interactive tools" becomes "Practice" (label change only).
- **`build_deploy.py`** (MS3 nav) — add `group`/`pinned` tags to the MS3 `nav` array per the MS3
  target structure, and rename "Interactive tools" → "Practice" (label only). No tool moves, no
  Canon, no dedup — MS3's tools are already consolidated.
- **`topic_meta.json`** (resident context CTAs) — add `cta: { href, label }` entries keyed by
  content filename so
  `agitation.md` links to `tools/rp-agitation.html` and `brief_psychotherapy.md` links to
  `tools/rp-brief-psych.html`. Uses the existing `buildTpl` `m.cta` rendering path — no new template
  code. (If a key has no existing `topic_meta` entry, a `cta`-only object is valid — `buildTpl`
  renders partial meta.)

## Edge cases

- **Untagged sections degrade gracefully.** Any section without a `group` renders top-level, so a
  partial or mistaken tagging can't break the rail — worst case a section shows top-level instead of
  nested. Verified by building both sites.
- **Persisted state migration.** Existing users have `cw_nav_v1` (per-section open state). The new
  `cw_navgroup_v1` is additive; absence means "use defaults." No migration needed.
- **Search open-path across two tiers.** A matched item in a collapsed group must open both the
  group and the section — covered in renderer change #3.
- **Deep-linking (`?page=` / `?tool=`).** The open-by-file path (`openByFile`) must also expand the
  containing group so a shared link lands with the item visible.
- **Single-child groups avoided.** Practice, Acute & Safety, and Evidence & the Canon are standalone
  top-level sections, not one-child groups, so no redundant "group header → lone section header"
  nesting.

## Testing / verification

1. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` — MS3 builds, QA gate
   passes.
2. `bash .../build_and_check.sh res` — resident builds, QA gate passes.
3. Static assertions on **both** `_build/ms3/nav.json` and `_build/res/nav.json`: each collapses to
   the intended super-categories (7 top-level entries); every section carries a valid `group` or is
   an intended standalone; grouped sections are contiguous per group.
4. Resident-specific static assertions on `_build/res/nav.json`: all 18 learner tools present in
   Practice exactly once; `review-attest` only under Faculty; no duplicate `canon_200.md`;
   Canon(200) immediately precedes Canon Quiz.
5. Browser (served, both sites): groups expand/collapse and persist; Acute & Safety open by default;
   a search hit inside a collapsed group reveals itself (group + section open). Resident only:
   `agitation.md` shows an "Open the Agitation Ladder trainer →" CTA that opens the tool; deep-link
   `?tool=rp-agitation.html` opens with Practice expanded.

## Out of scope

- Sub-grouping the 18-tool Practice list (Scales / Trainers / Board-prep). Ship flat first; revisit
  only if the list feels long.
- Moving/consolidating tools on MS3 (its tools are already in one section) and any Canon work on MS3
  (it has no Canon).
- The two already-fixed, separately-verified bugs in this branch (content-pack copy in
  `resident_section.py`; the video media-guard + QA gate). They are unrelated to the sidebar and are
  noted here only because they are uncommitted in the same working tree.

## Rollout

Both sites auto-deploy from the branch via Netlify build-on-push (`build_and_check.sh ms3` and
`build_and_check.sh res`). The QA gate is a hard publish gate, so a structural regression (missing
nav target, broken tool) blocks the deploy rather than shipping.

Both sites ship together in one pass. The MS3 site is not yet in active student use, so there is no
higher-stakes staggering concern — no need to gate its go-live separately from the resident hub.
