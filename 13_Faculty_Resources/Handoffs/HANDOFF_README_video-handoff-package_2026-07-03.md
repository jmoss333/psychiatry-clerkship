# Clerkship Hub — design handoff package

**Prepared:** 2026-07-01 · for Joshua Moss, MD
**Target app:** `clerkship-hub-deploy/` (vanilla SPA — `index.html` shell, markdown content, iframe tools)
**Nature:** additive access + orientation layer. No teaching content or existing tool is modified.

> ⚠️ **Updated 2026-07-03:** `clerkship-hub-deploy/` and `mmc-resident-deploy/` are **generated output**, built by `13_Faculty_Resources/_automation/site_build/build_deploy.py` (+ `resident_section.py`) from the `jmoss333/psychiatry-clerkship` library repo — confirmed by reading the scripts directly. Hand-editing a deploy folder is silently overwritten on the next rebuild (`build_deploy.py` starts with `shutil.rmtree(OUT)`). The **tool-launcher** and **UX-concepts** handoffs below predate this discovery and describe edits against `clerkship-hub-deploy/` directly — re-target the same changes at library source + the build scripts before applying them. The **orientation-video** handoff already does this correctly.

---

## What's in this package

| File | What it is | Build with |
|---|---|---|
| `Tool Launcher Badges.html` | Working, portable vanilla component: inline **tool chip** + floating **dock (FAB)**, 14 original icons, light/dark, copy-paste snippets. Self-contained. | `HANDOFF_tool-launcher.md` |
| `HANDOFF_tool-launcher.md` | Dev handoff for the badges — routing (verified against the shell), placement map, acceptance checklist. | — |
| `Clerkship UX Concepts.dc.html` | Visual mockups of three screens: **Start here**, **Progress home**, **Bedside mobile bar**. Sample data. | `HANDOFF_ux-concepts.md` |
| `HANDOFF_ux-concepts.md` | Dev handoff for the three concepts — maps each to existing storage/JSON, phasing, acceptance checklist. | — |
| 4 video pieces (intro trailer, day-in-the-life, week stingers ×6, tool spotlights ×6) + their `.jsx` scene files | Orientation/explainer motion graphics, built on a timeline engine. Export to `.mp4` before shipping — see the handoff for why. | `HANDOFF_video-library.md` |
| `HANDOFF_video-library.md` | Dev handoff for the video library — export step, placement map, embed pattern, acceptance checklist. | — |
| `HANDOFF_orientation-video-ms3.md` | Move the existing NotebookLM orientation video from the Resident build to MS3 (its actual audience), fix a real asset-copy bug in the process, attest it. Exact patch for `build_deploy.py` + `resident_section.py`. | — |

**Suggested build order:** launcher badges → Progress home → Start here → Bedside bar → video library (independent of the other three; can land anytime). The badges and the bedside bar should share **one** tool registry + `launchTool()` routing module.

---

## Origin — where these came from (MS3 walk-through findings)

This package answers a review done from a 3rd-year student's perspective. The findings, and where each is handled:

1. **No orientation on first run; Path vs Library is unexplained** → **Start here** landing (Concept A).
2. **`marked` loads from a CDN — the hub can blank on ward wifi** → flagged in `HANDOFF_ux-concepts.md` §4: **bundle `marked` locally**. Blocks all three on the unit. *(Not yet built — Cowork action.)*
3. **Tools are slow to reach on the ward** → **launcher badges** (desktop inline chip + dock) and the **bedside mobile bar** (Concept C).
4. **Can't tell which page is faculty-reviewed vs draft** → extend the existing `reviewed.json` attestation (already on tools) to a per-topic trust badge. *(Recommended, not yet designed — Cowork/next round.)*
5. **Progress is scattered; no "where am I / what's next"** → **Progress home** (Concept B), computed from existing `cw_progress_v1` + `cw_srs_v1` + `topic_meta.json`.
6. **"Test yourself" doesn't feed the spaced-rep queue** → wire quiz results into `cw_srs_v1` (noted in the UX handoff). *(Behavior change — Cowork.)*
7. **Search misses abbreviations (SS, NMS, EPS, AMA) and has no "resume where I was"** → add synonym/abbrev handling + `cw_last` resume. *(Open — next round.)*
8. **Mobile long tables are painful; no one-tap pocket-card/print view** → surface the existing `pg_*` pocket cards from each topic + a condensed print view. *(Open — next round.)*

**Delivered here:** 1, 3, 5 (designs) + the routing/data wiring plans. **Called out for Cowork:** 2, 6. **Recommended next round:** 4, 7, 8.

---

## House style (both deliverables use it)

Clinical-Warm tokens, defined in the shell and mirrored here. Light + a `[data-theme="dark"]` remap that now matches the shell's real dark palette (`--accent:#5aad9a`, `--primary:#d4896e`, `--surface:#2a2520`, …). No hard-coded `#fff`/`#000`; focus halos use `var(--surface)`; motion wrapped in `prefers-reduced-motion`. Fonts: Source Serif 4 (headings) / Source Sans 3 (body).

---

## Notes

- The `.dc.html` concept file is a **visual reference** — open it and switch tabs. Real values come from the storage/JSON mappings in the UX handoff, not the sample data shown.
- Nothing here clears or migrates existing `localStorage`. New keys (`cw_seen_start`, `cw_track`, `cw_start_week`, `cw_shelf_date`, `cw_last`) are optional with fallbacks.
