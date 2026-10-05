# Front door — class inventory

The complete contract between `frontdoor.css` and the markup that tasks 3–9 emit.

**Normative (2026-10-03):** this inventory and `frontdoor.css` are the source of truth for visual values; the hi-fi prototype is history (see the handoff README).

**Source of truth:** `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
(555 distinct `fd-*` selector names, 27 `is-*` state classes). Every class below has a rule in that file unless
marked *(no rule)*.

**One-thread redesign, Phase 1 (2026-10-04)** — shell and Today were rebuilt to
`docs/superpowers/specs/one-thread-handoff/README.md` (owner decisions D1–D6). Sections 1 and 3
below describe the new contract; the per-row notes name what each change replaced.

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
| `.fd-main` | `<main>` | `max-width:1200px`, page padding. Sibling of `#fdDockMount` and `#fdChromeMount` (which contains `.fd-header`), child of `.fd-shell`. At phone widths, its bottom padding and viewport scroll padding clear the one fixed dock, including the safe area. |

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
| `.fd-actionbar`, `.fd-actionbar__spacer` | ≥ 1000px and ≤ 640px | 641–999px only; on phones their DOM stays (the marked `data-fd-dock-source` twin that `fdPatchCompletion` relabels) but nothing renders from it |
| `.fd-dock` | above 640px | ≤ 640px on learner app screens, including enhanced guides |
| `#fdCaptureMount` | always (it is kept empty: `#fdCaptureMount:empty{display:none}`) | never — the floating launcher retired 2026-10-04; the header's `.fd-askbtn` and the dock's "＋ Ask" open the same dialog |
| `.fd-askbtn` ("＋ Ask a question") | ≤ 640px (the dock's "＋ Ask" takes over) | above 640px |
| `.fd-quicktools--pills`, `.fd-today__record` (phone copy of the learning-record link) | ≥ 1000px | below 1000px |
| `.fd-article__actions` | 641–999px (the fixed `.fd-actionbar` serves there) | ≥ 1000px, and ≤ 640px since 2026-10-04 — with the dock no longer mirroring the reader's primary, a phone's "Mark done" is this in-flow row at the end of the article |
| `.fd-article .fd-tip` (Reader's keyboard hint **only** — the wizard's `.fd-tip--setup` line is a different subtree and stays visible) | below 1000px | ≥ 1000px |
| `.fd-tabs` | ≤ 640px on every route | above 640px; still emitted inside `.fd-header` to preserve tablet/desktop behavior |
| `.fd-brand__name`, `.fd-searchbtn__long` | clipped (never `display:none`) ≤ 640px on **every** route, so the home button and the search opener keep their accessible names; `.fd-searchbtn__short` ("Search", `aria-hidden`) shows instead | above 640px |
| `.fd-thread__label` on a non-current week | ≤ 640px (clipped; the node's `aria-label` carries the week) | above 640px |
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
| `.fd-eyebrow` | `<span>` | 12px sentence-case terracotta label. No label in this stylesheet is uppercased or tracked out (2026-10-01): every label shows the sentence-case text its markup carries. |
| `.fd-sectionhead` | `<h2>` | 19px (`--fd-font-section`, 2026-10-04) sentence-case serif heading in mid ink ("Also today", "This week", "Quick tools", "Safety kit"); was 15px, and before 2026-10-01 a 12px tracked-caps label. |
| `.fd-tip` | `<p>` | 11.5px keyboard hint. |
| `.fd-logo` | `<span>` | 30px terracotta ψ tile. |
| `.fd-attested` | `<span>` | "✓ faculty-attested" pill. Reader + sheet item preview. |
| `.fd-src` | `<span>` | Monospace source-path chip. Not-found reader only ("Requested:") — the Reader's and sheet item preview's "Source:" chips were removed 2026-09-29; the ref rides on `.fd-article[data-ref]` instead. |
| `.fd-btn` | `<button>` | Base. **Always pair with a modifier** — `.fd-btn` alone has no colour. |
| `.fd-btn--primary` | + `.fd-btn` | Filled terracotta. |
| `.fd-btn--ghost` | + `.fd-btn` | Outlined. |
| `.fd-btn--accent` | + `.fd-btn` | Teal wash ("Set as my week"). |
| `.fd-chip` | `<span>` | Type chip. In the week rows and the Continue card it is emitted only for the exceptions (`fdKindChip`, `fd_today.js`): a tool, or a rights reference. A reading carries none (2026-10-01). The item sheet still labels a reading "read". |
| `.fd-chip.is-tool` | same element | Teal variant for tools. |
| `.fd-check` | `<button>` | 22px done-toggle circle. |
| `.fd-check.is-done` | same element | Filled success + visible ✓. |
| `.fd-check.is-done.is-just-done` | same element | **Both** state classes needed for the pop animation. |
| `.fd-row` | `<div>` | Item row. Flat since 2026-10-04 (one-thread): `padding:12px 2px`, a hairline above, no card, no entrance stagger (`fdRow` emits no `animation-delay`). |
| `.fd-row.is-compact` | same element | Strips card bg/shadow/padding for the Path detail pane. |
| `.fd-row__open` | `<button>` | Fills the row; wraps title + meta. |
| `.fd-row__title` | `<span>` | |
| `.fd-row__title.is-done` | same element | Dim + strike-through. |
| `.fd-row__title.is-done.is-just-done` | same element | **All three** classes needed to animate the strike. |
| `.fd-row__sub` | `<span>` | Inside `.fd-row__title`: the part of an item title from its ` — ` subtitle on (`fdRowTitleMarkup`, `fd_today.js`). At ≤640px it is clipped visually (not `display:none`), so the row shows "The Interview Room" instead of a mid-word ellipsis while its accessible name and `textContent` stay the full title (2026-10-03). |
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
        .fd-searchbtn__long  <span>         (the sentence: the accessible name at every width)
        .fd-searchbtn__short <span aria-hidden> ("Search"; shown ≤640px only)
      .fd-kbd              <span>⌘K</span>
    .fd-header__actions
      .fd-weekpill.fd-weekpill--identity <span>APP</span>   (APP only; a label, not a control)
      .fd-askbtn           <button data-capture-open>  ("＋ Ask a question"; hidden ≤640px)
      .fd-safetybtn        <button>
      .fd-settingsbtn      <button>          (compact settings-panel gear)
  .fd-tabs                 <nav>          (hidden ≤640px)
    .fd-tab                <button> ×4 standard / ×3 APP
      .fd-tab__label[data-compact]       (Care label only)
    .fd-tab.fd-tab--care   <button>      (far-right Patient care resources destination)
#fdDockMount               <div>          (sibling of #fdChromeMount and .fd-main)
  .fd-dock                <nav aria-label="Learning actions"> (≤640px only)
    .fd-dock__item        <button> ×5 standard / ×4 APP (.fd-dock--four)
```

| Class | Notes |
|---|---|
| `.fd-header` | `position:sticky; top:0; z-index:40`. |
| `.fd-header__bar` | The 1200px-capped flex row, `padding:12px 40px 0; gap:16px` (one-thread). At 640px and below it stays ONE row on every route: ψ tile (32px, name clipped), the search pill grown to fill (44 tall, "Search"), ✚ Safety (44) and the 44px Settings circle. The two-row phone grid and its reader-only exception are gone (2026-10-04). Sides are 20px below 1000px and 12px at ≤390px (where the search pill's own padding also drops to 12px), so the "Search" label stays a 44px target at 320px. `.fd-header` alone has no max-width. |
| `.fd-searchbtn` | The search opener (a `<button>`, not an input): `max-width:440px; margin-left:20px` beside the brand on the desktop bar, `margin-left:12px` below 1000px (the 20px offset was what left the clipped placeholder a 42px label at 641px), `flex:1; margin-left:0` at ≤640px. |
| `.fd-header__actions` | `margin-left:auto; gap:8px`: the APP identity chip when applicable, "＋ Ask a question", ✚ Safety, Settings. The week pill (`data-fd-change-week`) and the phone Care shortcut (`.fd-carebtn`) were removed 2026-10-04 (owner decision D4): the week is changed from Today's eyebrow, Path and first-run setup; Care is a tab above 640px and a fixed dock slot below. |
| `.fd-askbtn` | Ghost pill (min-height 36, 7×14, 1.5px `--fd-line-strong`, 13/600 mid) carrying `data-capture-open aria-haspopup="dialog" aria-expanded="false"` — the same action and state pair the dock's "＋ Ask" and the retired floating launcher used; the capture open/close handler updates it. Hidden ≤640px. |
| `.fd-weekpill` | Now only `.fd-weekpill--identity`, the APP chip: a `<span>`, no hover, no action. |
| `.fd-settingsbtn` | 36px icon-only header gear opening the settings panel (44px on phones); `aria-label` names the action. |
| `.fd-tab.is-active` | Bold + teal + teal underline. |
| `.fd-tab[data-fd-tab="everything"]` | Not a distinct `state.tab` value -- clicking it dispatches the same `data-fd-library-view="full"` transition as the in-Library "Everything (N pages) →" footer button (fd_library.js), landing on `tab:'library', libraryView:'full'`. `is-active` on Everything and on Essentials are mutually exclusive projections of that one `libraryView` field (fd_shell.js `fdTabs`). |
| `.fd-tab--care` | Uses `margin-left:auto` plus a quiet divider to keep Patient care resources visually separate at the far right on tablet and desktop. |
| `.fd-tab__label[data-compact]` | One resilient text node per responsive tab. Its full button `aria-label` remains accessible. |
| `.fd-tab--care` | Uses `margin-left:auto` plus a quiet divider to keep Patient care resources visually separate at the far right. At ≤640px the divider and auto margin disappear. |
| `.fd-tab__label[data-compact]` | One resilient text node per responsive tab. At ≤640px CSS paints the short `data-compact` value while the full button `aria-label` remains accessible; an older or briefly stale stylesheet still shows one full label instead of concatenating two labels. |

⚠ `.fd-tabs` is a **sibling** of `.fd-header__bar` inside `.fd-header`, not a child of it.
⚠ Rails stick to `top:106px`, which assumes the full header (bar + tabs) is present and sticky.

### Fixed dock — mounted phone contract (one-thread, 2026-10-04)

```
.fd-dock                 <nav aria-label="Learning actions">   (.fd-dock--four for APP)
  .fd-dock__item         <button data-fd-tab="today">   Today  (On shift for APP)
  .fd-dock__item         <button data-fd-tab="path">    Path   (absent for APP)
  .fd-dock__item         <button data-fd-tab="library"> Library
  .fd-dock__item         <button data-fd-tab="care" aria-label="Patient care resources"> Care
  .fd-dock__item         <button data-capture-open aria-haspopup="dialog" aria-expanded="false"> ＋ Ask
```

| Class | Notes |
|---|---|
| `.fd-dock` | `<nav aria-label="Learning actions">`; fixed phone grid under `#fdDockMount`: `repeat(5,minmax(0,1fr))`, `gap:4px`, `padding:6px 6px 8px` plus the safe-area inset, 66px tall, `--fd-surface-warm`, hairline top, `--fd-shadow-bar`. Hidden above 640px. |
| `.fd-dock--four` | APP modifier: four columns (On shift · Library · Care · ＋ Ask); APP has no Path. |
| `.fd-dock__item` | Every slot is a plain `<button>` with a FIXED meaning — the same four destinations as the tab row, in the same order, plus the capture opener. 13/600 mid, radius 10, 52px tall with two visible lines; every target is at least 44×44. `[aria-current="page"]` marks the current destination (teal wash, teal-deep, 700) — including while a reading or tool is open, when the ORIGIN tab stays current (focused learning is a mode, not a destination); `:disabled` dims an unavailable item. |
| ~~`.fd-dock__item--context`~~ | Retired 2026-10-04. The centre slot that mirrored the page's primary action through `data-fd-dock-forward` is gone, and so are `fdDockSource` / `fdForwardDockAction` and the `data-fd-dock-forward` action in fd_wire.js. `data-fd-dock-source` / `data-fd-dock-label` are still emitted by the surfaces that own a primary (and `fdPatchCompletion` still carries the label), but nothing renders from them. |
| ~~`.fd-dock__browse`, `.fd-dock__browsemenu`, `.fd-dock__browseitem`~~ | Retired 2026-10-04 with the `data-fd-dock-browse-go` action. The Library tab reaches Essentials/Everything; Search is reached from the header's `.fd-searchbtn`, which is inside the sticky `.fd-header` and so on screen at every scroll position and width. |

`fdRenderDock` (spa_index.html) renders from live state alone — it no longer reads `contentEl`
and derives no `dockAction`. It still refreshes after each base render, completion change and
settled resource load; reuses the same "＋ Ask" button object across refreshes, preserving its
open-dialog invoker and expanded state without taking focus from the dialog; restores focus to the
equivalent destination on a same-route refresh (never on navigation or under an overlay); marks
the origin tab current; and clears the dock on setup, faculty preview and non-app screens.
Enhanced guides retain this single dock while their inline Find, Print, Practice and contents
controls keep their existing behavior. Capture retains its existing dialog focus trap and returns
focus to the exact dock button that opened it.

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

Order, top to bottom (one-thread README §1; `fd_today.js` composes it, the shell hands the runtime
faces in on state — `nowHtml`, `alsoRows`, `purposeHtml`, `offlineHtml`, `statusHtml` (the bare
concept-count status line when nothing is due), `caseWeek`):

```
.fd-today
  .fd-pilot              <section aria-labelledby>   0. the active-testing LINE (D1): one 44px row
    .fd-pilot__title     <h2>                         "This learning site is in active testing"
    .fd-pilot__details   <details>  .fd-pilot__more <summary>Details</summary>
      .fd-pilot__copy    <div><p>                     the existing sentence, verbatim, folded
    .fd-pilot__button    <button.pgfb-b>              "Share feedback" (text link)
  .fd-today__place                                     1. place
    .fd-today__sub       <p>                          eyebrow "Week 2 of 6 · Thursday" [· exam countdown]
      .fd-today__changeweek <button data-fd-change-week>  "Change week" (only with a week set)
    .fd-today__h1        <h1>                         the week title (34px; "Today" without a week)
    .fd-today__theme     <p>                          the week theme (only with a week set)
  .fd-thread             <nav aria-label="Rotation weeks">   2. the projected-week thread
    .fd-thread__list     <ol>
      .fd-thread__step(.is-done)(.is-current) <li> ×N
        .fd-thread__node <button data-fd-tab="path" data-fd-view-week="N" [aria-current="step"] aria-label>
          .fd-thread__mark  <span aria-hidden>        ✓ when done, else N
          .fd-thread__label <span aria-hidden>        the week title (clipped on phones unless current)
  .fd-today__cols
    .fd-today__main
      .fd-now.fd-now--{week|ahead|setup}               3. THE Now card -- the lead card is primary
        .fd-continue <button> | .fd-setupcta <button>
      .fd-primary.fd-now.fd-now--{resume|block|read|due}   ...or a device-store face won (state.nowHtml)
        .fd-due | .fd-resume | .fd-lastread | .fd-block     (fd_due.js / fd_block.js, chrome stripped)
      .fd-offline        <section>                    the offline receipt, right after the Now card
      .fd-sectionhead.fd-also <h2>                    4. "Also today" (always rendered)
      .fd-alsolist                                     (only when a row exists)
        .fd-also__row[data-fd-mark][data-fd-count][style=--mark-share] ×N   the faces that did not win
          .fd-due / .fd-study-planner|.fd-block / .fd-resume / .fd-lastread / .fd-continue.is-secondary / .fd-capture
      .fd-purpose        <details>                    5. the preparation chooser (shell-owned open state)
        .fd-prepare                                    the Prepare-for-tomorrow line + ghost button (sites shipping the tool)
      .fd-today__exam    <div>                        exam-date nudge: exam path only, until a date is stored
        .fd-today__examtext <p> / .fd-today__examcta <button data-fd-settings>
      .fd-listhead                                     6. "This week"
        .fd-sectionhead / .fd-listhead__count          "N of M done" at the right
      .fd-list
        .fd-row ×N                                     flat rows (see Shared)
      .fd-unit           <section aria-labelledby>    7. "On the unit this week" (only where the case tool ships)
        .fd-unit__line   <span aria-hidden>            the vertical thread line
        .fd-unit__body
          .fd-unit__kicker / .fd-unit__title <h2> / .fd-unit__task <p> / .fd-unit__handoff <p>
          .fd-unit__open <a.fd-btn.fd-btn--ghost href="?tool=one-patient-six-weeks.html&week=N">
      .fd-quicktools--pills                            (below 1000px only) after the week
        .fd-quicktool ×5
      .fd-today__record                                (below 1000px only)
        .fd-progresscard <button data-fd-progress>
    .fd-rail                                           8. (≥1000px only)
      .fd-sectionhead "Safety kit"
      .fd-railkit                                      one panel, 3px --fd-danger top rule
        .fd-kitcard    <button> ×5
          .fd-kitcard__title / .fd-kitcard__sub
      .fd-sectionhead "Quick tools"
      .fd-quicktool  <button> ×5                       flat rows
        .fd-quicktool__dot / .fd-quicktool__label
      .fd-progresscard <button data-fd-progress>       "Learning activity & review →"
```

Removed from Today (2026-10-04): `.fd-consistency` (D2 — it now opens Learning activity & review,
`fdProgressMarkup`), `.fd-pick` (the daily pick; the Library reaches every library-only read), the
`.fd-quicktools--pills` `order:-1` hoist, the `<!--fd-lead-end-->` splice marker, and the
`.fd-pilot__eyebrow` badge.

| Class | Notes |
|---|---|
| `.fd-now` | THE shell of the Now card, one per Today: `padding:22px 24px 24px`, radius 12, `--fd-surface`, hairline, `border-top:3px solid --fd-teal`, `--fd-shadow-card`. `.fd-now--{kind}` names `fdTodayPrimary`'s winner. The face inside gives up its own border/background/shadow/padding under this ancestor and maps onto four parts: kicker (13/700 teal-deep: `.fd-continue__kicker`, `.fd-setupcta__kicker`, `.fd-due__kicker`, `.fd-lastread__kicker`, the `.fd-resume` `.fd-sectionhead`, `.fd-block__kicker`), title (26px serif: `.fd-continue__title`, `.fd-setupcta__title`, `.fd-due__label`, `.fd-lastread__title`, the resume link's first span), ONE filled teal button (`.fd-continue__cta`, `.fd-setupcta__cta`, `.fd-due__action`, `.fd-lastread__action`, the resume link's last span, `.fd-block .fd-btn--primary`) and a 13px dim meta line. When the whole face is already the control (`.fd-continue`, `.fd-setupcta`, `.fd-due`, `.fd-lastread`, `.fd-resume__link`) the button is a `<span>`: a button inside a button is invalid markup. 21px title and a full-width button ≤640px. |
| `.fd-primary` | Still marks the one device-store face that won; since 2026-10-04 it always travels with `.fd-now` (`class="fd-primary fd-now fd-now--due"`), and carries no chrome of its own. Absent when the lead card (`.fd-continue` / `.fd-setupcta`) is the primary. |
| `.fd-thread`, `.fd-thread__list`, `.fd-thread__step`, `.fd-thread__node`, `.fd-thread__mark`, `.fd-thread__label` | The projected-week thread (`fdThread`): one equal grid column per actual projected week; a 28px mark per week joined by a 2px connector at `top:13px` from centre to centre (teal after a done week, `--fd-line-strong` otherwise). Done = teal fill + ✓, computed from real week-scoped completion (`fdProgressForWeek`), never from the week being past; current = 2px teal ring, 4px `--fd-teal-wash` halo, teal-deep number, `aria-current="step"`; future = control-line ring, dim number. Each node previews that week on Path through `data-fd-tab="path" data-fd-view-week="N"` (the completed Continue card's existing pair) and never sets the week. Labels 12/1.3, 14ch max; only the current label shows ≤640px. Renders only on a valid projected path. |
| `.fd-today__place`, `.fd-today__sub`, `.fd-today__changeweek`, `.fd-today__h1`, `.fd-today__theme` | The place block. Eyebrow 13/600 mid with the "Change week" text link (teal-deep 700, reopens week setup via the retired pill's `data-fd-change-week` action, so Back and focus restore are unchanged); H1 Source Serif 4 700 at `--fd-font-4xl` (34) / 1.15 / −.01em, `--fd-font-3xl` ≤640px; theme line 15px mid. |
| `.fd-pilot`, `.fd-pilot__title`, `.fd-pilot__details`, `.fd-pilot__more`, `.fd-pilot__copy`, `.fd-pilot__button` | The active-testing line (D1): one row, min-height 44, `--fd-callout` ground, hairline, radius 8, 13px. Title 700 · "Details" disclosure (teal-deep) revealing `.fd-pilot__copy` as a full-width row · "Share feedback" as a text link (`.pgfb-b`, `data-fb-context="Today landing page"`). The sentence is folded, never hidden by a breakpoint. |
| `.fd-also`, `.fd-alsolist`, `.fd-also__row` | "Also today": `.fd-also` is the `<h2>` modifier (margin-top 32); `.fd-alsolist` holds the rows; each `.fd-also__row` is a flat row (`padding:13px 2px`, hairline above) whose `::before` draws the 22px status mark from `data-fd-mark` — `due` (2px olive ring with `data-fd-count`), `progress` (2px teal ring, conic fill from the row's inline `--mark-share`), `ring` (not started), `plus` ("＋" for saved questions). Inside, the faces (`.fd-due`, `.fd-resume`, `.fd-lastread`, `.fd-capture`, `.fd-block`/`.fd-study-planner`, `.fd-continue.is-secondary`) lose their card chrome: title 15/600, meta 13 dim (`order:9`), trailing link 14/700 teal-deep with a 44px target. Row order is the shell's (block · due · resume · read), then the week's own Continue (partly filled mark), then saved questions last. |
| `.fd-listhead__count` | "N of M done" at the right of the week heading (replaces `.fd-listhead__theme`; the theme moved under the H1). |
| `.fd-unit`, `.fd-unit__line`, `.fd-unit__body`, `.fd-unit__kicker`, `.fd-unit__title`, `.fd-unit__task`, `.fd-unit__handoff`, `.fd-unit__open` | "On the unit this week" (`fdUnitWeek` over `fdWeekCaseStep`): a `28px | 1fr` grid with a vertical teal thread line, kicker "On the unit this week · Case Journeys, week N", the case week's title (serif 21), the source tool's compact governance badge, `learnerTask` (15/1.6 mid), the "Carry it to rounds:" callout (3px teal left rule on `--fd-callout`) and a ghost `<a>` "Open case week N" to `?tool=one-patient-six-weeks.html&week=N` — a real link, since a ref-only action drops the query. Every string is verbatim from `longitudinal_case.json`, which `build_deploy.py` inlines read-only as `FD_CASE_ARC` (verified needle, same mechanism as `RETIRED_QB_IDS`) so the section exists at first render and Today's DOM never churns after boot; renders only where the tool ships and the week exists. |
| `.fd-today__record` | Wrapper for the phone's copy of the `.fd-progresscard` link, under the pills; hidden ≥1000px where the rail carries it. |
| `.fd-continue__cta`, `.fd-setupcta__cta` | The Now card's filled button on the two lead faces, as `aria-hidden` spans (the card is the control; the kicker and title are its name). "Continue →" / "Preview week →" / "Review week →" / "Set rotation week". A demoted Continue (`.is-secondary`) has none and arrows its title instead. |
| `.fd-continue__kicker.is-complete` | Switches teal → terracotta when the week is finished. |
| `.fd-continue__segs` | The week's progress as one `.fd-continue__seg` per activity, `.is-done` filled teal over the `--fd-ring-track` ground from the left (2026-10-01). Replaces the retired `.fd-ring` percentage ring. Decorative (`aria-hidden`): `.fd-continue__count` is the text. On a secondary Continue it still renders; the title drops to 17px. |
| `.fd-railkit` | The rail's Safety kit as ONE panel (2026-10-01): warm surface, hairline border, a 4px `--fd-danger` rule on the left. Its `.fd-kitcard` rows have no border or ground of their own -- hairline dividers between them, `--fd-danger-wash` on hover -- so `.fd-kitcard__sub` ink is gated against `--fd-surface-warm`. The sheet's `.fd-kitrow` is unchanged. |
| `.fd-quicktool` (label) | `fdQuickToolLabel` shows the title before its ` — ` subtitle ("The Interview Room"), and the full title rides on the button as `title` (2026-10-01). |
| `.fd-list` | Flat rows separated by `.fd-row`'s own hairline (gap 0 since 2026-10-04). |
| `.fd-consistency` | Seven-day activity strip (2026-09-02, not in the prototype). Derived at render time by `fdActivityDays` from the timestamps every tool already stores; nothing new is persisted. Since 2026-10-04 (owner decision D2) it renders at the top of **Learning activity & review** (`fdProgressMarkup`), not on Today. |
| `.fd-prepare`, `.fd-prepare__title`, `.fd-prepare__copy` | Optional preparation invitation, emitted only for the resolved known tool item — INSIDE the preparation chooser (`fdTodayPurpose`) since 2026-10-04: a hairline-topped line (title in bold, the 5/15-minute sentence, the compact governance badge) plus one `.fd-btn--ghost[data-fd-open]`. No primary rule, durable state or nested scrolling. |
| `.fd-offline` | One in-flow cache receipt after Today's actual primary card, or immediately after the APP's marked primary resource inside its starting-route resources or selected task's Prepare links. The Care entry stays in flow at ≤640px; the five-item dock is unchanged. State classes `.is-checking`, `.is-ready`, `.is-update`, and `.is-not-ready` change border shape/color and surface wash while visible text carries the meaning. It uses the existing warm palette tokens in light and dark themes; all controls meet `--fd-target-touch`. |
| `.fd-today__exam` | Today's exam-date nudge, after the primary action (and the offline availability receipt when present), before the week list. Rendered only on the path that ends in an exam and only until a parseable date is stored (`fdExamDatePrompt`, `fd_state.js`). The date has exactly one home, the settings panel's Pacing field (`.fd-set__date`, `fd_sheet.js`) — this nudge carries no field of its own. `.fd-today__examcta` reopens Settings via the SAME `data-fd-settings` action the gear exposes: a second *trigger* for one action, not a second action. It does not disappear on its own — closing the field's `change` handler only sets `baseStale` (`fd_wire.js`); Today's base render, this nudge included, is rebuilt the next time `absorbStaleBase` finds that flag set, which is exactly when the panel closes (`data-fd-close-sheet` always touches `sheet`, a base-triggering settlement). That render destroys the CTA along with the rest of the stale Today markup, so `restoreInvoker` finds it disconnected and falls back to `equivalentControl` — any live control sharing the same action attribute and value, i.e. the gear — needing no bespoke focus-restore code of its own. (2026-09-26 — previously this duplicated the panel's own `<input type=date>` inline and deliberately avoided `data-fd-settings` for this same reason, before this settle-on-close path was confirmed to cover it.) |
| `.fd-offline__status`, `.fd-offline__detail`, `.fd-offline__scope`, `.fd-offline__checked` | Detailed state, reason, current route, and current-session verification timestamp. `Checked just now` is emitted only for a validated active-worker response. |
| `.fd-offline__inventory` | Counts present and missing eligible reading, tool, shell/navigation, and search-data files. Device-only Reading place/Capture and connection-required media, live services, external links, and email delivery are always separate lines. Only this response subtree is replaced after a cache reply; focused controls are siblings outside it. |
| `.fd-offline__refresh-status` | Stable live text for update-check success/failure or the offline explanation. The existing worker Refresh/Later prompt remains the sole reload decision. |

Task 5 composes device-local activity around the pure Today renderer and reuses the Reader for
internal Progress. These are part of the same shipped class contract:

| Class | Element / notes |
|---|---|
| `.fd-due` | Due-review button; contains `.fd-due__label`, `.fd-due__breakdown`, and `.fd-due__action`. |
| `.fd-due-group` | Wrapper `fdDueRow` emits ONLY when practice-bank (QB#) cards are due beside Daily Review ones (2026-09-24): the `.fd-due` button, then `.fd-due-group__bank`. Daily Review cannot serve QB# cards, so the row keeps its route to `review.html` and the bank's share gets its own control. Without both kinds due the row is the bare `.fd-due` button as before — bank-only dues route that button to `question-bank-practice.html`. Carries no `.fd-due`, so a due-row count still finds one. |
| `.fd-due-group__bank` | Secondary `<button data-fd-open="question-bank-practice.html">` "Practice bank · N due for review →", a SIBLING of `.fd-due` (never nested: a button may not contain one). No `data-fd-dock-source` — it is never Today's primary. N is the shell's QB# servability count, pinned equal to the bank's own "Due for review (N)" by `tests/fd-due-bank-parity.test.mjs`. |
| `.fd-resume` | Session-resume section; `.fd-resume__link` is the query-preserving link. |
| `.fd-resume__block` | Progress line inside `.fd-resume__link` when the capsule came from a timed block ("Block · 1 of 2 done"); the link then carries `resume=1&block=1&n[&cat]` (Phase 2, 2026-09-16). |
| `.fd-block` | Timed block card (2026-09-02, not in the prototype), spliced in with the due row and resume card by `fdTodayLive`. Planner face: `.fd-block__head` (`__kicker`, `__chips` › `__chip(.is-sel)`, `__hint`), `.fd-block__steps` › `__step` (`__dot.is-review/.is-page/.is-qb`, `__title`, `__min`), `.fd-block__actions` (a `.fd-btn--primary` carrying `data-block-start`), or `.fd-block__empty`. Live face adds `.is-live` on the card, `__count`, `__check` on each `__step(.is-done)`, and `__doneline`. Click attributes are `data-block-minutes` / `-start` / `-continue` / `-end`, owned by the shell's auxiliary click handler — deliberately outside the `data-fd-*` controller namespace. Rendered by `fdBlockCard` (`frontdoor/fd_block.js`). |
| ~~`.fd-primary__why`~~ | Retired 2026-10-01 (owner-directed design pass) with `fdTodayWhy`: the page's order already says what the line explained. |
| `.fd-lastread` | "You were reading" row (`fdLastReadRow`, `frontdoor/fd_due.js`): the last opened item when it is an undone read from this week and not already the Continue target. Shares the runtime-row rule with `.fd-due`. Contains `.fd-lastread__kicker` (primary only), `.fd-lastread__title`, `.fd-lastread__action`. |
| `.fd-due__kicker` | "Clear what's due" line, present only when the due row is the primary (`.fd-due.is-primary`). |
| `.fd-freshset` | Ghost `.fd-btn` sibling of a completed-week `.fd-continue` that is primary: "Practice a fresh set →", opens the question bank. |
| ~~`.fd-capture-launch`, `.fd-capture-launch--global`~~ | Retired 2026-10-04. The floating launcher is replaced by the header's standing `.fd-askbtn` ("＋ Ask a question") and the dock's "＋ Ask", both `data-capture-open`. `#fdCaptureMount` stays in the DOM, empty, hidden by `:empty`. |
| `.fd-capture` | Compact Today/On shift follow-up for the oldest open unrouted question only. Contains `.fd-capture__head` with a section heading, `.fd-capture__question` with escaped learner text, `.fd-capture__new` as the **View all N** dialog opener, and `.fd-capture__purpose` with the device-local privacy boundary. If no unrouted question remains, this card is omitted even while routed items remain in Capture. The full inbox, route buttons, Copy questions, Delete, Erase all, and explicit email selection live in the portalled `.cap-sheet` styled by the shell's inline CSS (`.cap-list__row`, `.cap-route`, `.cap-next__done`). The global and dock Capture launchers still open it. |
| `.fd-progresscard` | Internal-Progress entry; contains `.fd-progresscard__title` and `.fd-progresscard__meta`. |
| `.fd-progress-reader` | Reader modifier for the internal Progress surface. |

### Capture email review overlay

The full inbox places an unchecked `.cap-email-select` checkbox beside each open question; its
`#capEmailSelect` button remains disabled until a learner selects at least one. The separate
`.cap-email-backdrop` and `.cap-email-sheet` are portalled under `<body>` above `.cap-sheet`.
While the review dialog is open, the Capture sheet is `inert` and `aria-hidden`; Escape and Tab
are owned by the email dialog's own trap. Closing it clears the checkboxes and all in-memory
recipient, affirmation, digest, and URI state, then focuses the first previously selected
question checkbox in Capture. If that checkbox is unavailable, focus falls back to a still-enabled
invoker or the editor.

| Class | Notes |
|---|---|
| `.cap-email-head`, `.cap-email-count`, `.cap-email-digest` | Heading/close row, selected count, and wrapped, escaped preview. The digest preview uses `textContent`, never learner text in `innerHTML`. |
| `.cap-email-label`, `.cap-email-address`, `.cap-email-hint` | Input and adjacent immutable `@mainehealth.org` text. The suffix has `id="capEmailSuffix"`; the input's `aria-describedby` names the suffix and the validation hint, including when invalid. `input[aria-invalid="true"]` is the inline error state; the hint also states mailbox existence cannot be verified. |
| `.cap-email-affirm`, `.cap-email-status` | Required no-PHI checkbox and live handoff/failure message. Disabled Open draft uses the shared `.cap-btn` style. |
| `.cap-email-fallback` | Revealed after clipboard absence/rejection or a URI too long to open. `[hidden]` wins over the layout rule; its read-only textarea keeps the complete selectable text. |

The email overlay selectors have `cap-*` names and add no `fd-*` or `is-*` classes to the totals above.

⚠ **`.fd-ring` is retired** (2026-10-01): Today's Continue card shows `.fd-continue__segs`
instead. `--fd-ring-pct` survives only on Path's `.fd-timeline__number`, which still needs it set
inline -- it defaults to `0%`, so a ring rendered without it silently shows an empty track.

⚠ **`.fd-quicktool` is the same element in both layouts.** Inside `.fd-quicktools--pills` it becomes
a rounded pill (`.fd-quicktools--pills .fd-quicktool`); inside `.fd-rail` it stays a full-width row.
Emit the identical inner markup for both; only the container class differs.

⚠ **`.fd-pilot` is ONE row at every width** (D1, 2026-10-04): title · Details · Share feedback, the
sentence folded behind the disclosure. Nothing about it is breakpoint-hidden any more; the 390px
`display:none` rule the old banner needed to stay above the fold is gone with it.

⚠ **At 640px and narrower the pill row is ONE sideways-scrolling row** (2026-09-26), placed AFTER the
week since 2026-10-04 (the `order:-1` hoist is gone: the Now card is first after the heading at every
width). Do not let it wrap again: wrapped, five long tool names took 164–207px. The row's padding keeps
a focused pill's outline inside the scroller, which clips on both axes. `tests/fd-today.test.mjs` pins
the rule and `front-door.spec.js` "One Thing First E/E2" measures the primary against the dock top.

⚠ `.fd-today__cols` is the flex wrapper that puts `.fd-today__main` and `.fd-rail` side by side.
Omitting it collapses the rail underneath.

---

## 3a. Patient care resources

```
.fd-care-page
  .fd-care-page__head
    .fd-care-page__source
    h1 / .fd-care-page__intro
    .fd-care-page__provenance
      strong / span
  .fd-care-page__notice               role="note"
    strong / span
  .fd-care-navigator
    .fd-care-navigator__head
      h2 / p
    .fd-care-navigator__choices
      .fd-care-navigator__choice <button> ×6
        .fd-care-navigator__check
        span
      .fd-care-navigator__choice.is-selected [aria-pressed="true"] (is-selected has no rule)
    .fd-visually-hidden role="status" aria-live="polite"
    .fd-care-navigator__result
      .fd-care-navigator__result-head
        h3 / p
      .fd-care-navigator__link <a> primary
        .fd-care-navigator__kicker / __link-title / __link-description
      .fd-care-navigator__alternatives
        .fd-care-navigator__link <a> ×0–2
      .fd-care-navigator__clear <button>
  .fd-care-pack                     + .is-print-ready only with 1–3 choices and governed crisis HTML
    .fd-care-pack__head
      h2 / p
      .fd-care-pack__included           valid governed crisis content only
      .fd-care-pack__crisis-failure      role="alert" in the header when crisis content is missing
    .fd-care-builder <aside>             external launch only; excluded from print
      div / p / .fd-care-builder__link <a>
    .fd-care-pack__workbench
      .fd-care-pack__picker
        .fd-care-pack__choices
          .fd-care-pack__choice <button> ×5
            .fd-care-pack__check
          .fd-care-pack__choice.is-selected [aria-pressed="true"]
        .fd-care-pack__picker-foot
          #fd-care-pack-limit / .fd-care-pack__clear <button>
      .fd-care-pack__sheet
        .fd-care-pack__sheet-head
        .fd-care-pack__resources
          .fd-care-pack__resource ×0–3
            .fd-care-pack__resource-copy
            .fd-care-pack__scan
              .fd-care-pack__qr <svg> | .fd-care-pack__qr-fallback
        .fd-care-pack__empty
        details.fd-care-pack__crisis
          summary / .crisis-block
        .fd-care-pack__provenance
    .fd-care-pack__actions
      p / .fd-care-pack__copy <button> / .fd-care-pack__print <button>
      .fd-care-pack__copy-status [role="status"]
  .fd-care-page__groups
    .fd-care-group ×2                 support / education
      .fd-care-group__head
        h2 / p
      .fd-care-group__list
        .fd-careitem ×2 or ×3
          .fd-carelink <a>            fixed external URL; new tab
            .fd-carelink__mark
            .fd-carelink__copy
              .fd-carelink__title / .fd-carelink__description
          .fd-careitem__actions
            .fd-careitem__qr / .fd-careitem__pack <button>

.fd-care-sharebackdrop
.fd-care-share [role="dialog"]
  .fd-care-share__head
    p / h2 / .fd-care-share__close <button>
  .fd-care-share__body
    p / .fd-care-share__scan
      .fd-care-share__qr or .fd-care-share__qr-fallback
    .fd-care-share__url <a> / .fd-care-share__limit
    .fd-care-share__actions
      .fd-care-share__copy / .fd-care-share__pack <button>
    .fd-care-share__status [role="status"] / .fd-care-share__privacy
```

| Class | Notes |
|---|---|
| `.fd-care-page` | Top-level, shared learner destination rendered by `fd_care.js`; it is navigation, not a completion or attestation item. |
| `.fd-care-page__provenance` | Names the creator and the several-year, personally curated ReConnect database origin without implying that the Clerkship attests the linked apps. |
| `.fd-care-page__notice` | Current-information and no-PHI boundary. The page never appends a query, route state, search text, or patient context to an external URL. |
| `.fd-care-navigator` | Fixed-choice task map between the notice and full resource groups. The groups remain visible as siblings below it; no navigator class participates in completion or attestation. |
| `.fd-care-navigator__choices` | Two columns at wider widths, one column at ≤640px; each native choice button has a 44px minimum target and wrapping text. |
| `.fd-care-navigator__choice.is-selected` | Only the active choice owns `.is-selected` (no rule) and `aria-pressed="true"`; the attribute paints the visible checkmark and inset rule so selection is not color-only. Other choices keep `aria-pressed="false"`. |
| `.fd-care-navigator__result` | Appears only with a selection and has a labeled heading; primary and alternative links use canonical external destinations. It does not own the live announcement because this subtree is replaced after every choice. |
| `.vh-live` (`#careNavigatorStatus`) | Persistent, initially empty shell status beside `#routeStatus`, outside replaceable `#content`. The shell updates its polite, atomic text after a valid Care choice and clears it when the choice or Care surface ends. It keeps the same DOM node through Care re-renders. |
| `.fd-care-navigator__alternatives` | Zero to two secondary links; shares the responsive one-column phone layout. |
| `.fd-care-navigator__clear` | Native button returns to the unselected task map without changing the resource groups. |
| `.fd-care-builder` / `.fd-care-builder__link` | Fixed context-free ReConnect launcher before the local picker, outside the handout sheet. Copy is linked by `aria-describedby`; new-tab link has `noopener noreferrer`, 44px minimum height, wrapping and visible focus. Flex stacks at ≤640px; `@media print` hides it in every state. No selection, QR, storage or analytics hook. |
| `.fd-care-pack__workbench` | Transient two-column builder: a flat choice list beside a paper-like preview, stacking to one column at ≤640px. It accepts only canonical `careResources` records and has no patient fields, route state, storage, analytics, or network request. |
| `.fd-care-pack__choice.is-selected` | The active choice pairs `.is-selected` with `aria-pressed="true"`; its visible check and inset rule keep selection non-color-only. A fourth unselected choice disables until one of the three is removed. |
| `.fd-care-share__qr` / `.fd-care-share__qr-fallback` | The drawer renders the local SVG in the QR wrapper; the fallback replaces it with text when local QR generation is unavailable. Neither branch makes a network request. |
| `.fd-care-share__limit` | Visible explanation tied to a disabled drawer toggle when all three handout slots are already used. |
| `.fd-care-pack.is-print-ready` | Added only when one to three canonical resources and the governed crisis block are both present. Every handout-only print selector, including shell hiding, requires this class. Native Print on an invalid pack retains the ordinary Care page and hides the empty or crisis-free preview sheet. |
| `.fd-care-pack__sheet` | The paper preview. It becomes the isolated printable handout only in `.is-print-ready` state; invalid native Print hides the sheet. A ready handout contains one to three exact canonical links with locally generated QR SVGs. |
| `.fd-care-pack__crisis` | Owns the exact build-injected crisis block derived from `crisis_resources.json`. It is collapsed on screen and forced fully visible on a ready handout. Missing governed HTML renders `.fd-care-pack__crisis-failure` in the ordinary Care header and disables Print; the renderer never invents contacts. |
| `.fd-care-pack__actions` | States that choices stay on screen only. “Copy selected links” is enabled with one to three valid resources and copies only curated titles plus exact canonical URLs. Print additionally requires the governed crisis block. |
| `.fd-care-page__groups` | Two-column shelf at larger widths and one column at ≤640px. The support shelf holds Resource Finder and Recovery Meeting Calendar; education holds the patient library, Podcast Navigator, and Relational Bibliotherapy book shelf. |
| `.fd-care-entry` | In-flow Care route button near the top of APP On shift at ≤640px, hidden on wider screens where the Care tab is visible. **Today no longer emits it** (2026-09-26): the header `.fd-carebtn` (2026-09-24) is Today's phone route to Care and the Care tab its wide route, so the row was a duplicate that pushed the primary toward the dock. `fd-today.test.mjs` asserts Today's markup carries none; APP's must stay (`app-pathway`). The fixed phone dock remains five items. |
| `.fd-carelink` | Static external anchor with an explicit new-tab mark and visible title/description. Its sibling actions never wrap patient context into the destination. |
| `.fd-careitem__actions` | Touch-sized “Show QR” and handout-toggle buttons for each canonical resource. The handout control shares the transient `carePackIds` state and disables an unselected fourth item at the limit. |
| `.fd-care-share` | Transient accessible QR dialog, rendered in the overlay mount and bottom-docked at ≤640px. It shows one locally generated QR, description, exact canonical URL, Copy link, and the shared handout toggle; it adds no patient fields, storage, analytics, or network request. |
| `.fd-care-sharebackdrop` | Separate fixed backdrop. Click closes the Quick Share dialog; Escape and the close button use the same controller action. |

---

## 4. Path

```
.fd-path
  .fd-path__h1
  .fd-path__intro
  nav.fd-pathroute
    svg.fd-pathroute__curve[aria-hidden="true"]
      path.fd-pathroute__connector
    .fd-pathroute__weeks.fd-pathroute__weeks--{4|6}  [role="tablist"]
      button.fd-timeline__row  [role="tab"] ×4 or ×6
        .fd-timeline__gutter
          .fd-dot
          .fd-timeline__line
        .fd-timeline__body
          .fd-timeline__n
          .fd-timeline__number          (ring via inline --fd-ring-pct)
          .fd-timeline__title
          .fd-timeline__theme
          .fd-timeline__status        (current and/or complete only)
        .fd-timeline__count
  .fd-path__cols
    .fd-detail
      .fd-detail__head
        .fd-eyebrow / .fd-detail__here
      .fd-detail__h2
      .fd-detail__practice
        .fd-feedback                   (data-driven paths only, not the six-week path)
          button.fd-btn.fd-btn--ghost.fd-feedback__open   ("Log what they said"; no note open)
          p.fd-feedback__status[role="status"]            (after a save or delete, that week only)
          label.fd-feedback__label + textarea.fd-feedback__text#fdFeedbackText   (note open)
          p.fd-feedback__hint#fdFeedbackHint
          p.fd-feedback__error[role="alert"]              (the device refused the save)
          .fd-feedback__hold[role="alert"]                (possible patient detail: Edit / confirm)
          .fd-feedback__acts                              (Cancel / Save note, or Edit / confirm)
          p.fd-feedback__h + ul.fd-feedback__list
            li.fd-feedback__item ×N
              .fd-feedback__day / .fd-feedback__note / button.fd-feedback__delete
      .fd-detail__list
        .fd-row.is-compact ×N
      .fd-btn.fd-btn--accent           ("Set as my week")
```

| Class | Notes |
|---|---|
| `.fd-pathroute__connector` | One decorative, neutral stroke, generated by `fdPathConnectorD(n)` so it passes through every stop centre; `vector-effect:non-scaling-stroke`. It never gains selected, current, complete, or progress state. |
| `.fd-pathroute__weeks--4` / `--6` | Matches the audience-projected canonical week count. |
| `.fd-timeline__row.is-sel` | Selected week: `--fd-selected` background, double-ring number, `aria-selected="true"`, and the only `tabindex="0"`. |
| `.fd-timeline__number` | The stop's numeral inside a per-week progress ring: a conic-gradient driven by the inline `--fd-ring-pct` (that week's saved progress only, never week order). No `stroke-dasharray` anywhere on Path. |
| `.fd-dot.is-done` | Filled success; on the desktop route it is the check badge at the node's lower right, and other dots are hidden there. |
| `.fd-dot.is-current` | Phone rail only; the desktop route states current with the flag. |
| `.fd-timeline__status` | Visible non-colour state text: Current, Complete, or Complete · Current. On `[aria-current=step]` it is the terracotta flag above the node at ≥1000px, inline below that. |
| `.fd-timeline__theme` | Canonical curriculum theme; shown on every stop. |
| `.fd-detail__here` | "you are here" pill. |
| `.fd-feedback` | The learner's private supervisor-feedback notes for the viewed week (`cw_feedback_v1`, device only). Never progress, never exported, never an assessment. |
| `.fd-feedback__text` | Type size is `max(var(--fd-font-base),1rem)`: iOS Safari zooms the page into any field under 16px when it takes focus. |
| `.fd-feedback__hold` | Same fail-closed interstitial as the ward capture: the shell's `capRisky` decides, and an unwired screen holds every note. |
| `.fd-feedback__delete` | Keeps the 44px touch target in both directions; its accessible name carries the note's date. |

⚠ The open note is visit-only (`feedbackDraft`): leaving Path, opening a resource or choosing another
week closes it. Its text is kept on the controller as it is typed, so a repaint never empties the field.

⚠ The route is a roving tab set. Arrow Left/Right/Up/Down wraps, Home/End jump to the audience's
real endpoints, and the rebuilt selected control regains focus with `preventScroll`. Keep
`data-fd-view-week`, `role="tab"`, `aria-selected`, `aria-controls`, and the detail panel's
`aria-labelledby` paired when changing markup.

⚠ Selected, current, and completed are separate states. `is-sel` follows transient `viewWeek`;
`aria-current="step"`, `.is-current`, and “Current” follow the actual `week`; `.is-done` and
“Complete” follow the saved activity result. The neutral connector never derives from any of them.

⚠ `--fd-path-band`, `--fd-path-y-low` and `--fd-path-y-high` on `.fd-pathroute` duplicate `FD_PATH_BAND` /
`FD_PATH_Y_LOW` / `FD_PATH_Y_HIGH` in fd_path.js — change both (pinned by `fd-path-route.test.mjs`). Row
centres must stay at `(i+0.5)/n`: keep `.fd-pathroute__weeks` at `gap:0` and space rows with margin,
never gap. Rows are never translated; only `.fd-timeline__number` moves, inside the fixed band, so
every stop's labels share one baseline (`front-door.spec.js` measures both).
Hover and `is-sel` washes are `linear-gradient(transparent var(--fd-path-band), …)` so they start
below the road — an opaque row background would hide the road across that column and make it
appear to change with selection. The current flag sits above the node only at ≥1000px; below
the lg breakpoint it drops into the label flow (a nowrap "Complete · Current" covered the next
stop at 660px). `@media (forced-colors:active)` outlines every node in `CanvasText` on `Canvas`
and marks `is-sel` with `Highlight` — the ring is a background image and vanishes there.

⚠ At `max-width:640px` the SVG curve is hidden and `.fd-pathroute__weeks::before` becomes the
vertical rail. The theme must remain inside its node—do not move it exclusively into the detail
panel.

⚠ `.fd-timeline__row:last-child .fd-timeline__line` is `display:none`. **Always emit
`.fd-timeline__line` on every row**, including the last — do not conditionally omit it. The
legacy selector handles the final connector and the phone route retains the complete row shape.

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
  nav.fd-kit__index                      (scrollable section index)
    .fd-kit__index-track
      button.fd-kit__index-item[data-fd-kit-section] ×N
        .fd-kit__index-count
  .fd-kit__review
    details / summary                    (native review explanation)
  .fd-kit__layout
    .fd-kit__readings
      details.fd-kit__group ×N
        summary
        .fd-kit__reading <button> ×N
          .fd-kit__title / .fd-kit__pending / .fd-kit__summary / .fd-kit__minutes
    aside.fd-kit__tools                  (tool preview rail)
      details.fd-kit__group.fd-kit__tool-group
        summary
        .fd-kit__tool-switcher
          .fd-kit__tool-tabs [role=tablist]
            .fd-kit__tool-tab <button role=tab> ×N
          .fd-kit__tool-preview [role=tabpanel]
            h3 / p / governanceBadge(compact) / .fd-btn[data-fd-open]
      .fd-kit__teaching                  (external teaching companion)
        h3
        .fd-teachinglink <a>
          .fd-teachinglink__title / .fd-teachinglink__description
        .fd-teachinglink__note
```

The selected `.fd-kit__tool-preview` includes the shared compact governance badge after its title/hint and before its single launch button. Its status follows the resolved item, including pending preparation content; tool selection remains transient.

At 1000px and wider, `.fd-kit__layout` is a 3:1 readings/tool-rail grid. Below 1000px the
readings and tools stack in document order: **readings first, at every width** (2026-09-26). The tool
rail used to move above the readings at 640px and narrower; once the aside carried the shared preview
pane and the teaching companion it stood about 496px tall, and at 390x844 the first reading began below
the dock. Do not reintroduce `order:-1` on `.fd-kit__tools`; `front-door.spec.js` asserts the first
reading is whole above the dock at 390px. At 640px and narrower `.fd-kit__tool-tabs` is still a
horizontally scrolling row above its shared preview pane. Arrow
keys move the selected tool tab; only the preview pane's button opens a tool. The section picker and
both group types remain native `select`/`details` controls at every width.

| Class | Notes |
|---|---|
| `.fd-library__grid` | Multi-column flow, `columns:280px` (2026-09-19; was an `auto-fill, minmax(280px,1fr)` grid whose rows were as tall as their tallest cell). Sections balance by height; `.fd-col{break-inside:avoid}` keeps each whole. |
| `.fd-library__shortcut` | Wraps "· press / to filter" inside `.fd-library__count`; hidden at ≤640px as a whole fragment. |
| `.fd-col__name` | Column heading: uppercase terracotta with a bottom rule. |
| `.fd-collink__dot.is-tool` | Teal dot; default is olive (a read). |
| `.fd-collink__hint` | One line under a tool's label, from `curriculum.libraryHints` (2026-09-16). The row wraps (`flex-wrap`) and the hint takes the full width, indented past the dot. Omitted from the markup, not emptied, when an item has none — every read row renders exactly as before. |
| `.fd-kit__teaching` | Keeps the Family Therapy Seminar Companion with teaching tools rather than patient-facing care links. Its fixed external link opens in a new tab, names that behavior with `.fd-visually-hidden` text, and preserves its local-browser/no-identifiers boundary in the note. |

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
      .fd-reading-place                    (read only; empty until a verified write or failure)
      .fd-reading-place__top <button hidden> (read only; shown after a valid restoration)
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
  .fd-actionbar__spacer                   (641–999px)
.fd-actionbar                             (641–999px, fixed; hidden source on phones)
  .fd-btn.fd-btn--ghost
  .fd-btn.fd-btn--primary
    <span>label</span>
```

| Class | Notes |
|---|---|
| `.fd-reader.is-nav-next` / `.is-nav-prev` | Slide-in direction. **Same element as `.fd-reader`.** |
| `.fd-reader--tool.is-tool-expanded` | Tool-only wide workspace state. The same state is mirrored on `.fd-main`; neither class is applied to reads. |
| `html:has(.fd-reader--tool)` | `scroll-padding-top` = the sticky header's height (68px ≤640px, 112px above) while a tool is open. The frame is content-height, so the page is its only scroll surface and the tool cannot see the header: without this, focus or `scrollIntoView` inside the frame parks a control under the bar, where a tap lands on ✚ Safety (2026-10-04). In-page readers keep their own `scroll-margin-top`. |
| `.fd-reader__toolbar` | Tool-only row containing Back and the stable `Expand tool` toggle. The toggle is hidden below 1000px while its saved preference remains intact. |
| `.fd-article__body` | Base long-form markdown typography: `--fd-font-lg` (17px), 1.72 line-height, 62ch measure. Enhanced field guides use the scoped type treatment in §6a. |
| `.fd-reading-place` | Under `.fd-article` after Source, before actions. Ordinary readings only; initially empty. Runtime writes the exact device-only success copy after a successful store write, or the failure copy when storage is disallowed or fails. No live region or status badge. Tools, Progress, not-found, setup, faculty preview, and enhanced guides do not retain it. |
| `.fd-reading-place__top` | Sibling button following the status, initially `hidden`. Runtime reveals it only for a valid restored heading; activation clears this page's record, scrolls and focuses its H1, then hides it again. `[hidden]` explicitly wins over the button's display rule. |
| `.fd-compass` | Six-Week Compass, build-injected into `.fd-article__body` on the six-week Welcome (`welcome_compass.py`). Children: `.fd-compass__title`, `.fd-compass__weeks` (`<ol>`, markerless card grid), `.fd-compass__week` (`<li>` card), `.fd-compass__heading` (`<h3>`), `.fd-compass__kicker` (the `Week N` span inside that heading), `.fd-compass__link` *(no rule)*. Every rule but the root is written as a two-class selector so it outranks the `.fd-article__body` element rules it sits inside. Links reserve bottom scroll margin for the phone dock and tablet action bar, so native Tab focus stays unobscured. |
| `.fd-visually-hidden` | Accessible completion suffix on done rail rows; never use `aria-pressed` for navigation. |
| `.fd-prevnext__btn.is-next` | Right-aligns the next button's contents. |
| `.fd-article__actions` | Desktop-only primary/ghost pair. **Always emit it** (no `desk` JS branch). At 641–999px the fixed action bar supplies the same actions. At phone widths the dock forwards to the hidden action bar's primary, while the reader header retains Back. |
| `.fd-tip` (Reader instance) | The `←`/`→`/`1`/`2`/`3` keyboard hint. Hidden below 1000px via the descendant selector `.fd-article .fd-tip` — **do not** hide the bare `.fd-tip` class, which would also blank the wizard's `.fd-tip--setup` line (§2). |

⚠ **`.fd-actionbar .fd-btn--primary` requires its label wrapped in a bare `<span>`**
(`.fd-actionbar .fd-btn--primary span` supplies the ellipsis). A text-only child overflows on
narrow screens.

⚠ `.fd-actionbar` is `position:fixed` at tablet widths — it must be a **sibling of `.fd-reader`, not inside it**, or
the article's stacking context traps it. `.fd-actionbar__spacer` goes **inside** `.fd-reader` as the
last child to reserve tablet scroll room. At phone widths both are hidden, but the marked primary
button stays in the DOM for dock forwarding; the reader's Back and tool toolbar remain visible.

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
          h2 | p.fd-guide-lead            (authored H2, or a promoted bold-lead paragraph)
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
| `.fd-guide-lead` | The authored paragraph that opens a section on a page with no H2: its first element is a bold label followed by a separator (`—`, `:`) or ending in `.`/`:`, or standing alone. It stays a `<p>` with its inline `<strong>` untouched; the class adds only the landing scroll margin. The section's navigation label is the bold text without trailing punctuation. A page qualifies only with no H2 anywhere (an embedded component's own heading keeps it out), at least four leads and 500 words — the rotation week pages stay plain. **Trap:** such a page keeps its reading place (`[data-fd-reading-status]`, Start at top), unlike an H2 guide, and the reading-place anchor is the lead's `<strong>`, not the paragraph, so editing the prose keeps a saved place. |
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

## 7. APP On shift workspace

```
.fd-app
  .fd-app__intro
    .fd-app__eyebrow / h1 / .fd-app__boundary
  .fd-app__bridge-picker [role=group]
    .fd-app__bridge-choice <button> ×2   (+ .is-active)
  .fd-app__bridge
    .fd-app__bridge-head / .fd-app__bridge-copy
    .fd-app__resources (+ .fd-app__resources--with-offline when this route owns the primary)
      .fd-app__resource <button> ×8
      .fd-offline                      immediately after the marked first resource when no task owns primary
    .fd-app__reflection
      .fd-app__reflection-actions [role=group]
        .fd-app__reflection-choice <button> ×3
  .fd-app__work
    .fd-app__tasks
      .fd-app__task <article> ×3          (+ .is-active)
        .fd-app__task-head <button>
        .fd-app__stages
          .fd-app__stage <section> ×3
            .fd-app__step-link <button> ×N
            .fd-offline                immediately after the marked first Prepare link in the selected task
            .fd-app__practice-open <button> (rehearsal stage, when a pack resolves)
            .fd-app__practice-error <p role=alert> (when a pack cannot resolve)
    .fd-app__practice-host (sibling of .fd-app__tasks, when practice is open)
      .fd-app-practice <section> (+ .is-revealing only until the first classification)
        .fd-app-practice__head
          .fd-app-practice__close <button>
        .fd-app-practice__snapshot
        .fd-app-practice__action <button> (reveal, before change)
        .fd-app-practice__change (after reveal)
          .fd-app-practice__before / .fd-app-practice__seam / .fd-app-practice__now
        .fd-app-practice__row ×3 (after reveal)
          .fd-app-practice__choices [role=group] (named by its statement; three fixed-category buttons)
        .fd-app-practice__summary / .fd-app-practice__questions [role=group] (after all three classifications)
        .fd-app-practice__recap (after a fixed question is selected)
        .fd-app-practice__reset <button> (after reveal)
        .fd-app-practice__privacy
```

| Class | Notes |
|---|---|
| `.fd-app__bridge-choice` | Optional starting route, never an identity claim or competence tier. `.is-active` and `aria-pressed` move together. |
| `.fd-app__resource` | Canonical resource title and governance badge from the joined index; the APP data stores only refs. Missing refs render `.fd-app__error`, never a shortened sequence. |
| `.fd-app__resources--with-offline` | Makes the first starting-route button and its immediately following readiness receipt span the resource grid so they remain vertically adjacent on desktop and phone. Other resource buttons keep their existing order. |
| `.fd-app__reflection` | Visit-only formative choice. The controller may repaint it but only `appBridge` belongs to `FD_KEYS`; reflection and activity state never survive reload. |
| `.fd-app__task` | Shared work-preparation card. Each card visibly retains all three stages: prepare independently, rehearse here, arrange observation. |
| `.fd-app__step-link` | Opens an existing governed resource. It is not a completion or supervisor-approval control. |
| `.fd-app__practice-open`, `.fd-app__practice-error` | The button opens the mapped pack; an invalid pack produces a scoped alert while preparation resources stay available. The open button has a touch-sized target and visible keyboard focus. |
| `.fd-app__practice-host`, `.fd-app-practice` | The visit-only player follows the task grid. It uses one enclosing surface, with no saved response, route, score, or separate card stack. |
| `.fd-app-practice__change`, `.fd-app-practice__before`, `.fd-app-practice__seam`, `.fd-app-practice__now` | The revealed before/now pair sits side by side at wide widths and stacks at 640px and below. `.is-revealing` animates the seam on reveal and clears after the first classification; reduced motion removes animation while both text panels remain. |
| `.fd-app-practice__choices`, `.fd-app-practice__questions` | Fixed button groups use `aria-pressed`, readable labels, touch-sized targets, and visible focus. Each classification group is named by its statement's stable ID. The question group appears only after all three statements have a category. |
| `.fd-app-practice__head`, `.fd-app-practice__snapshot`, `.fd-app-practice__row` | Heading, starting facts, and statement rows carry the sequence in plain text. The changed detail is absent until reveal. |
| `.fd-app-practice__action`, `.fd-app-practice__close`, `.fd-app-practice__reset` | Reveal, close, and start-again are buttons. Reset clears the visit-only practice session. |
| `.fd-app-practice__summary`, `.fd-app-practice__recap`, `.fd-app-practice__privacy` | Text and counts report progress without a grade. The privacy sentence says no score, saved response, or transmission. |

⚠ The observation stage is explanatory only. It never collects a supervisor name, feedback,
patient information, or an attestation, and it never turns a website action into clinical authority.

---

## 8. Search overlay

```
.fd-search                          (fixed, full-screen scrim + flex host; click = close)
  .fd-searchpanel                   (stopPropagation here)
    .fd-searchpanel__head
      <svg>
      .fd-searchpanel__input   <input>
      .fd-searchpanel__esc     <button>esc</button>
    .fd-searchpanel__browse
      .fd-btn[data-fd-tab="library"] <button>Browse the Library</button> (standard mode only)
    .fd-searchpanel__body
      .fd-result <button|a> ×N
        .fd-result__dot         + .is-tool | .is-safety | .is-care
        .fd-result__title
        .fd-result__meta
      .fd-searchpanel__empty          (no-results state, replaces the results)
    .fd-searchpanel__foot
```

| Class | Notes |
|---|---|
| `.fd-search` | Carries the scrim **and** the centring — it is not a separate backdrop element (unlike the sheet). |
| `.fd-searchpanel__browse` | Standard MS3/resident Search offers an explicit Library route above results. APP already has The Essentials in dock slot 2, so this row is absent. |
| `.fd-searchpanel__body` | `max-height:46vh` + scroll. The scroll container. |
| `.fd-result__dot` | Default olive (read); `.is-tool` teal; `.is-safety` danger; `.is-care` olive-deep. |
| `.fd-result.is-care` | Static external ReConnect result rendered as an anchor. `data-care-resource` pairs the visible first result with the controller's Enter shortcut, so keyboard activation clicks that exact fixed anchor. Curated search terms are matched locally; the learner's query is never added to the URL or sent to ReConnect. Explicit safety results still sort first. |

⚠ The search overlay uses **one** element for scrim + layout. The sheet uses **two**
(`.fd-sheetbackdrop` + `.fd-sheet`). Do not mirror one pattern onto the other.

---

## 9. Side sheet and nudge

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
| `.is-active` | `.fd-tab`, `.fd-seg__btn`, `.fd-choices__btn`, `.fd-app__bridge-choice`, `.fd-app__task`, `.fd-app__reflection-choice` | current tab / chosen segment / chosen chip / APP route, task, or private reflection |
| `.is-sel` | `.fd-weektile`, `.fd-timeline__row` | chosen / viewed |
| `.is-current` | `.fd-dot`, `.fd-railnav__row` | "you are here" |
| `.is-done` | `.fd-check`, `.fd-dot`, `.fd-row__title`, `.fd-railnav__dot`, `.fd-railnav__title` | completed |
| `.is-just-done` | `.fd-check`, `.fd-row__title` | **with `.is-done`** — fires the one-shot animation |
| `.is-complete` | `.fd-continue__kicker` | whole week finished |
| `.is-compact` | `.fd-row` | Path detail density |
| `.is-tool` | `.fd-chip`, `.fd-collink__dot`, `.fd-result__dot` | item is a tool, not a read |
| `.is-safety` | `.fd-result__dot` | search hit is a safety protocol |
| `.is-care` | `.fd-result`, `.fd-result__dot` | search hit is an external ReConnect patient-care resource |
| `.is-next` | `.fd-prevnext__btn` | right-aligned variant |
| `.is-nav-next` / `.is-nav-prev` | `.fd-reader` | slide direction |
| `.is-tool-expanded` | `.fd-main`, `.fd-reader--tool` | saved desktop tool workspace width |
| `.is-primary` | `.fd-due`, `.fd-resume`, `.fd-lastread` | this row is Today's primary action (kicker copy changes; the visual treatment comes from the `.fd-primary` wrapper) |
| `.is-secondary` | `.fd-continue` | a device-store row won the primary slot; the Continue card drops its gradient and top accent |
| `.is-print-ready` | `.fd-care-pack` | one to three valid resources and the governed crisis block are present; only this state activates isolated handout print styling |
| `.is-checking` / `.is-ready` / `.is-update` / `.is-not-ready` | `.fd-offline` | Worker check pending / all current-route eligible files verified / verified current copy with a waiting update / verification failed or files missing. Never color-only: compact and detailed text name each state. |

## Keyframes

Namespaced `fd*` because this stylesheet shares a document with ~21 tools that ship their own
animations: `fdFadeUp`, `fdSheetIn`, `fdBackdropIn`, `fdPopIn`, `fdCheckPop`, `fdStrikeDraw`,
`fdSlideR`, `fdSlideL` (`fdRingPulse` retired with `.fd-ring`, 2026-10-01). All are disabled under `prefers-reduced-motion: reduce`.

## Display face

Headings use **Source Serif 4** (2026-10-01), self-hosted at `fonts/source-serif-4-latin-opsz-wght600-700.woff2`
beside `frontdoor.css` and precached by the service worker; its SIL OFL 1.1 licence ships as
`fonts/source-serif-4-OFL.txt`. The face covers weights **600–700 only**, so it is named only by rules
that set a weight of 600+ or by bold-by-default `h1`–`h3` rules, always with Georgia behind it.
A lighter rule pointed at it would render semibold. `tests/fd-display-font.test.mjs` pins all of this.

## Colour

Markup must not carry colour. Every colour is a `var(--fd-*)` token declared in
`13_Faculty_Resources/_automation/site_build/clinical-warm.css` (34 tokens, each with a light and a
dark value). `tests/fd-tokens.test.mjs` fails the build on any raw hex in `frontdoor.css`, and
`tests/fd-contrast.test.mjs` enforces WCAG AA across both palettes.

**Red means safety (2026-10-01).** `frontdoor.css` paints no `--fd-terracotta*` at all, and
`--fd-danger*` only on safety and crisis surfaces (Safety button, Safety kit, crisis blocks and their
failure notices), form errors and destructive controls. Teal is "act / you are here" (logo, primary
buttons, the dock's current destination, selected and current markers) and, since D6 (2026-10-04),
also DONE: `--fd-success` carries the same value as `--fd-teal` in both themes, so the palette has
three status roles — teal act/progress/done, olive review, red safety; olive is review/recall and small
labels; status notices are neutral (`.fd-offline.is-not-ready` reads `--fd-callout` with a
`--fd-text-dim` rule). `tests/fd-tokens.test.mjs` fails on a new terracotta or an unlisted red.

The two custom properties the markup owns are `--fd-ring-pct` on Path's `.fd-timeline__number` and
`--mark-share` on Today's `.fd-also__row[data-fd-mark="progress"]` (the conic fill of an in-progress
mark; deliberately outside the `--fd-*` namespace `tests/fd-tokens.test.mjs` pins to clinical-warm.css).

**Focus (2026-10-04):** one ring everywhere — `outline:3px solid var(--fd-focus); outline-offset:2px`
on `.fd-shell :focus-visible` and on the portalled overlays. **Motion:** 120ms colour/border
transitions on controls, 180ms-class disclosures, no entrance animation on Today; under
`prefers-reduced-motion: reduce` nothing animates or transitions.

Offline availability: `.fd-offline__open` wraps its label and cache status for small screens and large text; its status describes the current route cache, not clinical or shift readiness. The family-conversation result uses the existing `.fd-btn.fd-btn--ghost` internal Playbook control, only when the active audience index contains `family_playbook.md`.

## Optional session purpose chooser (2026-10-01)

`fd-purpose`, `fd-purpose__summary`, `fd-purpose__choices`, `fd-purpose__note`, `fd-purpose__reason` style the optional disclosure. Since 2026-10-04 (one-thread README §1.5) it sits AFTER the "Also today" rows and BEFORE the week list at every primary kind — including when an unfinished block is the primary, which used to pull it above the Now card; it never changes the primary. Spec values: margin-top 24, `padding:4px 0 18px`, hairline below; summary 44 tall at 15/600; choices are 44px pills (1.5px `--fd-line-strong`, 14/600; pressed = teal border on teal wash, teal-deep 700). The Prepare-for-tomorrow invitation (`.fd-prepare`) renders inside it. It is a quiet hairline-ruled disclosure, not a card, and its summary draws the shared rotating chevron in place of the browser's ▶ marker. `.fd-today__exam` is likewise a quiet line with a link-styled `.fd-today__examcta`, not a bordered card (2026-10-01). The disclosure starts open on each fresh page load and remains learner-collapsible. Buttons reuse `fd-btn` tokens and pressed state uses an attribute selector. Purpose choices and open state are in-memory only; standard primary/due-review/planner rules remain unchanged.

### Optional study planning (phase one, 2026-10-03)

`.fd-study-planner` is a native details disclosure around an **unstarted** Today
study plan. Its summary (`data-today-planner-toggle`) names the 5/10/20-minute
choices; the existing `.fd-block` is its child. It starts closed on reload, keeps
its state through same-session navigation and rerenders, and the preparation
chooser's Study action opens it before focusing the selected duration. Live
blocks never enter the disclosure. The expanded purpose chooser stays before
timed study; the primary picker and due-review routes are unchanged.


### Shared Library navigation (2026-10-03)

The desktop header has one **Library** destination, selected for both Essentials and
Everything. The phone disclosure uses the same **Library** label and retains Search. Its summary
marks the current Library destination, including the Everything view; the center
Essential shortcut is not incorrectly marked current for Everything.
`.fd-library__views` is a wrapping local view switch above either Library heading;
its two `.fd-btn` controls have 44px minimum height and `aria-pressed` selection,
with the existing teal action/location tokens. It replaces the distant Everything
footer and full-view return button. Existing Library routes remain unchanged.
Same-route dock refreshes retain the disclosure and focused choice; route changes
close it. Escape closes the disclosure and returns focus to its summary.
