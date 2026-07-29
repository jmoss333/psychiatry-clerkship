# Ward mode sidebar panel — collapse to a button — design

**Date:** 2026-07-23
**Author:** Joshua Moss, MD (with Claude)
**Scope:** `13_Faculty_Resources/_automation/site_build/spa_index.html` (the shared SPA shell that
builds both the MS3 and resident sites), plus the two Playwright specs that depend on the panel's
current always-expanded markup.
**Status:** approved design, pending implementation plan.

## Problem

`<aside id="side">` renders, top to bottom: title/byline, theme toggle, Path/Library toggle, search
box, the mode-companion panel (`renderModeCompanion()` → `<section id="modeCompanion">`), then the
full nav tree (`<nav id="nav">`). The mode-companion panel is always fully expanded and, in its
default "Ward" mode, contains a title row, five mode-switch pills (Ward/Shelf/Family/Safety/5 min),
a "Pages" section (up to 3 items), and a "Tools" section (up to 3 items) — confirmed in-browser at
~280px of permanent vertical space above the nav tree on every page, on every site load, regardless
of which mode a learner is in.

This is dense enough that it pushes the entire nav tree below the fold on a standard laptop viewport.
It's also partially redundant with `renderWardDashboard()` on the home page ("Today on the unit"),
which shows richer before/after/leaving recommendations for the same `dashboardMode()`; the sidebar
copy exists so recommendations stay reachable from any page, not just home, but pays for that with
permanent nav real estate.

Mobile is unaffected — `#side` (companion included) is already hidden behind the hamburger drawer
below the ~820px breakpoint, so this is purely a desktop/tablet problem.

## Decisions (locked with the user)

1. **Inline accordion, collapsed by default.** Not a popover/flyout (would introduce a UI pattern —
   positioning, z-index, outside-click handling — that nothing else in this codebase uses), and not
   a partial-collapse that keeps the mode pills always visible (rejected in favor of the simplest,
   most literal reading of "just a clickable button rather than the whole thing shown").
2. **No persistence.** The open/closed state is a plain in-memory variable, not localStorage. Every
   fresh page load starts collapsed. `renderModeCompanion()` currently only re-runs at boot and on a
   mode-pill click — never on ordinary content navigation — so the open state naturally survives
   while browsing within a session without any extra reset-on-navigate logic.
3. **The collapsed button's label reflects the current mode**, e.g. `WARD MODE ▸` /
   `SHELF MODE ▸`, so the mode is visible at a glance without expanding.
4. **Reuse the codebase's existing disclosure convention** — a real `<button>` +
   `aria-expanded`/`aria-controls` + rotating chevron, matching `makeCollapsible()` /
   `.sec-c`/`.sec-h`/`.sec-b` already used for long content pages — rather than the native
   `<details>/<summary>` element. `<details>` would get free keyboard/ARIA behavior, but it would be
   a second, visually/behaviorally different disclosure widget alongside the one this file already
   has, which is a worse outcome for consistency than the small amount of hand-rolled JS this needs.
5. **Drop the duplicate title.** Expanded content currently starts with its own
   `{mode} mode` header (`.mc-head` / `.mc-title`); that text becomes redundant once the toggle button
   shows it. Remove the `.mc-title` text; keep the "Progress" shortcut button in `.mc-head` exactly
   where it is today (no behavior change to it).

## Architecture

### Renderer (`spa_index.html`)

- Add a module-level `var mcOpen=false;` alongside the other dashboard-state helpers
  (`dashboardMode`/`setDashboardMode`).
- `renderModeCompanion()` changes its output to:
  ```
  <button type="button" class="mc-toggle" aria-expanded="{mcOpen}" aria-controls="mcBody">
    <span class="mc-toggle-t">{cfg.label} mode</span>
    <span class="mc-chev" aria-hidden="true">▸</span>
  </button>
  <div id="mcBody" class="mc-body" {hidden if !mcOpen}>
    <!-- existing mc-head (Progress button only) / mc-modes / mc-section×2 markup, unchanged -->
  </div>
  ```
- The toggle button's `onclick` **does not** call `renderModeCompanion()` — the pages/tools lists
  don't change on open/close, only on mode switch, so the click handler just flips `mcOpen` and
  toggles the `hidden` attribute + `aria-expanded` directly on the existing nodes. This keeps
  open/close cheap and keeps whatever mode-pill click listeners are already bound intact.
- Mode-pill clicks (`setDashboardMode` → `renderModeCompanion()`) continue to fully rebuild the
  panel's HTML as they do today — including the toggle/body wrapper — reading the current `mcOpen`
  value so switching modes while expanded does not collapse the panel.
- New CSS: `.mc-toggle` (the collapsed row's button styling, matching the sidebar's existing
  all-text-button language — Path/Library toggle, theme button), `.mc-chev` (rotates 90° when
  `aria-expanded="true"`, same technique as `.sec-chev`), `.mc-body[hidden]{display:none}`. Adjust
  `.mode-companion`'s padding since the header now lives inside the toggle button instead of a
  padded card top.

### What isn't touched

`dashboardMode()`, `DASH_CONFIG`, `itemsForMode`/`toolsForMode`/`casesForMode`, the home page's
`renderWardDashboard()`, and all mobile drawer logic are unchanged — this is purely a
show/hide wrapper around existing markup and existing click handlers.

## Edge cases

- **No flash of expanded content before JS runs.** `#modeCompanion` starts as an empty `<section>`
  in the static HTML; its entire contents (collapsed or expanded) are written by
  `renderModeCompanion()` during boot, before the user ever sees it — no pre-JS content to flash.
- **Mode switch while expanded stays expanded.** Covered above — `mcOpen` is read, not reset, on
  every `renderModeCompanion()` call.
- **Keyboard/screen reader.** A real `<button>` gets Enter/Space activation for free;
  `aria-expanded` + `aria-controls` announce state per standard disclosure-pattern guidance, matching
  what `makeCollapsible()` already does elsewhere in this file.

## Testing / verification

1. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` — both
   still build and pass the static QA gate (behavior-only change; QA gate doesn't assert on this
   panel).
2. `node --test tests/*.test.mjs` — unaffected, no relation to this panel.
3. **Update `tests/smoke/faculty-console.spec.js`** — two specs interact with `#modeCompanion`
   assuming it's always expanded and will fail once it defaults to collapsed:
   - `blocks parent-document companion links from leaving a ready page` (~line 1075): locates
     `#modeCompanion .mc-item.is-tool`, asserts `toBeVisible()`, clicks it.
   - `keeps the exact-question iframe and route when Practice Questions is opened again` (~line 1123):
     clicks `#modeCompanion [data-mc-mode="shelf"]` directly.
   Both need one added step — click `#modeCompanion .mc-toggle` first — to keep passing; this is a
   direct, mechanical consequence of the behavior change, in scope for this work.
4. **Visual regression baselines will need regenerating, and that's expected.**
   `tests/smoke/visual-regression.spec.js` screenshots the full `#side` sidebar
   (`sidebar-desktop.png`, `sidebar-mobile.png`) against committed baselines. Collapsing ~280px out
   of the panel's default state changes the sidebar's rendered height, so both baselines will fail
   after this change until regenerated. Per this repo's convention, that happens via the "Refresh
   visual baselines" `workflow_dispatch` on the CI runner (Ubuntu/Chromium) — not by running
   Playwright locally on macOS, which produces false diffs from font rendering differences.
5. Manual browser check (both sites, light + dark theme, desktop and the ~820–1280px tablet range
   where the sidebar is still permanently visible): collapsed state shows only the button and reads
   the correct mode label; expanding reveals mode pills + Pages + Tools with no duplicate header;
   switching modes while expanded stays expanded and updates the toggle label; collapsing and
   re-expanding preserves correct content; a hard reload always starts collapsed.

## Out of scope

- Any change to `dashboardMode()`/`DASH_CONFIG` content, or to the home page's
  `renderWardDashboard()` ("Today on the unit") — this is UI chrome only.
- Mobile drawer behavior — already hidden by default there; not part of the density complaint.
- Persisting the expanded/collapsed state across reloads (explicitly rejected — see Decision 2).

## Rollout

Single shared-shell file change plus one test-file update, shipping via the normal build-on-push
pipeline to both Netlify sites — no flag, no migration, no staggering concern beyond the existing
QA gate. After merge, trigger "Refresh visual baselines" once to update the two sidebar screenshots.
