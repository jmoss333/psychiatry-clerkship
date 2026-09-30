# Path route — "Trail" redesign (direction A)

Date: 2026-09-29 · Surface: Front Door › Path (`fd_path.js`, `frontdoor.css`) · Both sites
Mockup: Design canvas "Path Redesign", artboards *A · Trail* and *A · Trail on a phone*.

## Problem (from the live 6-week route, #743)

1. **The road and the stops are unrelated.** The connector is one fixed Bézier in a
   `viewBox="0 0 1000 260" preserveAspectRatio="none"` SVG; each stop is pushed down by a
   hand-tuned `nth-child(n){transform:translateY(…)}`. Nothing ties the two, so stops sit off
   the road, the road runs past the last stop, and the 4-week resident route reuses a curve
   drawn for six.
2. **Labels ride the stops.** Because the whole row is translated, week titles sit on six
   different baselines and cannot be scanned across; the selected row's wash runs out of the
   bottom of the card (`overflow:hidden` + the 108 px offset on row 3).
3. **Two highlights compete.** The current-week marker is a 13 px `.fd-dot` hanging off the
   number's right edge; the selected week is a double ring. At a glance it is unclear which
   one is "you".
4. **Progress is text only** (`0/8`), detached below the title; themes show only on the
   selected stop.

## Decision

Build direction A with a **neutral road** (owner's call, 2026-09-29). The #743 rule stands
unchanged: *the route is orientation, not a progress meter; `.fd-pathroute__connector` never
gains selected, current, complete or progress state.* Per-week progress is stated on each
stop, where the existing contract already puts it (it is derived per week from saved
activity, never from week order, so a week finished out of order still reads truthfully).

## Design

### Geometry: one source for road and stops
- Stops alternate between two heights only: **low** (odd rows) and **high** (even rows).
  The two values live in one place — constants in `fd_path.js`
  (`FD_PATH_Y_LOW`, `FD_PATH_Y_HIGH`, band height `FD_PATH_BAND`) — and the CSS consumes the
  same numbers as custom properties on `.fd-pathroute` (`--fd-path-y-low`, `--fd-path-y-high`,
  `--fd-path-band`). A unit test asserts CSS and JS agree.
- `fdPathRoute` **generates** the connector `d` from the week count: stop *i* of *n* is at
  `x = 1000·(i+0.5)/n`, `y = low|high`; consecutive stops joined by
  `C x₀+h y₀, x₁−h y₁, x₁ y₁` with `h = 500/n` (horizontal tangents at every stop). First
  point = first stop, last point = last stop — the road neither starts early nor overruns.
- SVG: `viewBox="0 0 1000 {band}"`, `preserveAspectRatio="none"`, sized to exactly the
  weeks grid width and the band height; the path gets `vector-effect:non-scaling-stroke` so
  horizontal stretch does not distort stroke width. Since x scales proportionally and y is
  1:1, every stop centre lands on the road at any width.
- The weeks grid gets `gap:0` (column centres must be at `(i+0.5)/n`); spacing moves into row
  padding.
- **Delete** the six `nth-child(n){transform}` rules. Rows are no longer translated; only the
  number moves inside a fixed-height node band (`margin-top` from the odd/even variable).
  Title, theme, status and count therefore share one baseline across all stops.

### Stop anatomy (desktop)
- `.fd-timeline__number` (72 px) gains an `aria-hidden` progress ring:
  `svg.fd-timeline__ring > circle.fd-timeline__ring-track + circle.fd-timeline__ring-fill`,
  `stroke-dasharray` from `fdTodayProgress(...).pct` (the same number the count shows). Track
  `--fd-ring-track`, fill `--fd-teal`. The count text stays the accessible statement.
- **Current**: `.fd-timeline__status` renders as a filled terracotta flag *above* the node
  (text unchanged: "Current" / "Complete · Current") — one clear "you" mark. The side-mounted
  `.fd-dot` is hidden on desktop (still emitted: contract ⚠ keeps gutter/dot/line markup).
- **Complete**: a small `--fd-success` check badge on the node's lower-right (CSS on
  `.fd-dot.is-done` repositioned — no new state source); "Complete" text keeps showing.
- **Selected** (`is-sel`): column wash `--fd-callout`, node fill `--fd-teal-wash` with the
  existing double ring, title in `--fd-terracotta-dark`, and a 3 px terracotta tab bar under
  the label block. No scale transform.
- **Theme is shown on every stop** (was selected-only). Count reads "x of y done" /
  "y activities" / "Complete" in `--fd-font-xs`.

### Phone (≤640 px)
Keep the existing vertical rail (`.fd-pathroute__weeks::before`, neutral) and row layout.
Changes: the 56 px number gains the same ring; the current flag becomes an inline pill beside
"Week n"; theme already shows on every row. Inline expansion of the current week (mockup) is
**out of scope** — the detail panel stays below the route.

### Unchanged
Roving tabs (arrows, Home/End, focus retention), `data-fd-view-week`, `role="tab"`,
`aria-selected`, `aria-current="step"`, `aria-controls`/`aria-labelledby`; the detail card;
state strings; `fd-pathroute__weeks--4|6`; always-emitted `.fd-timeline__line`; copy.

## Contracts touched
- `tests/fd-path.test.mjs`: connector `d` generated for n=4 and n=6 — starts at stop 1,
  ends at stop n, passes through every stop centre; ring dash matches `progress.pct`
  (incl. out-of-order completion); theme emitted on every row (already true in markup).
- `tests/fd-path-route.test.mjs`: keep the neutral-connector and no-state-class pins; add
  `vector-effect:non-scaling-stroke`, `gap:0` on the weeks grid, **no** `nth-child(n)`
  transform on desktop rows, CSS↔JS y-constant agreement.
- `tests/smoke/front-door.spec.js`: add a geometry check — each visible `.fd-timeline__number`
  centre lies within 4 px of the connector (`getPointAtLength` sampling) at 1280 and 1024 px,
  both audiences; await finite geometry after `fdFadeUp` (see smoke mid-fade trap).
- `CLASS-INVENTORY.md` §4: add the ring elements and the three custom properties; `.fd-timeline__theme`
  note becomes "shown on every stop"; `.fd-dot.is-done` desktop role = check badge; restate
  that the connector stays neutral. Same PR as the stylesheet.
- Visual baselines change → regenerate via the "Refresh visual baselines" workflow (Ubuntu),
  never locally.

## Out of scope / follow-ups
- Two-column detail panel (meta + one primary action | activity grid) from the mockup.
- Phone inline expansion of the current week.
- Directions B (chapter rail) and C (workload map) — kept on the canvas for reference.
