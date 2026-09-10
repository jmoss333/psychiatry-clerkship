# Clinical Warm — design system

**Status:** tokens and gate landed 2026-09-10. Migration of call sites is incremental and ratcheted.
**Source of truth:** `13_Faculty_Resources/_automation/site_build/clinical-warm.css`
**Gate:** `bin/check_design_drift.py` (wired into `bin/verify.sh`, so the pre-push hook runs it)
**Class-level contract:** `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
**Contrast gate:** `tests/fd-contrast.test.mjs` (colour ratios live there, not here)

---

## 1. The one idea

This system already had a rule that worked, applied to exactly one dimension:

> `frontdoor.css` contains no raw colour of its own. Every colour is a `var(--fd-*)` declared
> in `clinical-warm.css`, which carries a light AND a dark value for each.

Measured on 2026-09-10, that rule held perfectly: **0 colour literals against 511 `var()`
references across 34 tokens.** Nothing comparable governed any other visual dimension, and the
result was measurable in the same file:

| Dimension | Distinct values in `frontdoor.css` | Tokens |
|---|---|---|
| Colour | 0 literals | 34 |
| Font size | 26 (incl. 9px, 10.5px, 11.5px, 12.5px, 13.5px, 14.5px, 15.5px, 16.5px, 17.5px) | 0 |
| Border radius | 16 (4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16px, 50%, 999px…) | 0 |
| Gap | 22 | 0 |
| Padding | 69 | 0 |
| Margin | 48 | 0 |
| Transition | 1 declaration total | 0 |

`spa_index.html` adds 37 more distinct font sizes in **rem**, where `frontdoor.css` uses **px** —
two typographic conventions in one product, 63 type sizes between them.

The whole design system is the same rule, extended: **a visual value that is not a token is a bug
the gate can see.** Colour proved the mechanism works here. This applies it to the rest.

---

## 2. Token layers

### 2.1 Colour — roles, not names

Two halves, both in `clinical-warm.css`, light block above dark (source order is load-bearing —
the blocks have identical specificity).

**The role rule, added 2026-09-10 and enforced by `check_design_drift.py` C1:**

| Role | Token | Bar | Use |
|---|---|---|---|
| Accent **fill / border** | `--fd-terracotta`, `--fd-teal`, `--fd-olive` | 3:1 non-text | `background`, `border-color`, dots, rules |
| Accent **ink** | `--fd-terracotta-dark`, `--fd-teal-deep`, `--fd-olive-deep` | 4.5:1 text | `color` |

`--fd-teal` / `--fd-teal-deep` already modelled this correctly. `--fd-terracotta` and `--fd-olive`
did not — they were painted as `color:` on eight small, bold, uppercase eyebrow/kicker labels, at
3.64–4.29:1. That single confusion of role was the source of **every** inherited light-palette
contrast exception. Fixing the roles, plus two minimal token darkenings, took `LIGHT_DEBT` in
`tests/fd-contrast.test.mjs` from eleven entries to **zero**.

`--fd-line` / `--fd-line-strong` remain below 3:1 in both themes and are *deliberately absent from
the contrast pair list* rather than allowlisted: a 1px hairline cannot reach 3:1 and stay a
hairline. `:focus-visible` (`--fd-focus`) carries the keyboard-accessibility weight instead.

**Namespace rule:** `--fd-text-*` is **colour** (`--fd-text`, `--fd-text-mid`, `--fd-text-dim`).
Font **size** is `--fd-font-*`. These were briefly one namespace and the drift checker immediately
flagged `--fd-text-dim` as "a dimension token with a dark value" — a collision worth keeping out of
the vocabulary permanently.

### 2.2 Type — 9 steps

Derived from the observed distribution: each step is the modal value of a real cluster, so adopting
it is a snap, not a redesign.

| Token | px | Absorbs | Use |
|---|---|---|---|
| `--fd-font-2xs` | 11 | 9, 10, 10.5, 11 | chips, `kbd`, uppercase micro-labels |
| `--fd-font-xs` | 12 | 11.5, 12 | section heads, metadata |
| `--fd-font-sm` | 13 | 12.5, 13 | dense UI, secondary controls |
| `--fd-font-md` | 14 | 13.5, 14, 14.5 | buttons, standard UI text |
| `--fd-font-base` | 15 | 15, 15.5 | body |
| `--fd-font-lg` | 17 | 16, 16.5, 17, 17.5 | lead paragraph, card title |
| `--fd-font-xl` | 21 | 18, 21, 22 | block title |
| `--fd-font-2xl` | 26 | 24, 26 | section title |
| `--fd-font-3xl` | 30 | 29, 30, 31 | page title (`.fd-h1`) |

**11px is the floor.** Nothing learner-facing goes below it. Thirteen declarations were below it
(`.fd-chip`, `.fd-kbd`, `.fd-attested`, `.fd-consistency__label`, the timeline and prev/next
kickers, the edition-card labels) and all thirteen now sit at `--fd-font-2xs`. `frontdoor.css` is
**at zero** sub-floor declarations; the ratchet holds it there.

### 2.2.1 Glyph sizes are not type

Three of the original sixteen "sub-floor" values were never text: a 9px check mark centred in a
16–20px dot, and the same shape in `.fd-railnav__dot` and `.fd-block__check`. Raising those to 11px
overflows the circle. The same is true at the other end — `.fd-logo` at 18px is a wordmark ψ inside
a 30px tile, and `.fd-themebtn` at 16px is an icon in a 34px button.

These are metrics of a **shape**, not of reading, so the text floor does not apply. They get their
own small family so the gate can tell the two cases apart instead of reporting eight legitimate
glyphs as accessibility debt:

`--fd-glyph-xs` 9px (marks in 16–20px circles) · `--fd-glyph-sm` 16px (icon buttons in 34–38px
boxes) · `--fd-glyph-md` 18px (header wordmark) · `--fd-glyph-lg` 22px (setup wordmark).

If a value belongs to a box you sized, it is a glyph. If it belongs to something someone reads, it
is type.

Line height is paired to the scale, not chosen per rule: `--fd-leading-tight` 1.2 (display),
`--fd-leading-snug` 1.35 (titles), `--fd-leading-normal` 1.55 (UI — the shell default),
`--fd-leading-relaxed` 1.7 (long-form).

### 2.3 Space — 10 steps

`--fd-space-1` 2px · `-2` 4 · `-3` 6 · `-4` 8 · `-5` 10 · `-6` 12 · `-7` 16 · `-8` 20 · `-9` 24 ·
`-10` 28.

2px granularity at the low end is deliberate: `gap:10px` is the single most common declaration in
`frontdoor.css` (22 uses), and a dense clinical UI genuinely uses 6/8/10/12. A 4px-only scale would
force a visible reflow of every card.

### 2.4 Radius — 7 steps

`--fd-radius-xs` 6 · `-sm` 8 · `-md` 10 (most common) · `-lg` 12 · `-xl` 16 · `-pill` 999px ·
`-circle` 50%.

### 2.5 Motion

`--fd-dur-fast` .12s (hover, border colour) · `--fd-dur-base` .28s (enter) · `--fd-dur-slow` .3s
(celebratory pop) · `--fd-ease-standard` `cubic-bezier(.2,.8,.2,1)` · `--fd-ease-spring`
`cubic-bezier(.34,1.56,.64,1)`.

The `@media (prefers-reduced-motion: reduce)` block at the foot of `frontdoor.css` zeroes these at
the property level. Do not hand-write a duration past it.

### 2.6 Targets and breakpoints

`--fd-target-min` 24px (WCAG 2.2 SC 2.5.8) · `--fd-target-touch` 44px (touch convention).

Breakpoints cannot be custom properties inside `@media`, so they are pinned in the stylesheet as
documentation and asserted by the gate: **sm 430 · md 640 · lg 1000**. Nine non-standard
breakpoints are currently pinned as debt (390 and 999 in `frontdoor.css`; 560, 620, 680, 760, 820,
821, 999 in `spa_index.html`). New ones fail the build.

**Theme-invariance:** every token in §2.2–2.6 is theme-invariant by contract and must never be
redeclared in a dark block. Spacing has no dark value; a "dark" one means colour was smuggled in.
Gate check C3.

---

## 3. The rules the gate enforces

`python3 bin/check_design_drift.py` — exit 0 clean, 1 on any finding. `--self-test` proves each
check can fail (21 assertions, per the house rule that a guard ships with a paired falsification).
`--update-baseline` re-pins the ratchets after a reviewed reduction.

| ID | Rule | Why it is a hard failure |
|---|---|---|
| **C1** | A fill token is never set as `color:` | Painting a 3:1 colour as text is where the entire light-palette contrast debt came from. Matches only the `color` property — `border-color`, `background-color`, `outline-color` and `-webkit-text-fill-color` are legitimate. |
| **C2** | `frontdoor.css` holds no colour literal | The property that already worked; now it cannot quietly stop working. `color-mix()` over tokens is a derivation, not a literal, and is allowed. |
| **C3** | No dimension token has a dark value | Catches colour smuggled into the dimension namespace. |
| **C4** | No colour token is declared, used, and left without a dark value | **The reason this file exists.** See §4. |
| **C6** | No `var(--token, <colour>)` whose token is defined nowhere | A fallback that always wins pins one theme's literal into both. See §4.1. Scans inline `style=""` too. |
| **C5** | `LIGHT_DEBT` in `fd-contrast.test.mjs` stays empty | Re-opening it is a palette-owner decision, recorded in `clinical-warm.css`, not a quiet edit. |
| **R1–R4** | Raw dimension counts, distinct type sizes, sub-floor type, non-standard breakpoints | Ratchets against `design_drift_baseline.json`. Down freely; up fails. |

Contrast **ratios** are deliberately *not* computed here. `tests/fd-contrast.test.mjs` owns them,
parses the shipped CSS rather than asserting literals, and fails when a pinned exception starts
*passing* so the allowlist cannot absorb a regression. Two sources of truth for one number is worse
than one.

---

## 4. C4, and why source-level tests could not see the defect

C4 reads the **built** pages (`_build/ms3/**`, `_build/res/**`), not the sources. That distinction
is the finding.

`common.py::polish_html` injects `<link href="/clinical-warm.css">` into any tool page that does
not already ship a dark block. So a tool's **source** declares a private light palette, uses it
consistently, and passes every source-level check — while the page that actually **ships** has
`--bg` and `--surface` flipped to dark by the injected stylesheet and its own `--ink`, `--muted`,
`--line` still at their near-black light values.

Measured live on `une-ms3-psychiatry.netlify.app`, 2026-09-10, in dark mode:

| Page | Text elements below WCAG AA | Worst ratio | What was invisible |
|---|---|---|---|
| `family-systems.html` | 56 | **1.06:1** | the entire scenario nav column |
| `one-patient-six-weeks.html` | 31 | **1.06:1** | every week heading (25.6px) |
| `rotation-curator.html` | 21 | **1.57:1** | every field label |
| `interview-circle.html` | 1 | — | `--shadow-card` |
| `screeners.html` | 1 | — | `--danger-bg` |

36 orphaned tokens, on two sites, in front of learners. Every unit test was green; both contrast
gates were green. They read the `--fd-*` palette, which was fine.

The remediation block at the foot of `clinical-warm.css` gives those page-private names dark values
centrally — the names are page-private but semantically identical across the pages that use them
(`--ink` is always primary body text, `--line` always a hairline), and their values are the dark
*role* equivalents already proven in the `--fd-*` block, so the two halves cannot drift.

**That block is remediation, not a pattern.** New pages use `--fd-*`. Adding a name to it is the
signal that a page has invented private colour vocabulary — which is what C4 now fails on.

### 4.1 The second finding, and why C4 could not see it either

Fixing §4 exposed a defect underneath it. `crisis_block.py` renders one inline-styled
`<section class="crisis-block">` into the 9 HTML surfaces per site that carry it, and styles that
section entirely through a `--cw-*` namespace with hardcoded light fallbacks —
`var(--cw-surface,#faf6f1)`, `var(--cw-text,#2c2622)` — so the block would "look right whether or
not the host tool links clinical-warm.css".

**`--cw-*` was defined nowhere.** Every one of those `var()` calls fell through to its light
literal in both themes: a cream island on a dark page, on 18 safety surfaces across the two sites.

C4 could not see it, for two reasons that are both worth keeping in mind:

- the block's colours are **inline `style=""` attributes**, not declarations in a `:root` block;
- an *undefined* token is invisible to a check that walks declared-and-used tokens.

It surfaced as a contrast failure only after §4 landed: the block's `<h2>` takes its colour from
the **host page's** `h2` rule, which does flip, while the block's ground does not — so the heading
"If someone is in crisis" rendered at **2.59:1** in dark mode on the crisis surface. Before §4 the
heading was legible on the cream and the defect read as merely ugly.

The fix is what the fallbacks were always written for: `--cw-*` is now declared in
`clinical-warm.css` with both halves, the literals stay as the no-stylesheet path, and the block's
heading takes `color:inherit` so no host page's `h2` accent can reach it again. **C6** is the
generalisation — a `var()` fallback that always wins is a light value pinned into a dark theme,
whatever namespace it belongs to.

---

## 5. Migration order

Ratcheted, not big-bang. Each step is independently shippable and lowers a number the gate watches.

| # | Step | Ends with |
|---|---|---|
| 1 | *(done 2026-09-10)* Token layer, role split, contrast fixes, C1–C5 + ratchets | `LIGHT_DEBT` empty; 36 dark orphans closed |
| 1b | *(done 2026-09-10)* `--cw-*` namespace + C6 (§4.1) | crisis block flips; 18 surfaces fixed |
| 2 | *(done 2026-09-10)* `frontdoor.css` type → `--fd-font-*` / `--fd-glyph-*` | **26 → 1** raw sizes; sub-floor **16 → 0**; 517 → 365 raw dimensions |
| 3 | Migrate `frontdoor.css` `border-radius` and `gap` | `raw_dimension_declarations` 517 → ~330 |
| 4 | Convert `spa_index.html`'s rem type to the same px scale | one type convention; 37 → 9 |
| 5 | Fold the 9 non-standard breakpoints into sm/md/lg | breakpoint debt → 0 |
| 6 | Migrate the five private-palette tool pages to `--fd-*` | delete §4's remediation block |

Do **2 before 3**: type is where the sub-11px accessibility debt lives, and it is the only ratchet
with a learner-visible floor. *(Done — what it cost: 88 of 153 declarations did not move at all,
59 moved by 0.5px, 4 by 1px, and exactly two moved further: `.fd-article__body h3` 18→21 and `h2`
24→26. Those two are a deliberate improvement — the article ladder was 16.5 / 18 / 24 / 29, ratios
1.09 / 1.33 / 1.21, and an h3 only 1.5px above its body text is not a heading. It is now
17 / 21 / 26 / 30 — 1.24 / 1.24 / 1.15.)*

Step 3 is now the cheap one: the same rule-walking migration applied to `border-radius` and `gap`,
with no judgement calls at the display end, because radius and gap have no reading ladder.

---

## 6. What was already right

Worth stating, because it is what made the rest diagnosable.

- **Colour discipline.** 0 literals, 511 `var()` references, one file carrying both themes.
- **The dark palette is better than the light one.** Derived by role rather than by formula, and it
  clears AA everywhere with no exceptions — measured live, the front door has **0** dark-mode
  contrast failures and **24** light-mode ones.
- **`.fd-check`'s target pattern.** A 22px visual mark with a transparent `::after` overlay grown to
  24px on a fine pointer and 44px on touch — the visual stays the design's, the target clears WCAG
  2.2. An automated audit flags it as a 22px target; that is a false positive, and the comment in
  `frontdoor.css` says so. Use it as the reference implementation.
- **One focus treatment for every interactive surface**, chosen deliberately because the hairlines
  cannot carry the contrast weight.
- **`fd-contrast.test.mjs` fails when debt starts passing.** A ratchet, not a snapshot. Rare, and
  the reason the debt could be paid off in one reviewed pass.
- **Reduced motion** is handled, though the source prototype shipped none.
