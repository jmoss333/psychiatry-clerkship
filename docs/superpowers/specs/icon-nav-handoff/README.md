# Icons & wayfinding: design handoff (C0, spec only)

> **What this folder is.** This is the Claude Design handoff for the icon and wayfinding layer, imported as **C0** (spec only, no code), in the same shape as `../one-thread-handoff/`.
>
> - **Source:** bundle revision 2, dated 2026-10-09.
> - **Intake review:** run against revision 1. Its findings are folded in below.
> - **Owner decisions:** answered 2026-10-09.
>
> The bundle's own README (revision 2) follows **verbatim** after the decision log and errata, from "Handoff: Icons & wayfinding for two sites" on. **Where they disagree, the decision log and the errata win.**

**Reading order**

1. This header: decisions, errata and the Lucide pin.
2. `PROMPT.md`: the kickoff for C1 onward, amended for these decisions.
3. The bundle README below.
4. The `.dc.html` boards. Read them as source until `support.js` ships; see `ASSETS-OMITTED.md`.

**Also in this folder**

| File | What it is |
|---|---|
| `LUCIDE-PIN.md` | The pinned icon release and its provenance; the Site A subset with upstream names and sizes |
| `LICENSE-lucide.txt` | The release's `LICENSE`, verbatim |
| `DESIGN-TOUCHUP-REQUEST.md` | The fix-only prompt sent back to Claude Design for the items revision 2 still gets wrong |
| `ASSETS-OMITTED.md` | What was not copied, and why |

## Scope of this PR

- **Docs only.** Every file is under `docs/superpowers/specs/icon-nav-handoff/`.
- **No code, CSS, baselines, data or governance paths.** It does not touch `CLAUDE.md`, `AGENTS.md`, `bin/`, `.github/`, `*.schema.json` or `reviewed.json`.
- **Separation gates:**
  - `bin/check_governance_separation.py`: specs are neither G-files nor CONTENT.
  - `bin/check_policy_content_separation.py`: `docs/superpowers/specs/**` is *Neutral*.
- **Open PRs:** it touches no file of #1001 or #1004–#1011.
- **`../one-thread-handoff/README.md` is not edited.** Its "No new icons" line is amended by D7 below, by reference.

## Lucide pin

| Field | Value |
|---|---|
| Package | **`lucide-static@1.54.0`** (npm `latest` on 2026-10-09; GitHub release `1.54.0`, published 2026-10-09T06:08Z, not a draft or pre-release) |
| Tarball | `https://registry.npmjs.org/lucide-static/-/lucide-static-1.54.0.tgz` |
| SHA-1 | `3addc8999298b41f788f3b15cf8042a4607293c6` |
| Integrity | `sha512-Y0NVQ7uX17m+Jee/coLs7uxGF3bEyWHXiXFBXxmE7BnjjMa5o0s1gR4zQHBQHN19RYaQWVG2cx4GdrW/WroyrA==` |
| Licence | ISC (Lucide Icons and Contributors), plus MIT for the Feather-derived icons it lists. Verbatim in `LICENSE-lucide.txt` |

The subset, the measured sizes and the verification commands are in `LUCIDE-PIN.md`.

## Decision log (owner, answered 2026-10-09)

The first six rows use the same format as One Thread's D1–D6. Rows marked *review* take the intake review's recommendation, as the owner directed for N1, N3 and N6–N8.

| ID | Decision | Answer | Affects |
|---|---|---|---|
| **D7** | One Thread "No new icons" (`../one-thread-handoff/README.md`, "Glyphs … No new icons.") | **Amended.** A vendored Lucide subset (ISC, `lucide-static@1.54.0`) at `--fd-glyph-sm/md/lg`; three colour roles (text-mid · teal-deep · danger); every icon paired with a visible label; no icon-only navigation. The existing glyphs (ψ brand, ✓, ⌄, ‹ ›) are unaffected unless a phase says otherwise. The `CLAUDE.md` wording, if any, ships as its own governance PR after #1007 | C1, W1–W3 |
| D-set | Icon source | **One set, Lucide**, for both sites. Each repo vendors its own copy; there is no shared package | C1; ReConnect R1 |
| D-sec | Section colour (Site A) | **None.** Icons only. Danger is keyed on the section **name** "Acute & safety", never on `accent: safety`, because Pocket cards carry that value too (`curriculum.json`) | W2 |
| D-cat | Category colour (Site B) | Keep all 8. Family badge `--rc-cat-family-strong` on `--rc-cat-family-light` | ReConnect only |
| D-band | Crisis band on phone (Site B) | List the 4 crisis tools, one tap each | ReConnect only |
| D-tab | Card target (Site B) | Same tab; demote the secondary new-tab link | ReConnect only |
| D-dock | Phone dock | **Icon above label.** One height: the existing tested values, a **66 px bar** and **52 px items**. The line-clamp moves to `.fd-dock__label`. Revision 2's "64 px" is superseded | W1 |
| D-glyph | Crisis glyph (Site B) | Life-buoy for 🆘/🚨; ⚠/🛑 → calm notice | ReConnect only |
| D-tok | Size tokens (Site B) | `--rc-icon-xs/sm/md/lg` = 14/16/18/22 | ReConnect only |
| D-kind | Row type | **No new `kind` field**, in the catalogue or any schema. Derive `type` in the renderer (e.g. `fdItemType(ref)`). `item.kind` (`tool\|read`) stays as it is. Pin the derivation table in a test over every `curriculum.json` ref | W2 |
| N1 *(review)* | Dock and search-footer "＋ Ask" | **"Ask"**, with the `ask` icon (message-circle-question). Update `DOCK_STANDARD` / `DOCK_APP` and `fd-shell.test.mjs` in the same PR. Prose mentions ("＋ Ask a question" in empty states) stay text | W1 (A09, A11, A64) |
| N2 | Tool header (Site B) | Keep "← Home" and the tool name on phone; one row ≤ 56 px | ReConnect only |
| N3 *(review)* | Type word vs kind word | Lead with the type word **only** for flashcard deck, podcast, book list, pocket card and exam. Medication readings keep "Reading" with the pill icon. Licensed instruments (`cssrs.html`, `bfcrs.html`) keep the text "reference", with `file-text`. Everything else keeps "Reading" / "Tool". Accept the pinned-string test churn in W2/W3. This supersedes revision 2's "not in W2" | W2, W3 (A22, A24, A43) |
| N4 | Hub registry names | Prefix `wf-*`; never overwrite an rc-icons name | ReConnect only |
| N5 | ⚠ / 🛑 | Calm notice (`circle-alert`, text-mid); only 🆘/🚨 get the life-buoy | ReConnect only |
| N6 *(review)* | Teaching companion | **External mark only**, no section icon. Do it after #1008 (which rewrites that heading) | W2 (A27) |
| N7 *(review)* | Book-list glyph | Book lists → **`library-big`**. The Library tab and dock → Lucide **`library`**. `book-marked` is not used | W1, W2 |
| N8 *(review)* | External marks inside reading content | **Out of scope.** It is a content-renderer change and collides with #1004. Remove it from the Reader mock | — |

## Errata against revision 2 (open until the design touch-up returns)

These are sent back to Claude Design verbatim in `DESIGN-TOUCHUP-REQUEST.md`. Until the bundle comes back, implement from **this list**, not from the conflicting bundle text.

1. **Lucide provenance.** Copy each glyph's child elements **verbatim** from `lucide-static@1.54.0/icons/<name>.svg`.
   - Don't merge them into one compound `d`, and don't convert circles or rects to arcs.
   - Revision 2's blocking step and `icons/wf-icons.js` are superseded; the bundle's paths are hand-transcribed and untraceable.
   - Non-Lucide glyphs: `safety` is custom (✚); `search` comes from the existing shell magnifier.
2. **Dock height** is 66 px for the bar and 52 px for items (D-dock), not 64 px.
3. **Class map** (revision 2's table is still wrong in places):
   - The **stepper** is `.fd-thread__node` / `__mark` / `__label` (Today). There is no `.fd-stepper__*`.
   - The Reader's **next-in-thread** rows are `.fd-nextthread` / `.fd-nextthread__mark--{tool|read}`. Revision 2's "`.fd-thread__*` (not `.fd-nextthread`)" is backwards.
   - `.fd-kit__safety` is the **Library row safety dot** (A23). Keep it, `role="img" aria-label="Safety"`. It is not the Safety kit.
   - The **Safety kit** is `.fd-railkit` / `.fd-kitcard` (A52). It gets **no icon** (`fd-today.test.mjs` pins that).
   - `.fd-chip.is-tool` is shared by `fd_library.js`, `fd_today.js` and `fd_sheet.js`. Under N3 it can come off **Library rows** only.
   - Today's rows (`.fd-row`, `fd_today.js` `fdRow`) are a different renderer from Library rows (`.fd-kit__reading` / `.fd-collink` > `.fd-kit__titlerow`).
   - Desktop Care tab: the icon goes **outside** `.fd-tab__label`. `frontdoor.css` sets that label to `font-size:0` and paints `::after`.
   - New classes bump `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`: **585** on main, **608** after #1001.
4. **Content-type map** (W2). Use the inventory's derivation (A-2), not the bundle's:
   - Rapid Review is *exam*; Weekly Reading Map is *book list*.
   - `reference` (rights) → `file-text`.
   - `video` is dropped.
5. **Uncovered slots.** Each needs a design state or "no icon" before the phase that touches it: A14, A25, A42, A46, A47, A53, A54, A55, A61, A63, A64, A70, A71, A72, A75, A80, A91.
   - A55 and A75: leave.
   - A72: no icon (`fd-care.test.mjs` forbids `<svg>` there).
   - A91: deferred to W4.
6. **Contrast table** for every icon pair (light, dark, forced-colors) is still owed.
7. **Scope.**
   - The stepper label fix is either CSS-only in W1 or moves to its own PR. It is not a `fd_today.js` markup change inside W1.
   - Remove the "Not saved, as today…" annotation rendered as UI copy (Site B mock).
8. **`support.js`** is still not shipped; see `ASSETS-OMITTED.md`.

## Sequencing (unchanged from the plan)

- **C0 (this PR):** docs only. It can merge independently of #1001 and #1008.
- **C1 (icon module):** after #1001 and #1008 merge.
- **W1–W3:** follow.
- **W4 (Case Journeys):** after #1006 and re-attestation.

---

# Handoff: Icons & wayfinding for two sites

> **Revision 2 (2026-10-09)** folds in the intake review (`~/Documents/CLAUDE_DESIGN_REVIEW_ICON_NAV_2026-10-09.md`).
> Changes: blocking Lucide step; prefixed hub icon names; corrected emoji mapping; no new `kind` field; reference type added;
> accent keyed on section name; Family contrast pair; one-row tool header; tappable 988 and "Crisis" text in the band;
> 64 px dock; class map marked for verification; decisions N1–N8.

## Overview
A reviewer asked for "icons and graphic cues that define the sections and make navigation more intuitive." This bundle answers that as a **wayfinding** problem for two existing, already-polished sites:

- **Site A**: the inpatient psychiatry learning site (One Thread shell; student and resident builds).
- **Site B**: the patient & family recovery tools hub.

Success means a first-time user can (1) tell sections apart at a glance, (2) know where they are, and (3) predict what a tap will do, without either site getting louder. Layout, type, copy and colour stay as shipped. We add one vendored icon subset, a few "you are here" cues and two layout fixes (the Site B phone filters and the Site A 390 px stepper label).

## Blocking step before any icon code
**Pin a Lucide release and copy every `lucide` glyph from it.** The paths in `icons/wf-icons.js` were hand-transcribed for the mockups, `icons/SOURCES.md` has an empty version slot, and `icons/LICENSE-lucide.txt` is a reference copy. Before C1 or R1:

1. Pick a release (for example `lucide-static@<x.y.z>`), record it in `SOURCES.md`.
2. Rebuild each `lucide` entry from that release's SVG (children concatenated into one `d`, circles and rects converted the same way the `c()` / `rr()` helpers do).
3. Replace `LICENSE-lucide.txt` with that release's LICENSE file.
4. Diff old against new and note any glyph whose shape changed.

## About the design files
The `.dc.html` files are **HTML design references**, not production code, and they need the design editor's `support.js` to open (not shipped; see "Assets"). Rebuild them inside each repo's existing renderers and classes:

- Site A: ES5 pure string renderers in `frontdoor/*.js` (port the module as `FD/fd_icons.js`, per the review).
- Site B: React 18, precompiled, `React.createElement`; the icon module goes into the AppShell esbuild bundle.

Both consume the same API, `icon(name, {size, title})`, which returns an SVG string.

## Fidelity
Spacing, sizes, colour roles and icon choices are final proposals. Copy marked **proposed** needs owner sign-off. Placeholders in `[brackets]` stand for existing content that renders unchanged. Explore card summaries are shown as placeholders; use the copy from the jargon-fix branch, not the pre-fix text in the "before" screenshots.

## Non-negotiable repo rules
**Site A** (from One Thread's handoff and the repo's CLAUDE.md):

- ES5 only in `frontdoor/*.js`.
- Audience-neutral shared copy: no MS3, clerkship, student, shelf or resident.
- No clinical content edits, and no governance paths in a shell PR.
- Crisis contacts only in `crisis_resources.json`.
- No new persisted keys.
- Medication workstream off-limits: link only.
- Update `CLASS-INVENTORY.md` in the same PR.
- Re-baseline visuals only via the workflow.
- Run `bash bin/verify.sh` and both site gates.

**Site B** (from the repo's CLAUDE.md):

- Patient-facing safety rules apply: crisis access in 1 tap, no RSS layer labels, tappable `tel:`/`sms:`, no risk-tier labels.
- Never edit generated `*.app.js`.
- Tools in scope of the single-file contract keep RC-META, inventory and QA harness in sync.
- Do not change crisis copy, numbers, the 988 pill, the crisis footer or `<noscript>` crisis blocks. Run `audit_crisis_resources.py --strict` on any PR that touches crisis-adjacent copy.

**Both**: no runtime CDN or icon font; no new colours; no new persisted state; red is reserved for safety and crisis.

## Icon system
- **Source:** Lucide (ISC), vendored as one compound path per glyph, with 4 glyphs kept from rc-icons (`search`, `star`, `sprout`, and the retired triangle for reference) and one custom glyph (`safety`, Site A's ✚). See the blocking step above.
- **Names on Site B are prefixed.** rc-icons already has `home`, `phone`, `settings`, `family`, `library` and five more names with different drawings, and 17 tools use them. Add the subset as `wf-<name>` (`wf-home`, `wf-crisis`, `wf-family`…). No existing rc-icons name is overwritten or re-pointed.
- **Emoji mapping (Site B):**
  - 🆘 and 🚨 → `wf-crisis` (life-buoy, danger).
  - ⚠ and 🛑 → a calm notice icon, not the life-buoy. They appear on "May Be Outdated", Sleep Tracker alerts and "Are you sure?" prompts, none of which are crises. Which glyph is decision N5.
  - The rc-icons triangle stays as it is for existing uses; it is not used in new patient or family surfaces.
- **Grid:** 24 × 24, 2-unit live-area margin, round caps and joins, no fills, `stroke="currentColor"`.
- **Stroke per size** (units → px): 14 → 2.1, 16 → 2.0, 18 → 1.8, 22 → 1.6, 24 → 1.5, 48 → 1.25. `safety` is drawn at 1.75× stroke so it keeps the ✚ silhouette.
- **Sizes:**
  - Site A: `--fd-glyph-sm` 16 (tabs, index, chips, header buttons) · `--fd-glyph-md` 18 (row type column) · `--fd-glyph-lg` 22 (phone dock).
  - Site B: **new size aliases** `--rc-icon-xs/sm/md/lg` = 14/16/18/22, added to all three token files. These are an owner decision (sizes, not colours).
- **Colour roles:** default text-mid · active teal-deep / `--rc-accent-dark` (follows the label) · safety/crisis danger only. Site B category badges and chips use the category token; Family uses `--rc-cat-family-strong` on `--rc-cat-family-light` (6.46:1).
- **Spacing:** beside a label, gap 6 px at 16 and 8 px at 18; nudge `translateY(-0.5px)` beside Inter 14–15. Above a label (dock), 22 px icon, 3 px gap, 12 px label. Beside a serif title, a fixed 18 px column aligned to the first line (padding-top 3 px) with a 12 px gap.
- **A11y:** decorative icons get `aria-hidden="true" focusable="false"`. Icon-only controls get an accessible name (in titled mode, use `aria-label` without a duplicate `<title>`). Every nav item keeps visible text. Icons inherit forced-colors. No animation.
- **Contrast table still owed** for every icon and badge pair in light, dark, `.high-contrast` and forced-colors. Known results: Family `-strong` on `-light` 6.46:1; dark Assessment badge (`--rc-info` on `--rc-info-light`) 4.45:1, probably already on main, so confirm before H2.

## Screens: Site A
1. **Dock + tabs** (`Screen Shell A.dc.html`; props `theme`, `device`, `state` today|library)
   - Phone dock: icon above label; the active wash pill wraps both.
   - **Bar height 64 px** (README, prompts and boards now agree). Items stay 52 px; the two-line `-webkit-line-clamp` moves from the item to an inner label span. Test updates: `fd-phone-chrome`, `fd-shell`, `front-door.spec` `DOCK_STANDARD/APP` (including the APP-mode "On shift" label).
   - Desktop tabs: 16 px icon beside the label.
   - "＋ Ask" → "Ask" with the question-bubble icon (decision N1; this also affects "＋ Ask" in the search footer).
   - ⚙ → `settings` icon button. ✚ → `safety` SVG.
   - Stepper fix: the current label sits on one centred line below the stepper. Ship it as the CSS-only fix, or move it out of W1.
2. **Library** (`Screen Library A.dc.html`; props `theme`, `device`, `view` everything|essentials, `state` default|empty)
   - Section icons in the index and phone chips; "All" has none.
   - **Danger is keyed on the section name "Acute & safety"**, never on `accent: safety` (Pocket cards carry that value too). Add the `fd-tokens` SAFETY allowlist entry for the index and group icon.
   - An 18 px type icon column on every row, with a trailing chevron or, for off-site pages, the external mark.
   - **Type is derived in the renderer, not stored.** Don't add a `kind` field: it would clash with the existing `item.kind`. Derive the row type from what the renderer already knows and pin the derivation table in a test.
   - **Type list:** reading, tool, pocket card, flashcard deck, podcast, book list, case, exam prep, medication, **reference (rights)**. Reference covers the licensed instruments (`cssrs.html`, `bfcrs.html`) and must keep its visible "reference" text. Video is dropped; no Library row uses it.
   - Whether the type word replaces "Reading" / "Tool" in pinned meta lines is decision N3. Until decided, keep the existing words and add only the icon.
   - The tool chip (`.fd-chip.is-tool`, also used by Today/Path) is **not** retired in W2 unless N3 says so.
3. **Reader kicker** (`Screen Reader A.dc.html`; props `theme`, `device`, `state` from-section|direct)
   - Breadcrumb "‹ Library · [icon] Section". The section segment restores the Library state from `history.state` (D3).
   - The status line leads with the type icon; governance text renders unchanged after it.
   - **No external marks inside reading content** (the Book Library mock showed them). That is a content-renderer change and out of scope (decision N8).
4. **Case Journeys** gets `journey` (footprints) in Phase 3 only, because of re-attestation.

## Screens: Site B
1. **Explore** (`Screen Explore B.dc.html`; props `theme`, `device`, `state` all|filtered|sheet)
   - Crisis tools are pinned in a calm "If you need help now" band (danger-wash, life-buoy). **Every band item keeps the word "Crisis"** (pinned by `app-shell.spec.js:192`), and "call 988" is a `tel:` link.
   - Phone: the band lists all 4 crisis tools, so each is one tap away, with its own "Call 988" link. (The earlier one-row version that opened the filter made tools two taps.)
   - Category group headings in "All". Category chips lead with their icon.
   - Each card has one stretched title link; the star stays a separate button; a chevron or external trailing mark replaces "Open in new tab ↗".
   - Phone: one scrolling chip row, plus "Showing: Everyone" opening a bottom sheet. The offline toast moves above the tabs.
2. **Home** (`Screen Home B.dc.html`; props `theme`, `device`)
   - Intent icons borrow their category glyph. Icon colour: text-mid or the category token, not the border hue.
   - **Proposed subtitles (patient/family journeys):**
     - Understand what is happening: "Plain words about what is going on and what comes next."
     - Get through the first 48 hours: "Small steps for sleep, calm and the first two days."
     - Prepare for a visit: "Questions to ask and what to bring."
     - Plan discharge or going home: "What to sort out before you leave, and who to call."
     - Continue recovery between visits: "Keep track of how you feel and what helps."
   - **Not yet designed:** the 5 clinician intent cards. They need subtitles and icons keyed by journey **id**, not title.
   - Crisis card copy unchanged. "Build my short session" gains the `wf-session` timer icon.
3. **Tool header** (`Screen Tool Header B.dc.html`; props `theme`, `device`, `state` same-tab|new-tab)
   - **One row, ≤ 56 px, keeping everything it has today:** back link (text exactly as `appReturnTarget` sets it), tool name `.rc-ts-name` (truncates first), "Saved", the dark toggle and the 988 pill. Pinned by `tool-shell.spec.js:191-209`.
   - The category moves out of the header to a kicker above the H1: "[icon] Category · in Explore tools", linking to Explore filtered via a URL parameter. It replaces the category dot plus badge.
   - Changing the back text to "Explore tools" is decision N2; the mock leaves it unchanged.
   - 988 pill and crisis footer unchanged. Shared stepper for multi-step tools.
4. **Nav + bottom tabs**: Home `wf-home` · Explore tools `wf-explore` · My toolbox `wf-toolbox` (star) · 988 `wf-phone` in danger.

## Not yet covered
Icon slots the review found unaddressed. Cover each or mark it "no icon" before the phase that touches it:

- **Site A:** A14 setup back, A25 preview "Practice with", A42 phone action-bar back, A46 not-found back, A47 "Beyond this page" kickers, A53 Today/Path kind chip, A54 rail heads, A61 group labels, A63 search empty state, A64 "＋ Ask" in the search footer, A70/A71 Care page, A80 favicon, A91.
- **Site B:** B23 clinician intent cards, B25 saved-activity ★ chips, B26 "Browse all →", B41 Explore empty state.

## Interactions & behaviour
- Active state is carried by label colour, weight and the wash, and the icon follows. It is never shown by the icon alone.
- Chevron = opens here; external icon (with an accessible name) = new tab or another site. One trailing mark per row or card.
- Whole-card targets use a stretched link on the title (`::after { inset: 0 }`); secondary controls (star) sit above it with `position: relative; z-index: 1`.
- Filters stay transient: URL or in-memory only.
- `prefers-reduced-motion`: no icon motion exists; existing colour transitions drop to 0.

## Design tokens (existing only)
- **Site A:** `--fd-bg`, `--fd-surface`, `--fd-text`, `--fd-text-mid`, `--fd-teal`, `--fd-teal-deep`, `--fd-teal-wash`, `--fd-olive`, `--fd-danger`, `--fd-danger-wash`, `--fd-line`, `--fd-line-strong`, `--fd-glyph-sm/md/lg`.
- **Site B:** `--rc-text-mid`, `--rc-accent-dark`, `--rc-accent-light`, `--rc-danger`, `--rc-danger-light`, `--rc-primary-dark`, `--rc-success`, `--rc-info`, `--rc-warning-strong`, `--rc-cat-family-strong`, `--rc-cat-family-light` (dormant, now used).
- **The only new tokens** are the four Site B size aliases (owner decision).

## Component → existing class map
> **Verify every row against the repo before use.** The first version named classes that don't exist. The review's corrections are below. Give counts against the class inventory (585 / 608) in the PR.

**Site A** (new classes must be added to `CLASS-INVENTORY.md`):

| Surface | Existing (verify) | Change / new |
|---|---|---|
| Phone dock | `.fd-dock` | `.fd-dock__icon`, `.fd-dock__label` (new; carries the line-clamp) |
| Desktop tabs | `.fd-tabs` | `.fd-tabs__icon` (new) |
| Library index | `.fd-kit__index-item` | `.fd-kit__index-icon` (new) |
| Group header | `.fd-kit__group` | `.fd-kit__group-icon` (new) |
| Row | `.fd-row` / `.fd-kit__reading` | `.fd-row__type` (new, icon column), `.fd-row__trail` (new) |
| Tool / kind chip | `.fd-chip.is-tool` (not `.fd-kit__chip--tool`) | unchanged unless N3 retires it; also used on Today/Path |
| Next-thread card | `.fd-thread__*` (not `.fd-nextthread`) | gains a type icon via `.fd-row__type` |
| Quick tools | `.fd-quicktool__dot` | replaced by `.fd-quicktool__icon` (new) |
| Safety kit | `.fd-kit__safety` | the review flags this as mislabelled; confirm which element it is before mapping `safety` to it |
| Reader kicker | (new) | `.fd-kicker`, `.fd-kicker__section` |
| Stepper | (existing stepper) | `.fd-stepper__current` (new, one-line label) |

**Site B:**

| Surface | Existing (verify) | Change / new |
|---|---|---|
| Tool card | `.rc-shell-toolcard` | `.rc-shell-toolcard-trail` (new); title link stretched |
| Filter chip | `.rc-shell-filterchip` | `.rc-shell-filterchip-icon` (new); `.is-cat-family` → `--rc-cat-family-strong` |
| Badge | `.rc-shell-badge` | icon before the word; Family → `-strong` on `-light` |
| Eyebrow | `.rc-shell-eyebrow` | unchanged |
| Explore | (new) | `.rc-shell-helpband`, `.rc-shell-grouphead` |
| Phone filters | (new) | `.rc-shell-audiencesheet` |
| Tool-shell header | `.rc-ts-*` (not `.rc-toolhead-*`) | `.rc-ts-cat` (new, kicker under the header); `.rc-ts-name` kept |
| Stepper | (new shared) | `.rc-stepper` |

## Rollout (one PR per phase; each reverts with one commit; no data migration)
**Both:** the blocking Lucide step comes first.

**Site A**
- **C0 Spec only:** this fixed bundle, `ASSETS-OMITTED.md`, and the D7 answer. After #1001 and #1008 merge.
- **C1 Icon module:** `FD/fd_icons.js` (`function fdIcon` + `fdEsc`; marker after `/*__FD_DATA__*/`; bump `EXPECTED_MARKER_COUNT` 40 → 41 and `fd-inject` `ORDER`). Nothing visible changes.
- **W1 Shell:** dock and tab icons; ✚ and ⚙ redrawn. One baseline refresh.
- **W2 Library:** index icons; row type column (renderer-derived); reference type.
- **W3 Reader kicker + search result icons.**
- **W4 (Phase 3, after re-attestation):** Case Journeys `journey`.

**Site B**
- **R1 Icon library only:** prefixed `wf-*` names, the corrected emoji mapping, size tokens. Sequence after #1869, the consent-hardening follow-up and the phone-link branch, or re-run their checks.
- **H1 Nav:** nav and bottom-tab icons.
- **H2 Explore:** band, group headings, chip icons, card trail mark, Family token fix, phone filter row + sheet, toast position.
- **H3 Home:** intent icons + proposed subtitles (copy sign-off first); clinician cards once designed.
- **H4 Tool header:** kicker + one-row header; any back-text change (N2) and the same-tab change ship as their own behaviour PRs.
- **H5 Shared stepper**, adopted tool by tool.

## Owner decisions (open, with recommendation)
**Carried over**

1. **Icon source:** one set (Lucide) for both sites, copied into each repo. *Recommend: yes.*
2. **D7 for Site A** (same format as D1–D6):

   | ID | Decision | Answer | Affects |
   |---|---|---|---|
   | D7 | New icons | **Amend "No new icons":** a vendored Lucide subset (ISC) at `--fd-glyph-sm/md/lg`, three colour roles (text-mid · teal-deep · danger), every icon paired with a visible label, no icon-only navigation | W1–W3, shell + Library |

3. **Site A section colour:** *Recommend none (icons only)*; danger only for the "Acute & safety" section.
4. **Site B category colour:** *Recommend keeping 8*; Family → `--rc-cat-family-strong` on `--rc-cat-family-light`.
5. **Crisis in Explore "All":** *Recommend pinning it first* as the calm band. On phone, list the 4 tools (1 tap each) rather than opening the filter (2 taps).
6. **Card target:** *Recommend same tab* for hub tools; new tab only for external sites.
7. **Phone dock/tabs:** *Recommend icon above label*, bar 64 px.
8. **Site B crisis glyph:** *Recommend life-buoy* (`wf-crisis`) for 🆘 / 🚨 and new crisis surfaces.
9. **Size aliases** `--rc-icon-*` in the token files. *Recommend: yes.*
10. **Row type for Site A:** *Recommend deriving it in the renderer*; no new `kind` field.

**New (from the intake review)**

| # | Decision | Recommendation |
|---|---|---|
| N1 | "＋ Ask" becomes "Ask" (dock and search footer) | Yes, with the question-bubble icon |
| N2 | Tool-header back text and what stays in the header | Keep the back text `appReturnTarget` sets; keep the tool name, Saved and the dark toggle; category as a kicker below |
| N3 | Does the type word replace "Reading" / "Tool" in meta lines? | Not in W2. Add the icon first and keep the existing words; revisit after W2 |
| N4 | Prefix new hub icon names instead of overwriting rc-icons | Yes, `wf-*` |
| N5 | What ⚠ and 🛑 map to | A calm notice icon (for example Lucide `info` or `circle-alert`), never the life-buoy |
| N6 | Does Teaching companion get a section icon? | No: external mark only, after #1008 |
| N7 | `book-marked` reads as a "save" bookmark | Swap book lists to `library-big` and give the Library tab Lucide `library`, or use `book-copy` |
| N8 | External marks inside reading content | No: out of scope (content renderer) |

## Assets
- `icons/wf-icons.js`: the subset (one compound path per glyph), ES5, with the `icon()`, `d()`, `all()` and `sources()` API. **Not traceable yet** (see the blocking step). Rendered size: 55 glyphs, about 6.2 k path characters (measured in the review).
- `icons/SOURCES.md`: per-glyph source, upstream name and version slot.
- `icons/LICENSE-lucide.txt`: reference copy of the ISC licence; replace with the pinned release's LICENSE file.
- `screenshots-before/`: the brief's 11 captures. "After" PNGs still need exporting from the canvas (Share › Export).
- **Owed:** `ASSETS-OMITTED.md` listing what isn't shipped (`support.js`, the duplicated before JPGs) and why.

## Files in this bundle
- `Main.dc.html`: overview, icon-set comparison, ranked cues, owner decisions.
- `Icon Spec.dc.html`: grid, sizes, stroke, colour roles, spacing, full glyph sheet.
- `Map Clerkship.dc.html`, `Map Tools Hub.dc.html`: section → icon (+ accent) tables.
- `Screen Shell A.dc.html`, `Screen Library A.dc.html`, `Screen Reader A.dc.html`.
- `Screen Explore B.dc.html`, `Screen Home B.dc.html`, `Screen Tool Header B.dc.html`.
- `Handoff.dc.html`: rollout, class map and links to these files.
- `handoff/README.md` (this file), `handoff/PROMPT_CLERKSHIP.md`, `handoff/PROMPT_TOOLS_HUB.md`.
- `icons/wf-icons.js`, `icons/SOURCES.md`, `icons/LICENSE-lucide.txt`.
