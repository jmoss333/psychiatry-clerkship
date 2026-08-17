# Front door — class inventory

The complete contract between `frontdoor.css` and the markup that tasks 3–9 emit.

**Source of truth:** `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
(176 distinct `fd-*` selector names, 13 `is-*` state classes). Every class below has a rule in that file unless
marked *(no rule)*.

**Why this file exists.** The implementation plan names 39 contract classes. The stylesheet styles
176. The remaining 137 are `__element` and `--modifier` names introduced while porting the
prototype's inline styles into a stylesheet — a renderer briefed only on the 39 would emit markup
that misses most of the CSS, and the failure is silent: the page renders, tests pass, the surface
just looks wrong. Read the surface you are building before writing its markup.

## How to read this

- `.fd-block__element` — element belongs *inside* `.fd-block`, though only the entries under
  **Nesting that is load-bearing** actually *require* it via a descendant selector.
- `.is-*` — state class, always applied **to the same element** as the base class
  (`class="fd-check is-done"`), never to a wrapper.
- **⚠ traps** are called out per surface. They are the rules whose selector depends on structure,
  so correct-looking markup can still miss them.

## Global rules that apply everywhere

| Class | Element | Notes |
|---|---|---|
| `.fd-shell` | outermost wrapper | **Required.** Paints `--fd-bg`/`--fd-text`, sets the font stack, and scopes three descendant rules: `a` / `a:hover` colours, `*{box-sizing:border-box}`, and its `:focus-visible` outline. Non-overlay content outside `.fd-shell` loses all four. |
| `.fd-main` | `<main>` | `max-width:1200px`, page padding. Sibling of `.fd-header`, child of `.fd-shell`. |

⚠ **The four overlay surfaces are portalled outside `.fd-shell`** (`.fd-search`, `.fd-sheet`,
`.fd-sheetbackdrop`, `.fd-nudge`) — they are `position:fixed` and listed *separately* in the
reduced-motion block for exactly that reason. They still do **not** inherit its font stack, links,
or box sizing, but `.fd-search`, `.fd-sheet`, and `.fd-nudge` receive their own token-based
`:focus-visible` rule. Render them inside `.fd-shell` if you can.

⚠ **Responsive visibility is done in CSS, not JS.** Do not conditionally render these — always emit
them and let the breakpoint decide:

| Class | Hidden | Shown |
|---|---|---|
| `.fd-rail`, `.fd-railnav` | below 1000px | ≥ 1000px |
| `.fd-actionbar`, `.fd-actionbar__spacer`, `.fd-quicktools--pills` | ≥ 1000px | below 1000px |
| `.fd-article__actions` | below 1000px | ≥ 1000px |
| `.fd-article .fd-tip` (Reader's keyboard hint **only** — the wizard's `.fd-tip--setup` line is a different subtree and stays visible) | below 1000px | ≥ 1000px |

Every row above has a matching rule in `frontdoor.css`'s `@media (min-width:1000px)` /
`@media (max-width:999px)` blocks — checked 2026-08-16 after `.fd-article__actions` and the
reader's `.fd-tip` were found listed only as parenthetical annotations on the surface outlines
below, with no rule actually implementing them (issue caught during Task 7 implementation). No
other outline annotation in this file had the same gap: `.fd-rail`/`.fd-quicktools--pills` (§3),
`.fd-railnav`/`.fd-actionbar`/`.fd-actionbar__spacer` (§6), and `.fd-weekgrid`'s 3→2 column drop
(§2) were all re-verified against the stylesheet directly, not just against each other.

⚠ **Adjacent-sibling spacing.** These get their vertical gap from `X + X {margin-top}`, so they
must be **direct siblings with no wrapper between them**: `.fd-role`, `.fd-quicktool`,
`.fd-kitcard`, `.fd-kitrow`, `.fd-step`. (`.fd-row` and the Library links use container `gap`
instead — see their surfaces.)

---

## Shared components (used by 2+ surfaces)

| Class | Element | Notes |
|---|---|---|
| `.fd-h1` | `<h1>` | Georgia 30px. Setup screens. |
| `.fd-sub` | `<p>` | Lead paragraph under `.fd-h1`. |
| `.fd-eyebrow` | `<span>` | 11px uppercase terracotta label. |
| `.fd-sectionhead` | `<h2>` | 12px uppercase dim label ("This week", "Quick tools", "Safety kit"). |
| `.fd-tip` | `<p>` | 11.5px keyboard hint. |
| `.fd-logo` | `<span>` | 30px terracotta ψ tile. |
| `.fd-attested` | `<span>` | "✓ faculty-attested" pill. Reader + sheet item preview. |
| `.fd-src` | `<span>` | Monospace source-path chip. Reader + sheet item preview. |
| `.fd-btn` | `<button>` | Base. **Always pair with a modifier** — `.fd-btn` alone has no colour. |
| `.fd-btn--primary` | + `.fd-btn` | Filled terracotta. |
| `.fd-btn--ghost` | + `.fd-btn` | Outlined. |
| `.fd-btn--accent` | + `.fd-btn` | Teal wash ("Set as my week"). |
| `.fd-chip` | `<span>` | Type chip. Default = "read". |
| `.fd-chip.is-tool` | same element | Teal variant for tools. |
| `.fd-check` | `<button>` | 22px done-toggle circle. |
| `.fd-check.is-done` | same element | Filled success + visible ✓. |
| `.fd-check.is-done.is-just-done` | same element | **Both** state classes needed for the pop animation. |
| `.fd-row` | `<div>` | Item row. Full card treatment. |
| `.fd-row.is-compact` | same element | Strips card bg/shadow/padding for the Path detail pane. |
| `.fd-row__open` | `<button>` | Fills the row; wraps title + meta. |
| `.fd-row__title` | `<span>` | |
| `.fd-row__title.is-done` | same element | Dim + strike-through. |
| `.fd-row__title.is-done.is-just-done` | same element | **All three** classes needed to animate the strike. |
| `.fd-row__meta` | `<span>` | Right-aligned group holding `.fd-chip` + `.fd-row__min`. |
| `.fd-row__min` | `<span>` | "12 min". |

⚠ `.fd-step .fd-check` — a `.fd-check` **inside a `.fd-step`** shrinks 22px → 20px. That is the only
size variant, and it is keyed on the ancestor, not a modifier class.

⚠ **`.fd-check`'s tap target.** The visible circle is 22px; a transparent `::after` grows it to 44px
under `@media (pointer:coarse)`. Do not add padding or resize it to hit 44px — that breaks the row.

---

## 1. Shell — header and tabs

```
.fd-header
  .fd-header__bar
    .fd-brand              <button>
      .fd-logo             <span>ψ</span>
      .fd-brand__name      <span>
    .fd-searchbtn          <button>          (search affordance, not an input)
      <svg>
      .fd-searchbtn__label <span>
      .fd-kbd              <span>⌘K</span>
    .fd-header__actions
      .fd-weekpill         <button>
      .fd-safetybtn        <button>
      .fd-themebtn         <button>          (compact labelled theme toggle)
  .fd-tabs                 <nav>
    .fd-tab                <button> ×3
```

| Class | Notes |
|---|---|
| `.fd-header` | `position:sticky; top:0; z-index:40`. |
| `.fd-header__bar` | The 1200px-capped flex row. `.fd-header` alone has no max-width. |
| `.fd-header__actions` | `margin-left:auto` — this is what pushes the right group over. |
| `.fd-themebtn` | Compact icon-only header theme toggle; `aria-label` names the action. |
| `.fd-tab.is-active` | Bold + teal + teal underline. |

⚠ `.fd-tabs` is a **sibling** of `.fd-header__bar` inside `.fd-header`, not a child of it.
⚠ Rails stick to `top:106px`, which assumes the full header (bar + tabs) is present and sticky.

---

## 2. Setup wizard (first-run, steps 1 and 2)

```
.fd-setup                          (flex centring host, fills the viewport)
  .fd-setup__inner                 (step 1 — role)
  .fd-setup__inner .fd-setup__inner--week   (step 2 — week; both classes)
    .fd-setup__brand
      .fd-setup__back    <button>  (step 2 only)
      .fd-logo           <span>    (step 1 only)
      .fd-setup__brand-name        (step 1 only)
      .fd-setup__done    <span>    (step 2 only — "MS3 ✓" confirmation pill)
    .fd-h1 / .fd-sub
    .fd-role   <button> ×N         (step 1)
      .fd-role__name / .fd-role__desc / .fd-role__hint
    .fd-tip.fd-tip--setup <p>      (step 1 only — closing "Tap once…" line)
    .fd-weekgrid                   (step 2)
      .fd-weektile <button> ×6
        .fd-weektile__n / .fd-weektile__title
      .fd-weekgrid__browse <button>
```

| Class | Notes |
|---|---|
| `.fd-setup__inner--week` | Modifier: widens 440px → 480px. **Apply alongside `.fd-setup__inner`**, not instead of it. |
| `.fd-weektile.is-sel` | Terracotta border on the chosen week. |
| `.fd-weekgrid__browse` | "Not on rotation — just browse". Dashed full-width button, **inside** `.fd-weekgrid`'s parent, after the grid. |
| `.fd-tip--setup` | Modifier: `margin:22px 0 0; font-size:12.5px` — step 1's closing tip sits further off and a touch larger than the shared `.fd-tip` (11.5px, authored for the Reader's keyboard hint). **Apply alongside `.fd-tip`** (`class="fd-tip fd-tip--setup"`), not instead of it — colour/token stay on the base class. |

⚠ `.fd-setup__brand .fd-logo` — the logo inside a setup brand block grows 30px → 38px. Keyed on the
ancestor; there is no modifier class for it.
⚠ `.fd-weekgrid` is 3 columns, dropping to 2 below 1000px. Do not set columns in markup.
⚠ `.fd-role` siblings space via `+`; do not wrap them individually.

---

## 3. Today

```
.fd-today
  .fd-today__h1 / .fd-today__sub
  .fd-today__cols
    .fd-today__main
      .fd-continue    <button>
        .fd-ring                       style="--fd-ring-pct: 62%"
          .fd-ring__inner  <span>62%</span>
        <span>
          .fd-continue__kicker
          .fd-continue__title
        .fd-continue__meta
          .fd-continue__count / .fd-continue__left
      .fd-setupcta    <button>         (alternative to .fd-continue when no week is set)
        .fd-setupcta__kicker / .fd-setupcta__title
      .fd-listhead
        .fd-sectionhead / .fd-listhead__theme
      .fd-list
        .fd-row ×N                     (see Shared)
      .fd-pick        <button>
        .fd-pick__dot / .fd-pick__kicker / .fd-pick__title
      .fd-quicktools--pills            (below 1000px only)
        .fd-quicktool ×5
    .fd-rail                           (≥1000px only)
      .fd-sectionhead
      .fd-quicktool  <button> ×5
        .fd-quicktool__dot / .fd-quicktool__label
      .fd-sectionhead
      .fd-kitcard    <button> ×5
        .fd-kitcard__dot / .fd-kitcard__title / .fd-kitcard__sub
```

| Class | Notes |
|---|---|
| `.fd-continue__kicker.is-complete` | Switches teal → terracotta when the week is finished. |
| `.fd-ring.is-celebrating` | One-shot pulse on week completion. |
| `.fd-list` | Supplies the 8px gap between `.fd-row`s — rows have no sibling margin. |

⚠ **`.fd-ring` needs `--fd-ring-pct` set inline** (e.g. `style="--fd-ring-pct:62%"`). It defaults to
`0%`, so a ring rendered without it silently shows an empty track. This is the one custom property
the markup owns rather than the palette.

⚠ **`.fd-quicktool` is the same element in both layouts.** Inside `.fd-quicktools--pills` it becomes
a rounded pill (`.fd-quicktools--pills .fd-quicktool`); inside `.fd-rail` it stays a full-width row.
Emit the identical inner markup for both; only the container class differs.

⚠ `.fd-today__cols` is the flex wrapper that puts `.fd-today__main` and `.fd-rail` side by side.
Omitting it collapses the rail underneath.

---

## 4. Path

```
.fd-path
  .fd-path__h1
  .fd-path__cols
    .fd-timeline
      .fd-timeline__row   <button> ×6
        .fd-timeline__gutter
          .fd-dot
          .fd-timeline__line
        .fd-timeline__body
          .fd-timeline__n / .fd-timeline__title
        .fd-timeline__count
    .fd-detail
      .fd-detail__head
        .fd-eyebrow / .fd-detail__here
      .fd-detail__h2
      .fd-detail__list
        .fd-row.is-compact ×N
      .fd-btn.fd-btn--accent           ("Set as my week")
```

| Class | Notes |
|---|---|
| `.fd-timeline__row.is-sel` | Selected week: `--fd-selected` background. |
| `.fd-dot.is-done` | Filled success. |
| `.fd-dot.is-current` | Terracotta + 4px `--fd-selected` halo. |
| `.fd-detail__here` | "you are here" pill. |

⚠ `.fd-timeline__row.is-sel .fd-timeline__title` — the title recolours only via its **selected
ancestor row**. Adding `is-sel` to the title itself does nothing.

⚠ `.fd-timeline__row:last-child .fd-timeline__line` is `display:none`. **Always emit
`.fd-timeline__line` on every row**, including the last — do not conditionally omit it. The
selector handles the final connector, and skipping it on other rows breaks the spine.

⚠ `.fd-detail .fd-row.is-compact` — compact rows regain a 1px border **only inside `.fd-detail`**.
A compact row used elsewhere is borderless.

---

## 5. Library

```
.fd-library
  .fd-library__head
    .fd-library__h1 / .fd-library__count
  .fd-library__grid
    .fd-col                      (no rule — plain grid child)
      .fd-col__name
      .fd-collink  <button> ×N
        .fd-collink__dot
        .fd-collink__label
```

| Class | Notes |
|---|---|
| `.fd-library__grid` | `auto-fill, minmax(196px, 1fr)`, gap 22/26px. |
| `.fd-col__name` | Column heading: uppercase terracotta with a bottom rule. |
| `.fd-collink__dot.is-tool` | Teal dot; default is olive (a read). |

⚠ **`.fd-col` has no rule of its own** *(known; deferred by review)*. It is still required as the
grid child that groups a heading with its links — the grid's `align-items:start` acts on it. Emit
it; just don't expect it to paint anything.

⚠ `.fd-collink` rows have **no sibling margin** — they sit flush by design (5px internal padding).

---

## 6. Reader (reading / tool pane)

```
.fd-reader                              + .is-nav-next | .is-nav-prev
  .fd-reader__back   <button>
  .fd-reader__cols
    .fd-article
      .fd-article__head
        .fd-eyebrow / .fd-article__dot / .fd-article__meta / .fd-attested
      .fd-article__h1
      .fd-article__lead
      .fd-article__body                  (rendered long-form content)
      .fd-keypoints
        .fd-keypoints__label
        .fd-keypoints__item ×N
          .fd-keypoints__bullet
      .fd-trynow      <button>
        .fd-trynow__icon / .fd-trynow__title / .fd-trynow__sub
      .fd-article__source
        <span>Source:</span> .fd-src
      .fd-article__actions                (≥1000px)
        .fd-btn.fd-btn--primary / .fd-btn.fd-btn--ghost
      .fd-prevnext
        .fd-prevnext__btn                 (prev)
        .fd-prevnext__btn.is-next         (next)
          .fd-prevnext__label / .fd-prevnext__title
      .fd-tip                             (≥1000px — this instance only, via `.fd-article .fd-tip`)
    .fd-railnav                           (≥1000px)
      .fd-railnav__label
      .fd-railnav__list
        .fd-railnav__row <button> ×N      + .is-current
          .fd-railnav__dot                + .is-done
          .fd-railnav__title              + .is-done
          .fd-visually-hidden             (done rows only: "Completed")
  .fd-actionbar__spacer                   (below 1000px)
.fd-actionbar                             (below 1000px, fixed)
  .fd-btn.fd-btn--ghost
  .fd-btn.fd-btn--primary
    <span>label</span>
```

| Class | Notes |
|---|---|
| `.fd-reader.is-nav-next` / `.is-nav-prev` | Slide-in direction. **Same element as `.fd-reader`.** |
| `.fd-article__body` | Long-form markdown typography: 16.5px, 1.72 line-height, 62ch measure. |
| `.fd-visually-hidden` | Accessible completion suffix on done rail rows; never use `aria-pressed` for navigation. |
| `.fd-prevnext__btn.is-next` | Right-aligns the next button's contents. |
| `.fd-article__actions` | Desktop-only primary/ghost pair. **Always emit it** (no `desk` JS branch) — `.fd-actionbar` at the bottom of this tree is the mobile equivalent; the breakpoint hides this one and shows that one, never both. |
| `.fd-tip` (Reader instance) | The `←`/`→`/`1`/`2`/`3` keyboard hint. Hidden below 1000px via the descendant selector `.fd-article .fd-tip` — **do not** hide the bare `.fd-tip` class, which would also blank the wizard's `.fd-tip--setup` line (§2). |

⚠ **`.fd-actionbar .fd-btn--primary` requires its label wrapped in a bare `<span>`**
(`.fd-actionbar .fd-btn--primary span` supplies the ellipsis). A text-only child overflows on
narrow screens.

⚠ `.fd-actionbar` is `position:fixed` — it must be a **sibling of `.fd-reader`, not inside it**, or
the article's stacking context traps it. `.fd-actionbar__spacer` goes **inside** `.fd-reader` as the
last child to reserve scroll room.

⚠ `.fd-railnav__row.is-current .fd-railnav__dot` and `… .fd-railnav__title` recolour from the
**row's** state. `.fd-railnav__dot.is-done` and `.fd-railnav__title.is-done` are separate,
independent states on the child. A current *and* done item carries both.

⚠ `.fd-railnav` is `display:none` below 1000px and `display:block` at/above it — do not set
`display:flex` on it; `.fd-railnav__list` is the flex container.

---

## 7. Search overlay

```
.fd-search                          (fixed, full-screen scrim + flex host; click = close)
  .fd-searchpanel                   (stopPropagation here)
    .fd-searchpanel__head
      <svg>
      .fd-searchpanel__input   <input>
      .fd-searchpanel__esc     <button>esc</button>
    .fd-searchpanel__body
      .fd-result <button> ×N
        .fd-result__dot         + .is-tool | .is-safety
        .fd-result__title
        .fd-result__meta
      .fd-searchpanel__empty          (no-results state, replaces the results)
    .fd-searchpanel__foot
```

| Class | Notes |
|---|---|
| `.fd-search` | Carries the scrim **and** the centring — it is not a separate backdrop element (unlike the sheet). |
| `.fd-searchpanel__body` | `max-height:46vh` + scroll. The scroll container. |
| `.fd-result__dot` | Default olive (read); `.is-tool` teal; `.is-safety` danger. |

⚠ The search overlay uses **one** element for scrim + layout. The sheet uses **two**
(`.fd-sheetbackdrop` + `.fd-sheet`). Do not mirror one pattern onto the other.

---

## 8. Side sheet and nudge

```
.fd-sheetbackdrop                   (fixed, z-90, separate element)
.fd-sheet                           (fixed right, z-95)
  .fd-sheet__head
    .fd-sheet__back    <button>     (only when reached from the kit)
    .fd-sheet__title   <span>
    .fd-sheet__close   <button>
  .fd-sheet__body
    ── kit variant ──
    .fd-sheet__intro
    .fd-kitrow <button> ×N
      .fd-kitrow__dot / .fd-kitrow__title / .fd-kitrow__sub
    ── protocol variant ──
    .fd-step  <button> ×N
      .fd-check                     (20px here — see Shared)
      .fd-step__text
    .fd-doccallout
    .fd-sheet__attribution
    .fd-btn.fd-btn--ghost           ("Open the full page →")
    ── item-preview variant ──
    .fd-chip / .fd-attested
    .fd-sheet__lead
    .fd-src
    .fd-btn.fd-btn--primary
    .fd-sheet__note

.fd-nudge                           (fixed, z-120, bottom-centre toast)
  .fd-nudge__text
  .fd-nudge__go       <button>
  .fd-nudge__dismiss  <button>
```

| Class | Notes |
|---|---|
| `.fd-sheetbackdrop` | Separate sibling element, before `.fd-sheet`. Carries the click-to-close. |
| `.fd-sheet__body` | The scroll container (`flex:1; overflow-y:auto`). |
| `.fd-doccallout` | Amber "Document:" callout. Border is derived via `color-mix` from the two olive tokens. |
| `.fd-sheet__attribution` | "✓ From: … · faculty-attested". |

⚠ `.fd-nudge` inverts by construction: it paints `--fd-text` as its background and `--fd-bg` as its
text, so it stays a high-contrast slab in both themes. Do not override its colours.

⚠ All three sheet variants share `.fd-sheet__head` / `.fd-sheet__body`; only the body contents
differ. `.fd-sheet__back` is rendered only for a protocol reached from the kit.

---

## State-class reference

| State | Applied to | Meaning |
|---|---|---|
| `.is-active` | `.fd-tab` | current tab |
| `.is-sel` | `.fd-weektile`, `.fd-timeline__row` | chosen / viewed |
| `.is-current` | `.fd-dot`, `.fd-railnav__row` | "you are here" |
| `.is-done` | `.fd-check`, `.fd-dot`, `.fd-row__title`, `.fd-railnav__dot`, `.fd-railnav__title` | completed |
| `.is-just-done` | `.fd-check`, `.fd-row__title` | **with `.is-done`** — fires the one-shot animation |
| `.is-complete` | `.fd-continue__kicker` | whole week finished |
| `.is-celebrating` | `.fd-ring` | one-shot completion pulse |
| `.is-compact` | `.fd-row` | Path detail density |
| `.is-tool` | `.fd-chip`, `.fd-collink__dot`, `.fd-result__dot` | item is a tool, not a read |
| `.is-safety` | `.fd-result__dot` | search hit is a safety protocol |
| `.is-next` | `.fd-prevnext__btn` | right-aligned variant |
| `.is-nav-next` / `.is-nav-prev` | `.fd-reader` | slide direction |

## Keyframes

Namespaced `fd*` because this stylesheet shares a document with ~21 tools that ship their own
animations: `fdFadeUp`, `fdSheetIn`, `fdBackdropIn`, `fdPopIn`, `fdCheckPop`, `fdStrikeDraw`,
`fdRingPulse`, `fdSlideR`, `fdSlideL`. All are disabled under `prefers-reduced-motion: reduce`.

## Colour

Markup must not carry colour. Every colour is a `var(--fd-*)` token declared in
`13_Faculty_Resources/_automation/site_build/clinical-warm.css` (33 tokens, each with a light and a
dark value). `tests/fd-tokens.test.mjs` fails the build on any raw hex in `frontdoor.css`, and
`tests/fd-contrast.test.mjs` enforces WCAG AA across both palettes.

The one custom property the markup owns is `--fd-ring-pct` on `.fd-ring`.
