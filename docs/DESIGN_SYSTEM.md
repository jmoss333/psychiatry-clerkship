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
check can fail (38 assertions, per the house rule that a guard ships with a paired falsification).
`--update-baseline` re-pins the ratchets after a reviewed reduction.

| ID | Rule | Why it is a hard failure |
|---|---|---|
| **C1** | A fill token is never set as `color:` | Painting a 3:1 colour as text is where the entire light-palette contrast debt came from. Matches only the `color` property — `border-color`, `background-color`, `outline-color` and `-webkit-text-fill-color` are legitimate. |
| **C2** | `frontdoor.css` holds no colour literal | The property that already worked; now it cannot quietly stop working. `color-mix()` over tokens is a derivation, not a literal, and is allowed. |
| **C3** | No dimension token has a dark value | Catches colour smuggled into the dimension namespace. |
| **C4** | No colour token is declared, used, and left without a dark value | **The reason this file exists.** See §4. |
| **C6** | No `var(--token, <colour>)` whose token is defined nowhere | A fallback that always wins pins one theme's literal into both. See §4.1. Scans inline `style=""` too. |
| **C5** | `LIGHT_DEBT` in `fd-contrast.test.mjs` stays empty | Re-opening it is a palette-owner decision, recorded in `clinical-warm.css`, not a quiet edit. |
| **C8** | No scoped rule redeclares a themed token with a one-theme value | A `.practice-panel { --panel-wash-a:#eef5f3 }` outranks `[data-theme="dark"]` on specificity, so the dark half never lands. 42 elements at **1.23:1** shipped this way. Runs on the **built** pages, because `common.py` rewrites `#fff` at build time and a source-level version reports 15 phantoms. Selector matching is by *compound containment*, not last-class — `.tab.on` must not pair with `.seg button.impaired.on`; both shapes are pinned in `--self-test`. |
| **C9** | §2.2 and §2.2.1's tables match `clinical-warm.css` row for row | The step names are counter-intuitive by design — `--fd-font-md` is **14px** and `--fd-font-lg` is **17px**, not the middle of the range. A migration is audited by comparing each old value against the token it now points at, and this doc is where those get looked up. One stale row makes a correct migration read as though every declaration jumped a full step: a false alarm convincing enough to cost hours and to tempt someone into "fixing" a healthy file. So the doc is pinned to the stylesheet rather than trusted. |
| **R1–R4** | Raw dimension counts, distinct type sizes, sub-floor type, non-standard breakpoints | Ratchets against `design_drift_baseline.json`. Down freely; up fails. |

**R3's blind spot, now closed.** The sub-floor check originally compared `px` values only, so
`font-size:.62rem` — 9.9px, below the 11px floor — read as clean. It now normalises `rem` at
16px before comparing. That single line moved `spa_index.html` from a claimed 0 sub-floor sizes
to a real 22, all of which step 4 then paid off.

Contrast **ratios** are deliberately *not* computed here. `tests/fd-contrast.test.mjs` owns them,
parses the shipped CSS rather than asserting literals, and fails when a pinned exception starts
*passing* so the allowlist cannot absorb a regression. Two sources of truth for one number is worse
than one.

### 3.1 The one thing no file-reading check can do

Every colour guard above reads a **file**. Twice on 2026-09-10 a defect shipped that all of them
were structurally unable to see, because the wrong colour only exists once a browser has resolved
the cascade — §4 (a private palette whose ground flipped and whose ink did not) and §4.1 (an
injected block styled through a namespace defined nowhere). Both were found by hand, in a browser,
against production.

`tests/smoke/contrast.spec.js` is that probe, kept. It loads four routes — one representative per
surface class — in **both themes**, walks every element carrying its own text, resolves the nearest
opaque background behind it, and fails on anything below AA. It runs in two places:

- the **nav-ms3 / nav-res** projects, against a local build, on every PR;
- the **daily production canary**, against the live Netlify sites.

The canary's scope is pinned by `tests/canary-scope.test.mjs`, precisely so a monitor cannot
inherit a suite by accident. That file's round-trip budget now carries a note that its metric
counts call sites and therefore under-reports a spec that loops.

### 3.2 `?theme-audit` — the lamp for the class the probe still cannot reach

`contrast.spec.js` measures **text**. It is silent on the borders, hairlines, outlines and empty
grounds that carry no text, and those were the residue after §4, §4.1 and C8: five practice-family
hairlines that stayed at their light values in dark mode, invisible to every gate and to a
contrast probe alike, because a 1px line has no ratio to fail.

Append `?theme-audit` to any page on either site — production, deploy preview, or a local build —
and a small panel appears bottom-right listing **every painted colour that does not change when
the theme flips**.

How it works, and why each choice matters:

| Choice | Reason |
|---|---|
| Reads computed style, not CSS | It measures what the browser painted, which is the whole point of §3.1. |
| Flips `documentElement.dataset.theme`, forces reflow, re-reads, restores | Two measurements of the same element, one variable changed. Nothing is left mutated. |
| `color` only where the element owns text; `border-*-color` / `outline-color` only where width > 0 **and** `outlineStyle !== 'none'` | `outline-width` computes to a real number even when the outline is `none`, which otherwise reports every unfocused button as having a frozen black outline. |
| Groups by `label + property + value` with counts | 42 identical findings are one line, not 42. |
| `&contrast` adds a WCAG AA pass | Same maths as the spec, on demand, without a test runner. |
| The panel itself is all literal colours, and is the one element the scan skips | It must render identically in both themes — it is the instrument, not the specimen. |
| Loads at `load` + 400ms | The SPA reader paints asynchronously; an earlier read measures an empty shell. |

The loader is a **6-line inline guard** injected by `common.py::apply_dark_mode` that does nothing
unless the query string is present — verified inert: `auditRan:false, panel:false,
themeAuditRequests:0`. `rotation-curator.html` is in `NO_NETWORK_PAGES` and gets no loader at all,
because that page's offline contract is hard-enforced at build time and a `createElement('script')`
violates it.

It began as a **lamp, not a gate** — and then it found three more defects that way (§3.3), so the
measurement is now a gate too. `theme_scan.js` holds the walk; `theme_audit.js` renders it for a
person; `tests/smoke/frozen-colour.spec.js` runs it over everything. **One implementation on
purpose**: if the gate re-measured, the two would drift, and the drift would be silent.

### 3.3 The ratchet — the lamp, run over everything, every push

Three consecutive PRs shipped a fix whose defect was found by a person running a probe, never by a
gate:

| Found | Defect | Measured |
|---|---|---|
| #616 | `--on-brand` had no **light** half, so the build's own `color:#fff` → `var(--on-brand)` rewrite resolved to nothing and filled buttons fell back to body ink | **2.56:1**, light |
| #616 | five practice-family hairlines stayed at their light values in dark mode | no ratio to fail |
| #617 | white on the brand fill across 21 shipped sources | **4.36:1** |

Every file-reading gate was green for all three, and could not have been otherwise. C4 walks
*declared-and-used* tokens; these were an **undeclared** token, a **raw literal**, and a token whose
value was simply **wrong**. §3.1's probe gets closer — it measures rendered text — but it walks four
routes and scores only text, so borders and every unvisited page are outside it by construction.

`frozen-colour.spec.js` walks **every built page on both sites**, flips the theme in memory, and
counts what did not move plus what fails AA in either theme, against `frozen_baseline.json`.

**Why a ratchet and not zero.** The honest starting position is **183 frozen colours and 381 AA
failures** across the two sites, concentrated in pages this work has not reached — `decision-aids`,
`orientation-video`, `sp-interview`, `rp-canon-quiz`, `withdrawal`. A gate that fails on day one
teaches everyone to bypass it. This fails only on the commit that makes a page *worse*, which is the
commit that can still fix it cheaply. A page **absent** from the baseline must measure clean —
arriving pre-broken is exactly how the five private-palette tools got in.

It is a `nav-*` spec only, deliberately **not** in `CANARY_SHARED_SPECS`: ~51 navigations against
Netlify's edge would blow the canary's 30-round-trip budget many times over, and nothing it checks
needs production to be true — it is a property of the build.

**Falsifying a gate whose measurement needs a browser.** The measurement and the verdict are
separate files. `frozen-ratchet.mjs` decides; it is pure, and `tests/theme-scan.test.mjs` proves it
in milliseconds on every push — both directions of the ratchet, the WCAG bar including the
large-text exception, and the contrast maths against reference values. That is what stops the gate
going quietly vacuous between CI runs.

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

The first fix was a remediation block at the foot of `clinical-warm.css` giving those page-private
names dark values centrally — the names were page-private but semantically identical across the
pages that used them (`--ink` was always primary body text, `--line` always a hairline), so one
central override was correct rather than five inline blocks.

**That block was remediation, not a pattern, and it is now gone** — deleted by migration step 6
(§5), which moved all five pages onto `--fd-*` directly. C4 is what holds the line in its place:
a page that invents private colour vocabulary fails the build rather than earning a new row in a
block someone has to remember to maintain. New pages use `--fd-*`.

Two things the migration taught, both worth keeping:

- **Aliasing would have been worse than useless.** `--terracotta: var(--fd-terracotta)` looks like
  the cheap way to retire a name, but four of the legacy tokens (`--terracotta`, `--terra`,
  `--teal`, `--gold`) were used *both* as ink and as fill. An alias would have carried
  `color:var(--terracotta)` across intact **and hidden it from C1**, which matches on the `--fd-*`
  name. The migration had to be property-aware: 11 ink uses moved to the `-dark`/`-deep` ink
  tokens. Retiring the names fixed a C1 defect class as a side effect; aliasing them would have
  entrenched it behind a green gate.
- **Two of the seven pages never needed the block.** `interaction-cards.html` and
  `sp-interview.html` declare both halves of their own `--surface-2` / `--ink`. They collided on
  *names* only. Scope a migration by what actually fails, not by what greps.

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
| 3 | *(done 2026-09-10)* `frontdoor.css` `border-radius` and `gap` → tokens, + **C8** | 194 of 196 declarations tokenised; `raw_dimension_declarations` 365 → **196** |
| 4 | *(done 2026-09-10)* `spa_index.html` rem type → the same px scale, + `?theme-audit` | 129 declarations moved; distinct sizes **37 → 1**; sub-floor **22 → 0**; raw dimensions 435 → **305** |
| 6 | *(done 2026-09-10)* Five private-palette pages → `--fd-*`; raw literals tokenised | §4's remediation block **deleted**; those pages **0 frozen, 0 below AA** in both themes |
| 5 | Fold the 9 non-standard breakpoints into sm 430 / md 640 / lg 1000 | breakpoint debt → 0 |

Do **2 before 3**: type is where the sub-11px accessibility debt lives, and it is the only ratchet
with a learner-visible floor. *(Done — what it cost: 88 of 153 declarations did not move at all,
59 moved by 0.5px, 4 by 1px, and exactly two moved further: `.fd-article__body h3` 18→21 and `h2`
24→26. Those two are a deliberate improvement — the article ladder was 16.5 / 18 / 24 / 29, ratios
1.09 / 1.33 / 1.21, and an h3 only 1.5px above its body text is not a heading. It is now
17 / 21 / 26 / 30 — 1.24 / 1.24 / 1.15.)*

**What step 4 cost, measured the same way.** 131 declarations moved, **every one of them to its
nearest step** (0 exceptions). Max move **2.00px**, median **0.28px**, mean 0.42px; 107 of 131
landed within 0.5px and 5 were exact. Only 12 moved more than 1px, and all 12 are deliberate:
8 were sub-floor lifts (9.6–9.92px → the 11px floor), and 4 came *down* onto the scale
(`.md-body h2` and `.hm-tile .v` 22.4 → 21; `.md-body h1` and `.st h1` 32 → 30).

The shell was already on a rem ladder sitting almost exactly on the px scale — `.92rem` is 14.72px
against a `--fd-font-base` of 15px, `1.05rem` is 16.8px against `--fd-font-lg`'s 17px, and
`body{font-size:17px}` was already `--fd-font-lg` to the pixel. So the shell does not change
visibly; what changes is that 37 arbitrary sizes became one token reference each, and the 22
sub-floor sizes the rem blind spot had been hiding are gone. Two rules that both point at
`--fd-font-base` cannot drift apart; `.92rem` and `.9rem` in two places always eventually do.

**A warning for whoever audits step 5 or 6.** Verifying this migration by hand means comparing
each old value against the token it now points at — and the step *names* are not what a reader
guesses. The scale runs `2xs xs sm md base lg xl 2xl 3xl`, so `--fd-font-md` is **14px, not the
middle of the range**, and `--fd-font-lg` is 17. Assume otherwise and every declaration appears to
have jumped a full step, which is a very convincing false alarm. **Read the values out of
`clinical-warm.css`; never retype them.** §2.2's table is now gate-enforced against that file
(check **C9**) precisely so it cannot become the stale copy someone audits against.

**Step 6 went before step 5**, because it deleted §4's remediation block — a standing invitation to
invent private colour vocabulary — whereas step 5 changes where layouts break and needs eyes on it
at each width. Step 5 is now the only one left.

**What step 6 cost.** 237 `var()` uses across five pages, plus 30 raw colour literals on
`rotation-curator.html` alone. Two new central tokens (`--fd-terracotta-wash`, and the light half
of `--on-brand` — see below). Measured on the built pages, both themes, service worker cleared:

| Page | Frozen colours | Below AA (dark) | Below AA (light) |
|---|---:|---:|---:|
| `rotation-curator.html` | 58 → **0** | 12 → **0** | 0 → **0** |
| `one-patient-six-weeks.html` | 7 → **0** | 1 → **0** | 3 → **0** |
| `family-systems.html` | 0 → **0** | 0 → **0** | 0 → **0** |
| `screeners.html` | 0 → **0** | 0 → **0** | 0 → **0** |
| `interview-circle.html` | 0 → **0** | 0 → **0** | 1 → 1 *(see `--primary`, below)* |

**The `--on-brand` hole, found on the way.** `common.py` rewrites every authored `color:#fff` to
`color:var(--on-brand)` at build time, and injects the light `--on-brand` by string-replacing
`--surface:#ffffff;` in the page. A page that spelled that `--surface:#fff` got **no light value at
all** — so the build's own rewrite resolved to nothing and every filled button fell back to body
ink. Measured: 2.56:1 on `--fd-teal`, 3.0:1 on `--primary`, in **light** mode, on pages nobody
suspected. The dark half had been in `clinical-warm.css` all along; only the light half depended on
how a page happened to spell white. It is now declared centrally alongside `--fd-on-accent`, so the
token is whole for every page whatever it calls its surface.

That fix raised several pages and left one systemic near-miss visible: **white on `--primary`
(`#c25a3c`) is 4.36:1**, just under AA, on `interview-circle.html`, `decision-aids.html` and
others. Darkening `--primary` is a palette-owner decision affecting many surfaces, so it belongs in
its own reviewed change with a CONTRAST DECISIONS entry — not folded into a migration.

**The sweep is the other output.** Probing all 23 built tool pages in both themes (the same walk
`?theme-audit` does, run over every page) found 12 clean and 11 carrying frozen colours or AA
failures — including `orientation-video.html` at **159** dark-mode failures and
`decision-aids.html` at **53**, none of which any gate can see, because they are raw literals
rather than tokens. That is the backlog step 6 makes visible; it is not step 6's scope, and §3.2's
closing note applies — when a lamp finds a class worth pinning, the class becomes a check.

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
