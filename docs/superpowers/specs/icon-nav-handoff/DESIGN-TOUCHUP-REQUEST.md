# Claude Design touch-up prompt: icons & wayfinding (2026-10-09)

Paste everything between the two rules into the **same** Claude Design project that produced the "Icons & wayfinding" bundle. It asks for fixes only. It does not reopen any design decision.

---

**This is an errata pass on revision 2 of the bundle (README "Revision 2 (2026-10-09)"). Fix only the items below. Do not change layout, type, spacing, copy, colour or any screen that is not named here. If a fix seems to need a change that isn't listed, leave it and write it under "Open questions" in `handoff/README.md`.**

## A. Use real Lucide shapes at a pinned version

1. **Pinned release: `lucide-static@1.54.0`.** This is the npm `latest` tag and GitHub release `1.54.0` (published 2026-10-09). Tarball SHA-1: `3addc8999298b41f788f3b15cf8042a4607293c6`.
2. Re-copy every Lucide glyph from `icons/<name>.svg` in that release. Copy the **child elements verbatim** (`<path>`, `<circle>`, `<rect>`, `<line>`, `<polyline>`). Do **not** convert circles or rects to arcs. Do **not** merge children into one compound `d`. Change `wf-icons.js` to store the inner markup for each glyph, and drop `d()` if it no longer fits. This replaces revision 2's "one compound `d`, circles and rects converted" instruction in the README's blocking step and in both kickoff prompts.
3. Non-Lucide glyphs stay, labelled as such in `SOURCES.md`:
   - `safety` is custom (✚).
   - `search`, `star` and `sprout` come from rc-icons.
   - Remove `crisisOld` from the subset.
4. `SOURCES.md` must give:
   - the pinned version, filled in;
   - one row per glyph with its upstream name;
   - a column marking any glyph that is modified (expected: none for Lucide);
   - the measured subset size in bytes.
5. Replace `icons/LICENSE-lucide.txt` with the release's `LICENSE`, verbatim. The text is in the appendix below. Delete the "Replace this file…" preamble. In `SOURCES.md`, note that `life-buoy`, `compass`, `external-link`, `chevron-*`, `arrow-right`, `calendar`, `headphones`, `check`, `x` and `plus` are on Lucide's Feather-derived (MIT) list.
6. In titled mode, `icon()` emits `role="img" aria-label="…"` and **no `<title>` child**.

## B. Hub registry names: prefix them, and remap the alarm glyphs

1. Revision 2's `wf-*` prefix stands. Fix the boards and maps so **every** Site B glyph uses its `wf-*` name. No bare `home`, `phone`, `settings`, `family`, `library` or `crisis` may remain: rc-icons already owns those ten names (`check`, `close`, `crisis`, `family`, `home`, `library`, `medication`, `phone`, `search`, `settings`) with different drawings. These are exactly the names the ReConnect icon-library PR adds:

   | Use | Name | Source |
   |---|---|---|
   | Nav: Home / Explore tools / Settings / 988 | `wf-home` / `wf-explore` / `wf-settings` / `wf-phone` | Lucide `house` / `compass` / `settings-2` / `phone` |
   | Nav: My toolbox · Intent: continue recovery | `wf-toolbox` · `wf-recovery` | rc-icons `star` · `sprout` (same drawing, new name) |
   | Categories (map the category **id** to the name in the renderer; `psychoed` → `wf-learn`) | `wf-crisis`, `wf-discharge`, `wf-aftercare`, `wf-family`, `wf-exercises`, `wf-assessment`, `wf-learn`, `wf-reference` | Lucide `life-buoy`, `door-open`, `signpost`, `users`, `wind`, `gauge`, `book-open`, `library` |
   | Audience chips | For patients `wf-patient` · For family `wf-family` · For clinicians `wf-clinician` · Everyone: none | Lucide `user-round` · — · `id-card` |
   | Intents | `wf-first-days`, `wf-visit`, `wf-session` (others reuse a category name) | Lucide `sunrise`, `calendar-check`, `timer` |
   | UI | `wf-chevron-right`, `wf-external`, `wf-filter` | Lucide `chevron-right`, `external-link`, `list-filter` |
   | Status | `wf-notice` | Lucide `circle-alert` |

   Use one name per shape. If a glyph you need isn't in this table, say so under "Open questions"; don't invent a name.
2. **Emoji aliases.** State the mapping this way everywhere (README, `PROMPT_TOOLS_HUB.md`, `Map Tools Hub.dc.html`):
   - 🆘 and 🚨 → `wf-crisis` (life-buoy, `--rc-danger`).
   - ⚠, ⚠️ and 🛑 → `wf-notice` (Lucide `circle-alert`, calm, `--rc-text-mid`). **Never** the life-buoy, **never** red. This closes decision N5.
   - The existing `crisis` triangle keeps its name for its existing explicit callers. No alias reaches it any more.

## C. Cover the gaps

1. **Home: the 5 clinician intent cards.** Key them by journey **id**: `support-family-member`, `find-care-resources`, `prepare-engage`, `coordinate-transitions`, `review-progress-outcomes`. Give each:
   - an icon from the table in B (or the existing `star`/`sprout`);
   - a distinct one-line subtitle, at or below 8th grade, with no product or framework names.

   Mark the subtitles **proposed**.
2. **Uncovered slots.** For each slot, add a design state, or mark it "no icon" in the README with one line of reason.
   - **Clerkship (17):**
     - A14 setup back ‹
     - A25 preview "Practice with" kind word
     - A42 phone action-bar back (its `aria-label` follows A40)
     - A46 not-found back
     - A47 "Beyond this page" kickers and links (#1001)
     - A53 Today/Path/Continue kind chip `.fd-chip.is-tool`
     - A54 rail section heads
     - A55 "Also today" status marks (expected: leave)
     - A61 search result group labels
     - A63 search empty state
     - A64 search-footer "＋ Ask" (follows A09)
     - A70 Care link ↗
     - A71 Care group heads
     - A72 Care navigator (expected: no icon; a test forbids `<svg>`)
     - A75 Safety sheet (expected: keep)
     - A80 favicon (stale terracotta hex)
     - A91 Case Journeys week "✚ safety" tag (expected: deferred to W4)
   - **Hub (8):**
     - B23 clinician intent cards (item 1)
     - B25 saved-activity ★ chips
     - B26 "Browse all N tools →"
     - B41 Explore empty state
     - B45 Welcome role cards (expected: no icon this round; prerender parity)
     - B52 tool name `.rc-ts-name`, B54 "Saved" `.rc-ts-toolbox` and B55 dark toggle `.rc-ts-darktoggle`. Revision 2's text keeps them; draw them on the phone and desktop header boards (see C7)
3. **Crisis band, "or call 988".**
   - Render the number as a tappable `tel:` link.
   - Its label and `href` are bound to the site's existing crisis data, the same source the 988 pill uses (e.g. a `crisisLine` prop with `label` and `tel`). **Never type the number as a literal in the mock.**
4. **Crisis band, phone.** List the **4 crisis tools** as one-tap links in the band. Do not collapse it to one row that opens the Crisis filter.
5. **Crisis band, "Crisis" text.** Every crisis tool in the band keeps the visible word "Crisis" (its badge). A test asserts that every Crisis card contains it.
6. **Family badge contrast.**
   - Badge: `--rc-cat-family-strong` text on `--rc-cat-family-light` (6.46:1 light). These are existing tokens.
   - Chips keep `--rc-cat-family`.
   - Add a contrast table for every icon and badge pair in light, dark, `.high-contrast` and forced-colors. Each pair needs ≥ 4.5:1 for badge text and ≥ 3:1 for icons.
7. **Tool header (phone): one row, ≤ 56 px.** Revision 2's description is right. Make the `Screen Tool Header B` phone board match it exactly:
   - `.rc-ts-home` reads exactly "← Home" (or whatever `appReturnTarget` already sets). It is a pinned accessible name, so no "‹ Explore tools" text.
   - `.rc-ts-name`: the tool name stays, and truncates first.
   - "Saved", the dark toggle and the 988 pill keep their places.
   - Nothing wraps to a second line at 390 px.

   Leave revision 2's category kicker as drawn.
8. **One dock height (Site A).** Use the existing tested values everywhere: a **66 px bar** (`min-height: calc(66px + env(safe-area-inset-bottom))` in `frontdoor.css`; `fd-phone-chrome.test.mjs` pins the items "inside the 66px dock") and **52 px items**.
   - Replace every 64 px and 60 px dock figure in the README, `PROMPT_CLERKSHIP.md`, `Main`, `Icon Spec` and `Screen Shell A`.
   - Keep the icon above the label, with the 2-line clamp moved to `.fd-dock__label`.
9. **Class map: real classes only.** Rewrite both class-map tables from these selectors. List every new class separately, and give the Site A count against `CLASS-INVENTORY.md` (585 on main; 608 after #1001).
   - **Site A, shell:** `.fd-tabs`, `.fd-tab`, `.fd-tab__label` (Care: icon **outside** the label), `.fd-dock`, `.fd-dock__item`, `.fd-searchbtn`, `.fd-askbtn`, `.fd-safetybtn`, `.fd-settingsbtn`.
   - **Site A, Library:** `.fd-kit__index-item`, `.fd-kit__group` > `summary` > `.fd-kit__group-name`, `.fd-kit__reading` and `.fd-collink` > `.fd-kit__titlerow`, `.fd-kit__preview-kicker`, `.fd-library__filter`.
   - **Site A, shared:**
     - `.fd-chip.is-tool` is shared by Library, Today and the Safety sheet. Do **not** retire it globally. Drop it on Library rows only.
     - `.fd-kit__safety` is the **row safety dot** (keep it). It is **not** the Safety kit.
     - The Safety kit is `.fd-railkit` / `.fd-kitcard` (no icon).
     - Today's rows are `.fd-row` (a separate renderer from Library rows).
   - **Site A, other:** `.fd-quicktool__dot`, `.fd-reader__back`, `.fd-eyebrow`, `.fd-searchpanel__head`.
   - **Next-in-thread vs stepper.** Revision 2's row "Next-thread card `.fd-thread__*` (not `.fd-nextthread`)" is backwards:
     - The Reader's next-in-thread rows are `.fd-nextthread` / `.fd-nextthread__mark--{tool|read}`.
     - `.fd-thread__node` / `__mark` / `__label` is Today's week stepper. There is no `.fd-stepper__*`.
   - **Site B:** `.rc-shell-navbtn`, `.rc-shell-tab` (`.is-crisis`), `.rc-shell-crisis-pill`, `.rc-shell-card` (`.is-crisis`), `.rc-shell-card-arrow`, `.rc-shell-filterchip.is-cat-{id}`, `.rc-shell-badge.is-cat-{id}`, `.rc-shell-toolcard` / `-head` / `-meta` / `-name`, `.rc-shell-star`, `.rc-tool-newtab`, `.rc-shell-empty`, `.rc-shell-search`.
   - **Site B tool header:** `.rc-ts-home`, `.rc-ts-dot`, `.rc-ts-name`, `.rc-ts-badge`, `.rc-ts-toolbox`, `.rc-ts-darktoggle`, `.rc-ts-988`. There is no `.rc-toolhead-*`.

## D. Ship `support.js`

Export the Claude Design runtime `support.js` into the bundle root, so every `.dc.html` opens standalone in a browser. Confirm in the README that each file renders with no network access other than fonts.

## E. Owner decisions (answered 2026-10-09)

Record these in the README's "Owner decisions" table. Use the D1–D6 format, change "open" to "answered", and apply them to the screens.

| ID | Decision | Answer |
|---|---|---|
| D7 | One Thread "No new icons" | **Amended.** A vendored Lucide subset (ISC) at `--fd-glyph-sm/md/lg`; three colour roles (text-mid · teal-deep · danger); every icon paired with a visible label; no icon-only navigation |
| D-set | Icon source | One set, **Lucide 1.54.0**, for both sites; a separate vendored copy in each repo |
| D-sec | Site A section colour | **None.** Danger is keyed on the section **name** "Acute & safety", never on `accent: safety` (Pocket cards carry `accent: safety`) |
| D-cat | Site B category colour | **Keep all 8.** Family badge `-strong` on `-light` (C6) |
| D-band | Crisis band, phone | **List the 4 crisis tools**, one tap each |
| D-tab | Card target | **Same tab.** The title is already same-tab; demote the secondary "Open in new tab ↗" link |
| D-dock | Phone dock | **Icon above label**, 66 px bar, 52 px items |
| D-glyph | Crisis glyph | **Life-buoy** (`wf-crisis`) for 🆘/🚨 and crisis. ⚠/🛑 → calm `wf-notice` |
| D-tok | Size tokens | **Add** `--rc-icon-xs/sm/md/lg` = 14/16/18/22 to the hub tokens |
| D-kind | Row type field | **No new `kind` field.** Derive a `type` in the renderer. `item.kind` (`tool\|read`) is untouched |
| N1 | Dock "＋ Ask" | **"Ask"** with `ask` (message-circle-question); the ＋ glyph goes |
| N2 | Tool header | Keep "← Home" and the tool name on phone; one row ≤ 56 px (C7) |
| N3 | Type word vs kind word | Lead with the type word **only** for deck, podcast, book list, pocket card and exam. Medication readings keep "Reading" (pill icon). Licensed instruments (`cssrs.html`, `bfcrs.html`) keep the text "reference", with the icon `file-text` |
| N4 | Hub registry | **Prefix** the new names `wf-*` (B1); no rc-icons name is overwritten or re-pointed |
| N5 | ⚠ / 🛑 | Calm `wf-notice` (Lucide `circle-alert`, text-mid); only 🆘/🚨 get the life-buoy |
| N6 | Teaching companion | **External mark only.** No section icon |
| N7 | Book-list glyph | Book list → `library-big`. The Site A Library tab/dock → Lucide `library` |
| N8 | External marks in reader body links | **Out of scope.** Remove them from the Reader mock |

Return the updated bundle with the same file names, plus a short `CHANGES.md` that lists each item above (A1–E) and the file(s) it touched.

---

### Appendix: `LICENSE`, verbatim from `lucide-static@1.54.0`

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
