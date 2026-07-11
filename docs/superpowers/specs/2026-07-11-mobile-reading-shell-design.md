# Mobile Reading Shell Smoothing — design

**Date:** 2026-07-11
**Scope:** The shared MS3/resident SPA shell at `13_Faculty_Resources/_automation/site_build/spa_index.html`. This is a presentation and interaction improvement only; it does not alter clinical teaching content, sources, metadata, or assessment data.

## Problem

The phone layout already switches the desktop rail into a drawer and replaces the floating tool dock with a bottom tool bar. In the current shell, that creates three rough edges:

1. The contextual tool bar (`z-index:29`) covers the lower portion of the navigation drawer (`z-index:20`), even though the drawer itself remains `height:100vh`. The last navigation controls can sit beneath the bar.
2. The only persistent phone control is a compact `Menu` button. Once a student scrolls, it provides no visible reminder of which page they are reading.
3. Markdown tables are technically scrollable, but have no explicit swipe affordance or focusable scroll region. On a narrow screen, dense table content looks cut off rather than intentionally horizontally scrollable.

At 390 px, four contextual tools plus “More” fit tightly. At smaller phone widths, the labels become crowded and the targets are less comfortable to use one-handed.

## Goals

- Make the shared shell comfortable from 320 px through the existing 820 px mobile breakpoint.
- Keep every drawer destination reachable above the contextual tool bar and device safe area.
- Keep the current page identifiable while a student scrolls, without adding a new navigation model.
- Make wide Markdown tables visibly and accessibly horizontally scrollable.
- Preserve full access to contextual tools while using fewer buttons on very narrow phones.
- Give the “More tools” sheet an explicit close control and predictable keyboard focus return.
- Preserve desktop behavior, all existing deep links, the Path/Library switch, and no-PHI/local-only behavior.

## Non-goals

- Rewriting clinical content or converting all long pages into new pocket cards.
- Changing the nav hierarchy, search ranking, or tool registry.
- Introducing a framework, CDN, build dependency, network request, or new persistent browser state.
- Modifying individual tool pages; the change belongs in the shared SPA shell.

## Design

### 1. Mobile chrome and safe areas

Replace the loose, standalone mobile menu button with a `.mobile-chrome` bar that is only visible at `max-width:820px`. It contains the existing Menu button and a truncating, live current-page label. The shell updates that label whenever `show()` changes the route, including Home, Start here, markdown pages, and tools.

The bar is sticky, respects `env(safe-area-inset-top)`, has a stable background and border, and uses a 44 px-or-larger menu target. On desktop it is absent and the current desktop sidebar behavior is unchanged.

When `body.has-tlbar` is present, the drawer receives extra bottom padding equal to the bottom tool bar plus `env(safe-area-inset-bottom)`. The drawer uses `100dvh` (with a `100vh` fallback) and `overscroll-behavior:contain`, so its final nav item can be scrolled fully above the fixed tool bar. The reading content receives matching bottom space so its last line and feedback button remain reachable.

### 2. Contextual tool bar and sheet

The existing contextual tool registry and routing stay authoritative. At widths above 360 px, the bar continues to show up to four related tools plus More. At 360 px and below, it shows the first three related tools plus More, preserving 44 px-or-larger targets. The More sheet remains the route to every registered tool.

The More sheet gets an explicit close button. `openSheet()` stores the invoking More button, moves focus to Close, and updates `aria-expanded`; `closeSheet()` removes the overlay, resets `aria-expanded`, and returns focus to the prior invoking control when available. Escape and backdrop click continue to close the sheet.

### 3. Table affordances

After `marked` renders markdown and after `makeCollapsible()` has organized long pages, `enhanceTables(contentEl)` wraps each Markdown table in a `.table-scroll` region. The region is focusable, has a descriptive accessible name, and contains an initially hidden `.table-scroll-hint` that becomes visible only when its table overflows.

`refreshTableScrollCues()` calculates overflow from `scrollWidth > clientWidth + 1`; it runs after rendering, on the next animation frame, and on resize. On phones, a visible “Swipe to see all columns” cue and a subtle right-edge fade communicate that horizontal scrolling is intentional. Table cells receive mobile minimum widths only within this wrapper, keeping small tables usable while making multi-column content readable rather than crushed.

## Interfaces

| Unit | Consumes | Produces |
|---|---|---|
| `setMobileTitle(item)` | Current nav item (`{t, f, k}`) | Updates `#mobileTitle` text; no storage or route changes |
| `enhanceTables(body)` | Rendered `#content` DOM | `.table-scroll` wrappers, accessible table labels, and hint nodes |
| `refreshTableScrollCues()` | `.table-scroll` wrappers | `is-scrollable` class only when horizontal overflow exists |
| `openSheet(invoker)` / `closeSheet()` | More button / current focused element | Explicit close action and safe focus return |
| `mobileToolKeys(keys)` | Related tool file keys | Up to four tools above 360 px; up to three at or below 360 px |

## Accessibility and interaction rules

- All phone controls retain a 44 px or larger hit area.
- The top chrome, drawer, tool bar, and sheet honor safe-area insets.
- Focus-visible styles remain token-based and visible in light and dark themes.
- The sheet is labeled as a dialog, has a close button, supports Escape, and returns focus.
- Decorative scroll cue copy is hidden from assistive technology; the table container itself is named and keyboard-focusable.
- Existing `prefers-reduced-motion` behavior remains intact; no new motion is required.

## Validation

1. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` both end with `hard:0`.
2. Existing Playwright visual snapshots are refreshed after visual inspection at desktop and 390×844 mobile.
3. A resident-shell Playwright mobile interaction test at 320×844 proves:
   - the current-page mobile label updates;
   - the drawer gets enough bottom padding while a contextual bar is mounted;
   - a very narrow tool bar contains three related tools plus More;
   - More opens a closable sheet and returns focus;
   - the Interview/MSE page exposes a named, focusable table-scroll region with a cue when it overflows.
4. A manual narrow-screen check confirms the last drawer item, page feedback control, and table columns can be reached without content sitting under fixed UI.

## Rollout

The source shell is copied into both generated sites by the existing build. No deploy-folder files are edited directly. The change ships only after both generated builds and the existing smoke suite pass.
