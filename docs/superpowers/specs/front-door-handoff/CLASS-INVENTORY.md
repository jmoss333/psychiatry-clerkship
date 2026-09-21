# Front door — class inventory

The complete contract between `frontdoor.css` and the markup that tasks 3–9 emit.

**Source of truth:** `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
(329 distinct `fd-*` selector names, 22 `is-*` state classes). Every class below has a rule in that file unless
marked *(no rule)*.

**Why this file exists.** The original implementation plan named 39 contract classes. Its stylesheet styled
273. The remaining 234 were `__element` and `--modifier` names introduced while porting the
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
| `.fd-tabs`, `.fd-weekpill`, `.fd-settingsbtn` — on a **reader** only (`.fd-shell:has(.fd-actionbar)`; frontdoor.css "Phone chrome", 2026-09-18). The action bar's `‹` is the route to all three. `.fd-brand__name` is clipped there, never `display:none`, so the home button keeps its accessible name. | ≤ 640px | above 640px, and at every width on Today / Path / Library / Progress / not-found |
| `.fd-article__head` and an empty `.fd-article__lead` on a **tool** (`.fd-reader--tool`); `.fd-article__h1` is clipped there, never `display:none`. Not a breakpoint: a tool supplies its own `<h1>` (calibrated on every shipped tool 2026-09-19; `tool-expand.spec.js` opens each one and asserts it), so the shell's masthead yields at every width. | every width | never on a tool |

The enhanced `.fd-reader--guide` is a scoped exception: its week `.fd-railnav` remains
available below the article at every width. Its new `.fd-guide-margin` is sticky beside the
article at ≥1000px and flows before the article below 1000px. See §6a.

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
      .fd-settingsbtn      <button>          (compact settings-panel gear)
  .fd-tabs                 <nav>
    .fd-tab                <button> ×3
```

| Class | Notes |
|---|---|
| `.fd-header` | `position:sticky; top:0; z-index:40`. |
| `.fd-header__bar` | The 1200px-capped flex row; at 640px and below it becomes a two-row grid so brand/search and utilities cannot collide — except on a reader (`.fd-shell:has(.fd-actionbar)`), where it is one flex row again: ψ tile, search grown to fill, ✚ Safety. `.fd-header` alone has no max-width. |
| `.fd-header__actions` | `margin-left:auto` in the flex layout; at 640px and below it spans grid row two, resets the margin, and aligns right. |
| `.fd-settingsbtn` | Compact icon-only header gear opening the settings panel; `aria-label` names the action. |
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
  .fd-consistency                     role="img" aria-label="Active N of the last 7 days" (absent until N ≥ 1)
    .fd-consistency__dots  <span>     aria-hidden
      .fd-consistency__day ×7
        .fd-consistency__dot(.is-on) / .fd-consistency__label
    .fd-consistency__text  <span>     aria-hidden
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
| `.fd-consistency` | Seven-day activity strip (2026-09-02, not in the prototype). Replaces the subhead's `· N days in a row` clause, which only Daily Review could write. Derived at render time by `fdActivityDays` from the timestamps every tool already stores; nothing new is persisted. Carries a `-12px` top margin so the subhead's 22px gap closes only when the strip is present. |

Task 5 composes device-local activity around the pure Today renderer and reuses the Reader for
internal Progress. These are part of the same shipped class contract:

| Class | Element / notes |
|---|---|
| `.fd-due` | Due-review button; contains `.fd-due__label`, `.fd-due__breakdown`, and `.fd-due__action`. |
| `.fd-resume` | Session-resume section; `.fd-resume__link` is the query-preserving link. |
| `.fd-resume__block` | Progress line inside `.fd-resume__link` when the capsule came from a timed block ("Block · 1 of 2 done"); the link then carries `resume=1&block=1&n[&cat]` (Phase 2, 2026-09-16). |
| `.fd-block` | Timed block card (2026-09-02, not in the prototype), spliced in with the due row and resume card by `fdTodayLive`. Planner face: `.fd-block__head` (`__kicker`, `__chips` › `__chip(.is-sel)`, `__hint`), `.fd-block__steps` › `__step` (`__dot.is-review/.is-page/.is-qb`, `__title`, `__min`), `.fd-block__actions` (a `.fd-btn--primary` carrying `data-block-start`), or `.fd-block__empty`. Live face adds `.is-live` on the card, `__count`, `__check` on each `__step(.is-done)`, and `__doneline`. Click attributes are `data-block-minutes` / `-start` / `-continue` / `-end`, owned by the shell's auxiliary click handler — deliberately outside the `data-fd-*` controller namespace. Rendered by `fdBlockCard` (`frontdoor/fd_block.js`). |
| `.fd-primary` | Wrapper the shell puts around the ONE device-store row that won Today's primary slot (`fdTodayPrimary`, `frontdoor/fd_today.js`; composed by `fdTodayLive`). Gives the card inside a terracotta top bar and the card shadow. Absent when the lead card (`.fd-continue` / `.fd-setupcta`) is itself the primary — that card then carries no `.is-secondary`. |
| `.fd-primary__why` | One-paragraph explanation of the rule, directly under the primary. Rendered by `fdTodayWhy`. |
| `.fd-also` | Modifier on the `.fd-sectionhead` `<h2>` that reads "Also today"; everything that did not win renders below it in a fixed order (block › due › resume › last-read › capture), then the week list. |
| `.fd-lastread` | "You were reading" row (`fdLastReadRow`, `frontdoor/fd_due.js`): the last opened item when it is an undone read from this week and not already the Continue target. Shares the runtime-row rule with `.fd-due`. Contains `.fd-lastread__kicker` (primary only), `.fd-lastread__title`, `.fd-lastread__action`. |
| `.fd-due__kicker` | "Clear what's due" line, present only when the due row is the primary (`.fd-due.is-primary`). |
| `.fd-freshset` | Ghost `.fd-btn` sibling of a completed-week `.fd-continue` that is primary: "Practice a fresh set →", opens the question bank. |
| `.fd-capture-launch` | Full-width capture-dialog launcher. |
| `.fd-capture-launch--global` | Stable learner-route launcher hook; `#fdCaptureMount` keeps it fixed above phone navigation and clear of the desktop tool dock. *(no rule)* |
| `.fd-capture` | Today question inbox. Contains `.fd-capture__head`, `.fd-capture__new`, `.fd-capture__purpose`, and compact `.fd-capture__item` rows. Each row uses `.fd-capture__meta` / `__status`, `__question`, optional `__match`, and a wrapping `__actions` group of `__action` buttons; `__action--done` is the quiet trailing action. `.fd-capture__copy` retains supervised clipboard export. |
| `.fd-progresscard` | Internal-Progress entry; contains `.fd-progresscard__title` and `.fd-progresscard__meta`. |
| `.fd-progress-reader` | Reader modifier for the internal Progress surface. |

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
  .fd-path__intro
  .fd-path__cols
    .fd-detail
      .fd-detail__head
        .fd-eyebrow / .fd-detail__here
      .fd-detail__h2
      .fd-detail__practice
      .fd-detail__list
        .fd-row.is-compact ×N
      .fd-btn.fd-btn--accent           ("Set as my week")
    .fd-timeline
      .fd-timeline__row   <button> ×6
        .fd-timeline__gutter
          .fd-dot
          .fd-timeline__line
        .fd-timeline__body
          .fd-timeline__n / .fd-timeline__title
        .fd-timeline__count
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
    .fd-col                      (break-inside:avoid; a whole section per column)
      .fd-col__name
      .fd-collink  <button> ×N
        .fd-collink__dot
        .fd-collink__label
        .fd-collink__hint          (tools only — the row's one-line "use this when…")
```

The Essentials view keeps the same `.fd-library` root and replaces the full Library grid with
this subtree:

```
.fd-library.fd-kit
  .fd-library__head
  .fd-kit__filter
    label + select[data-fd-kit-section]   (native section picker)
  .fd-kit__review
    details / summary                    (native review explanation)
  .fd-kit__layout
    .fd-kit__readings
      details.fd-kit__group ×N
        summary
        .fd-kit__reading <button> ×N
          .fd-kit__title / .fd-kit__pending / .fd-kit__summary / .fd-kit__minutes
    aside.fd-kit__tools                  (tool rail)
      details.fd-kit__group.fd-kit__tool-group
        summary
        .fd-kit__tool-list
          .fd-collink <button> ×N
```

At 1000px and wider, `.fd-kit__layout` is a 3:1 readings/tool-rail grid. From 641–999px the
readings and tools stack in document order. At 640px and narrower, the tool rail moves above the
readings and `.fd-kit__tool-list` becomes a horizontally scrolling row. The section picker and
both group types remain native `select`/`details` controls at every width.

| Class | Notes |
|---|---|
| `.fd-library__grid` | Multi-column flow, `columns:280px` (2026-09-19; was an `auto-fill, minmax(280px,1fr)` grid whose rows were as tall as their tallest cell). Sections balance by height; `.fd-col{break-inside:avoid}` keeps each whole. |
| `.fd-library__shortcut` | Wraps "· press / to filter" inside `.fd-library__count`; hidden at ≤640px as a whole fragment. |
| `.fd-col__name` | Column heading: uppercase terracotta with a bottom rule. |
| `.fd-collink__dot.is-tool` | Teal dot; default is olive (a read). |
| `.fd-collink__hint` | One line under a tool's label, from `curriculum.libraryHints` (2026-09-16). The row wraps (`flex-wrap`) and the hint takes the full width, indented past the dot. Omitted from the markup, not emptied, when an item has none — every read row renders exactly as before. |

`.fd-col` gained its first rule on 2026-09-19 (`break-inside:avoid` + the section gap): it is the
unit the multi-column flow keeps whole, and the wrapper that groups a heading with its links.

⚠ `.fd-collink` rows have **no sibling margin** — they sit flush by design (5px internal padding).

---

## 6. Reader (reading / tool pane)

```
.fd-reader                              + .is-nav-next | .is-nav-prev
  [tool only, same element] &.fd-reader--tool  + &.is-tool-expanded
    .fd-reader__toolbar
      .fd-reader__back   <button>
      .fd-btn.fd-btn--ghost[data-fd-expand-tool]  <button> (≥1000px)
  [read only] .fd-reader__back   <button>
  .fd-reader__cols
    .fd-article
      .fd-article__head                  (tool: display:none at EVERY width — the tool titles itself)
        .fd-eyebrow / .fd-article__dot / .fd-article__meta / .fd-attested
      .fd-article__h1                    (tool: clipped, never removed — the outer document keeps its heading)
      .fd-article__lead                  (tool: hidden when empty)
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
| `.fd-reader--tool.is-tool-expanded` | Tool-only wide workspace state. The same state is mirrored on `.fd-main`; neither class is applied to reads. |
| `.fd-reader__toolbar` | Tool-only row containing Back and the stable `Expand tool` toggle. The toggle is hidden below 1000px while its saved preference remains intact. |
| `.fd-article__body` | Base long-form markdown typography: `--fd-font-lg` (17px), 1.72 line-height, 62ch measure. Enhanced field guides use the scoped type treatment in §6a. |
| `.fd-compass` | Six-Week Compass, build-injected into `.fd-article__body` on the six-week Welcome (`welcome_compass.py`). Children: `.fd-compass__title`, `.fd-compass__weeks` (`<ol>`, markerless card grid), `.fd-compass__week` (`<li>` card), `.fd-compass__heading` (`<h3>`), `.fd-compass__kicker` (the `Week N` span inside that heading), `.fd-compass__link` *(no rule)*. Every rule but the root is written as a two-class selector so it outranks the `.fd-article__body` element rules it sits inside. |
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

## 6a. Clinical field guide

Scoped enhancement of a real teaching page; never applied to an activity iframe or faculty
preview. Full behavior and content-preservation contract:
[`2026-09-15-clinical-field-guide-components.md`](../2026-09-15-clinical-field-guide-components.md).

```
.fd-reader.fd-reader--guide
  .fd-reader__cols
    .fd-guide-header                      (original identity, title and lead moved here)
    .fd-guide-margin                      (after orientation, before teaching)
      .fd-guide-practice                   (canonical related activity, when available)
      .fd-guide-contents <details>
        <summary>On this page</summary>
        <nav> links[data-guide-section]
      .fd-guide-find <form>
        <label> / <input> / <button>
      .fd-guide-results
      <button>Print guide</button>
    .fd-article                          (existing teaching and progress controls)
      .fd-article__body
        .fd-guide-arrival
        .fd-guide-section | .sec-c        (section target)
          h2
          original content
          .fd-guide-table-controls       (optional comparison/row toggles)
          .table-scroll
            .table-scroll-viewport       (original semantic table)
            .fd-guide-table-rows          (derived alternative; hidden initially)
              dl > dt + dd
    .fd-railnav                          (week navigation after the article)
.fd-guide-return                         (temporary return button on an activity)
```

| Class | Notes |
|---|---|
| `.fd-reader--guide` | Modifier on the existing reader. Removes the enclosing article card; 18px/1.75 prose, 720px maximum reading column, serif display title and section headings. Existing activity layout remains separate. |
| `.fd-guide-header` | Original identity, H1 and lead nodes move into this semantic header. First in DOM; desktop column two/row one, centered in natural narrow-screen flow. |
| `.fd-guide-margin` | Sticky 180–220px desktop column with bounded scrolling, spanning header/article rows. Natural document flow below 1000px. Follows `.fd-guide-header` and precedes `.fd-article` in DOM; CSS never reverses keyboard order. |
| `.fd-guide-practice` | Full-width shortcut to the existing related activity; long canonical titles wrap. Uses the real `data-fd-open` route and carries no simulated activity. |
| `.fd-guide-contents` | Native `<details>` containing a labeled section `<nav>`. Desktop starts expanded; narrow views start collapsed. Links expose current location with `aria-current="location"`. |
| `.fd-guide-find` | Page-scoped finder form. The narrow desktop margin stacks its field and action; the wider mobile flow pairs them. The label spans all form columns; input shrinks safely and action remains visible. |
| `.fd-guide-results` | Finder feedback/results. Result buttons fill their container and wrap text. |
| `.fd-guide-section` | Wrapper preserving a non-collapsible authored heading and its following content. `.sec-c` keeps the existing explicit disclosure behavior where allowed. |
| `.fd-guide-orientation` | Teal summary/orientation treatment applied to an authored section by a narrow heading match. |
| `.fd-guide-caution` | Olive rule and wash for an explicitly titled caution section. Meaning remains in the original heading. |
| `.fd-guide-example` | Teal rule and smaller supporting type for an explicitly identified example block. |
| `.fd-guide-references` | Ruled reference region with 14px/1.7 text and long citation wrapping. |
| `.fd-guide-match` | Temporary passage outline and wash; no completion or review meaning. Scroll margin keeps it below sticky chrome. |
| `.fd-guide-arrival` | Visible context for passage arrival. Hidden on paper, while the passage itself remains. |
| `.fd-guide-table-controls` | Wrapping buttons with real `aria-pressed` state. Minimum 44px height. |
| `.fd-guide-table-rows` | Derived row reading view, one `<dl>` per original row; exact source header/cell text. The semantic table remains the print representation. |
| `.fd-guide-return` | Temporary practice return control; deliberately styled outside the guide modifier because it appears while a real activity is open. |

⚠ **Hidden means hidden.** `.fd-reader--guide [hidden]` wins on screen. Print overrides only
the original `.table-scroll-viewport[hidden]`, hides the row alternative and controls, expands
all teaching/disclosures, and retains safety and review notices. Native details are opened and
restored by the print lifecycle as well as having a CSS fallback.

⚠ **Purpose is presentation.** These classes never add a clinical interpretation or change
source wording. The crisis block stays in its original context and remains outside collapsed
content. The high-risk governance focus rule outranks passage arrival focus.

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
    .fd-sheet__pending                 (non-reviewed, valid 3–5-step protocol only)
    .fd-sheet__failure    [role=alert] (missing/malformed protocol data only)
    .fd-btn.fd-btn--ghost           ("Open the full page →")
    ── item-preview variant ──
    .fd-chip / .fd-attested
    .fd-sheet__lead
    .fd-src
    .fd-btn.fd-btn--primary
    .fd-sheet__note
    ── settings variant ──
    .fd-sheet__intro
    .fd-set  <section> ×N            (direct siblings, no wrapper)
      .fd-set__h  <h3>
      .fd-choices      [role=group]            (You — role; omitted when no roles are supplied)
        .fd-choices__btn <button> ×N           (.is-active + aria-pressed on the chosen one)
      .fd-set__label   <label for>             (Pacing — names the date field)
      .fd-set__date    <input type=date>       (Pacing — the exam date)
      .fd-seg          [role=group]            (Appearance — aria-label "Color theme")
        .fd-seg__btn   <button> ×3             (System / Light / Dark; .is-active + aria-pressed on the chosen one)
      .fd-set__note
      ── Your data ──
      .fd-set__link    <button>                (routes to the Progress page's export)
      .fd-set__danger  <button>                (calm: one control — "Clear everything on this device")
      .fd-set__note.fd-set__note--warn  [role=alert]   (armed only — both classes)
      .fd-set__row                             (armed only)
        .fd-btn.fd-btn--ghost <button>         ("Keep my data")
        .fd-set__danger       <button>         ("Erase everything")
      ── Usage ──                              (whole section absent unless the usage emitter shipped)
      .fd-seg          [role=group]            (Usage — aria-label "Usage counting"; the panel's SECOND .fd-seg)
        .fd-seg__btn   <button> ×2             (On / Off; .is-active + aria-pressed on the chosen one)
      .fd-set__note                            (states what is true of THIS device in each state)
                                               (under a browser DNT/GPC signal: the note alone, no segments)

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
| `.fd-sheet__attribution` | "✓ From: <page title> · faculty-attested". Names the page, never the file (the prototype's `protoSrc` was a readable source); the ref rides on `data-ref`. |
| `.fd-sheet__pending` | Affirmative not-yet-reviewed state for a valid 3–5-step protocol; mutually exclusive with attribution and failure. |
| `.fd-sheet__failure` | Fail-closed alert with an owner-controlled sentence; protocol steps and documentation remain absent. |
| `.fd-set` | One settings section. Spaced by `.fd-set + .fd-set`, so sections are direct siblings and a new one can be inserted anywhere in the order without a wrapper. |
| `.fd-seg` | Segmented control. Segments butt together inside one border (`gap:0`); the divider is `.fd-seg__btn + .fd-seg__btn`'s `border-left`. The settings panel renders **two** of them and the counts differ: Appearance has three segments, Usage two. Usage is also the only section of the panel that is usually absent — it renders only where the usage emitter shipped, and under a browser DNT/GPC signal it renders an explanatory note and no segments at all, because a control the panel could not honour would misrepresent who is deciding. |
| `.fd-seg__btn` | An ordinary toggle button, never `role="radio"` — that role promises roving tabindex and arrow-key selection, which this control does not implement. `.is-active` (what the CSS fills) and `aria-pressed` (what assistive tech reads) are set together and must stay on the same button. |
| `.fd-choices` | Wrapping chip set for a single choice from a variable-length list (today: role). Chips size to their text and wrap, because the labels are per-site prose — equal segments strand them over three lines at phone width. |
| `.fd-set__label` | Visible label for a settings field, bound by `for`. The panel's other sections are button groups named by `aria-label`; this is the one control that needs a real `<label>`. |
| `.fd-set__date` | The Pacing section's `<input type="date">`. Borrows `.fd-choices__btn`'s border, radius and surface so the panel reads as one control family, and takes the full sheet width because a native date input's intrinsic width is barely wider than its own text. Declare `font:inherit` **before** the size step or the shorthand resets it. It is the only control in the panel outside the delegated click path — `fd_wire.js` commits it on a change event and deliberately renders nothing, because rebuilding the overlay destroys the input mid-entry. |
| `.fd-choices__btn` | Same rules as `.fd-seg__btn`: an ordinary toggle button, never `role="radio"`, with `.is-active` and `aria-pressed` on the same one. **Not `.fd-chip`** — that is the static type badge on result rows, with no border, no pointer, no touch target and no `.is-active` rule, so a chip set built on it paints every option identically. |
| `.fd-set__link` | The Your-data route to the export the Progress page already ships (`data-act="studyexport"`). Painted as a link, not a control, and labelled with a trailing arrow: it navigates, it does not export, and a button promising a download that delivers a page change is the same over-claim the attested-pill rules forbid. |
| `.fd-set__danger` | The destructive control, **outlined in both states** — calm ("Clear everything on this device") and armed ("Erase everything"). Never filled: a red slab under the fingertip that just armed the confirm invites the reflex second tap the two-tap pattern exists to prevent. Its armed partner is `.fd-btn.fd-btn--ghost`, so the pair still reads red-versus-neutral. |
| `.fd-set__note--warn` | Modifier: the armed erase warning. **Apply alongside `.fd-set__note`**, not instead of it — it overrides the base note's `--fd-text-mid` ink to `--fd-text`, which is the gated pair against `--fd-danger-wash`. Carries `role="alert"`, and is rendered ONLY when armed: the panel is rebuilt on every render, so the button the learner pressed is gone and the generic focus restore has no equivalent to return to — the live region is the only thing that announces the arming. |
| `.fd-set__row` | The armed pair's two-button row. Wraps at phone width; both children stretch. The only place in the panel where two controls share a line. |

At the mobile breakpoint, primary actions, navigation controls, dialog close/back controls, and
icon-sized controls have a minimum 44px hit target. Icon-sized controls also have a 44px minimum
width; desktop dimensions remain unchanged.

⚠ `.fd-nudge` inverts by construction: it paints `--fd-text` as its background and `--fd-bg` as its
text, so it stays a high-contrast slab in both themes. Do not override its colours.

⚠ All three sheet variants share `.fd-sheet__head` / `.fd-sheet__body`; only the body contents
differ. `.fd-sheet__back` is rendered only for a protocol reached from the kit.

---

## State-class reference

| State | Applied to | Meaning |
|---|---|---|
| `.is-active` | `.fd-tab`, `.fd-seg__btn`, `.fd-choices__btn` | current tab / chosen segment / chosen chip |
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
| `.is-tool-expanded` | `.fd-main`, `.fd-reader--tool` | saved desktop tool workspace width |
| `.is-primary` | `.fd-due`, `.fd-resume`, `.fd-lastread` | this row is Today's primary action (kicker copy changes; the visual treatment comes from the `.fd-primary` wrapper) |
| `.is-secondary` | `.fd-continue` | a device-store row won the primary slot; the Continue card drops its gradient and top accent |

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
