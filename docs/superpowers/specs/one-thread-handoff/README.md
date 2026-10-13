# Handoff: Psychiatry Clerkship Library — "One thread" redesign

## Overview
This package specifies a redesign of the learner shell ("Front Door") shared by both sites built from `jmoss333/psychiatry-clerkship`:
`une-ms3-psychiatry` (students) and `mmc-psychiatry-residents-sanford` (residents). The goal is one calm, cohesive app:

- the same four destinations on every device (Today · Path · Library · Care),
- one primary action per screen,
- three status colours (teal = action and progress, olive = review, red = safety only),
- every page ends with where it leads at the bedside ("Next in this thread").

It covers Today, Library (Essentials + Everything), Path, Reader (focused reading), Case Journeys (`one-patient-six-weeks.html`) and global Search, on desktop and phone, in light and dark.
The full rationale is in `Library Redesign.dc.html`: audit, direction, before/after, flows, system, governance, rollout and decisions.

## About the design files
The `.dc.html` files are **design references built in HTML**. They are not production code. Open `Library Redesign.dc.html` in a browser (it loads `support.js` and the `Screen *.dc.html` children from this folder).
**Recreate the designs inside the repo's existing Front Door**: the ES5 renderers in `13_Faculty_Resources/_automation/site_build/frontdoor/fd_*.js`, `frontdoor.css`, `clinical-warm.css` and `spa_index.html`.
Do not copy the HTML across. Since #949, `frontdoor.css` plus `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` are the source of truth, so implement these designs as edits to them.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Every colour is an existing `--fd-*` token, and every clinical string is copied verbatim from the repo.
Where the concept and an existing class conflict, keep the class and change its values. Governance, crisis and safety strings must stay byte-identical.

---

## Non-negotiable repo rules (from CLAUDE.md — read it first)
1. **ES5 only** in `frontdoor/*.js` (var/function, no arrow functions, template literals, const or let). Renderers stay pure: state in, string out.
2. **Audience-neutral shell copy.** Strings in shared modules must not say MS3, clerkship, student, shelf, resident, UNE, MMC or Sanford (`tests/fd-shell.test.mjs`, `tests/shell-copy.test.mjs`). The resident brand comes from `RESIDENT_REBRAND`.
3. **No clinical content edits.** Topic summaries, hints, dosing, citations, faculty-review labels, signatures, content hashes, rights notices and safety warnings render as they are today.
4. **No governance paths in a content/shell PR.** `bin/`, `.github/`, `.claude/`, `faculty-console/`, `CLAUDE.md`/`AGENTS.md`, any `*.schema.json` and `13_Faculty_Resources/reviewed.json` are governance; see `bin/check_governance_separation.py`. Never hand-edit `reviewed.json`; only the faculty console attests.
5. **Crisis contacts** live only in `crisis_resources.json`. Never hard-code a number, never remove a `<!-- crisis-block -->` / `<!-- crisis-block-html -->` marker, and never let a disclosure wrap the crisis block or a governance notice.
6. **localStorage keys** stay `cw_*` / `rp_*`. This redesign adds **no** new persisted keys.
7. **Medication workstream is off-limits.** Do not touch `05_Psychopharmacology/**`, `pharmacy.html` (#941) or any medication draft/approval branch. The Library only links to those pages.
8. **Tests may not read live governance state.** Use controlled fixtures (see #729).
9. Update `CLASS-INVENTORY.md` in the **same PR** as any stylesheet change. Regenerate visual baselines only through the "Refresh visual baselines" workflow_dispatch, never locally.
10. Run `bash bin/verify.sh` and both site gates (`build_and_check.sh ms3`, then `res`) before calling a phase done.
11. **Sequencing:** rebase on #949 (Today rows, week-scoped completion) and #951 (tool palette: red means safety) before starting.

---

## Shell (all screens)

### Desktop app bar (≥ 1000px) — `.fd-header`
- **Bar:** `max-width:1200px; margin:0 auto; padding:12px 40px 0; display:flex; align-items:center; gap:16px`; background `--fd-surface-warm`; `border-bottom:1px solid --fd-line`.
- **Brand:**
  - 30×30 tile, radius 8, `--fd-terracotta`, glyph "ψ" Georgia 18px in `--fd-on-accent`.
  - Wordmark 14px/700: "Inpatient Psychiatry", or "MMC Psychiatry" via rebrand.
  - Brand = Home (Today). **Deviation (owner, 2026-10-08):** Brand = Home = the landing, set by the
    one build-time constant `FD_LANDING_VIEW` in `frontdoor/fd_wire.js`. While it is `'essentials'`
    the brand and the end of first-run setup open Library → Essentials, and Today is reached by its
    tab; set it back to `'today'` and this line holds as written again.
- **Search button:**
  - Layout: `flex:1; max-width:440px; margin-left:20px; padding:9px 14px; border:1.5px solid --fd-line-strong; border-radius:999px`; background `--fd-surface`; text 13px `--fd-text-dim`.
  - Label: "Search a symptom, drug, or task…".
  - Key hint "⌘K": 11px/600, 1px border, radius 6, padding 1×6.
- **Actions** (`margin-left:auto; gap:8px`):
  - "＋ Ask a question": ghost pill, min-height 36, padding 7×14, 1.5px `--fd-line-strong`, 13px/600 `--fd-text-mid`. Opens the existing capture dialog — it replaces the floating launcher.
  - "✚ Safety": min-height 36, padding 7×15, fill `--fd-danger`, ink `--fd-on-accent`, 13px/700. Unchanged behaviour (`data-fd-safety`).
  - Settings: 36px circle, 1.5px `--fd-line-strong`, glyph ⚙ 15px, `aria-label="Settings"`.
- **Removed from the desktop header:** the week pill. Week changes from Today ("Change week"), Path and Settings (D4, approved).
- **Tab row** (`.fd-tabs`):
  - `padding:6px 40px 0; gap:4px`. Tabs: Today · Path · Library · Patient care resources.
  - Tab: padding 10×16, 14px `--fd-text-mid`, `border-bottom:3px solid transparent`.
  - Active tab: 700, `--fd-teal-deep`, border `--fd-teal`, `aria-current="page"`.

### Phone top bar (< 1000px)
- **One row:** `padding:10px 14px; gap:8px`.
  - ψ tile 32px.
  - Search pill: `flex:1; min-height:44px; padding:0 14px`, 14px, label "Search".
  - "✚ Safety": min-height 44, padding 0 14, 14px/700.
  - Settings: 44px circle.
- **Removed on phone:** the second header row, the week pill and the `.fd-carebtn`.

### Phone bottom bar — `.fd-dock`
- **Container:** fixed to the bottom; height 66px plus `env(safe-area-inset-bottom)`; `display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; padding:6px 6px 8px`; background `--fd-surface-warm`; `border-top:1px solid --fd-line`; `box-shadow:0 -4px 16px rgba(59,51,44,.08)`.
- **Items (fixed meanings):** Today · Path · Library · Care · "＋ Ask".
  - Item: 13px/600 `--fd-text-mid`, radius 10.
  - Active: background `--fd-teal-wash`, `--fd-teal-deep`, 700, `aria-current="page"`.
- **Remove:** `.fd-dock__item--context` (the centre slot that mirrored the primary action), `.fd-dock__browse` (the Library menu duplicating Essentials/Everything/Search) and the floating `.fd-capture-launch--global`.
- **Keep:** the `data-fd-dock-source` attributes. They may still drive analytics and focus logic, but nothing renders from them in the dock.

### Focused learning (Reader and tools) is a mode, not a destination
It keeps the origin tab active and shows a back link ("‹ Today" / "‹ Library", existing `fdReaderBackLabel`), then:
1. one status line,
2. the content,
3. "Mark done" plus the next item,
4. "Next in this thread".

### Page container
- `.fd-main`: max-width 1200; padding `36px 40px 56px` on desktop, `22px 16px 96px` on phone.
- Two-column screens use `display:flex; flex-wrap:wrap; gap:48px`:
  - main column: `flex:999 1 560px; max-width:760px`;
  - rail: `flex:1 1 280px; max-width:320px`.

---

## Screens

### 1. Today — "What should I do now?" (`Screen Today.dc.html`)
**Scenario shown:** week 2, Thursday; an unfinished 10-minute block; 2 reviews due; 2 saved questions. The order is from top to bottom.

0. **Active-testing line** (D1, approved): one line above the eyebrow, `min-height:44px; padding:0 14px; radius 8`; background `--fd-callout`; 1px `--fd-line`; 13px. Content: the existing title "This learning site is in active testing" (700) · a "Details" disclosure that reveals the existing sentence verbatim · the "Share feedback" link. Copy and the no-PHI boundary are unchanged; nothing is removed, only folded.
1. **Place**
   - Eyebrow 13px/600 `--fd-text-mid`: "Week 2 of 6 · Thursday", followed by the link "Change week" (teal-deep 700, opens Settings at the week field).
   - H1: Source Serif 4 700, 34px/1.15, letter-spacing −.01em (28px on phone). Text = the week title (existing behaviour).
   - Theme line: 15px `--fd-text-mid`.
2. **Six-week thread** (`<nav aria-label="Six-week path"><ol>`, new class `.fd-thread`)
   - Layout: six equal columns.
   - Node: 28px circle.
     - Done: `--fd-teal` fill with ✓ 12px/700 on-accent.
     - Current: 2px `--fd-teal` border, a 4px `--fd-teal-wash` halo, and the number in teal-deep.
     - Future: 1.5px `--fd-line-strong`, number in `--fd-text-dim`.
   - Connector: 2px at `top:13px`, from node centre to the next node centre. Teal after a completed week, `--fd-line-strong` otherwise.
   - Labels: week titles 12px/1.3, max-width 14ch, centred. On phone only the current label shows.
   - Each node routes to that week on Path. `aria-current="step"` marks the current week.
   - Margin-bottom 28.
3. **Now card** — one shell for every primary kind (resume, block, read, due, week, ahead, setup)
   - Box: padding `22px 24px 24px`; radius 12; background `--fd-surface`; 1px `--fd-line`; `border-top:3px solid --fd-teal`; shadow `--fd-shadow-card`.
   - Kicker: 13px/700 teal-deep, the existing label ("Pick up where you left off", "Continue · Week N", "Clear what's due", "30-second setup").
   - Title: serif 26px/1.2 (22px on phone).
   - Up to 3 step rows with 22px marks.
   - One button: teal fill, min-height 44, padding 12×22, radius 8, 15px/600.
   - Then one 13px `--fd-text-dim` meta line.
   - Copy in the concept (block): "10-minute block · 1 of 2 steps done"; steps "6 practice questions" (done) and "Psychosis · reading · ~5 min"; button "Continue the block →"; meta "Saved on this device · resumes after reload".
   - The kind chosen is exactly `fdTodayPrimary(...)`. **Do not change `FD_TODAY_PRIMARY_ORDER`.**
4. **Also today** (existing heading "Also today", serif 19px/1.3, margin-top 36)
   - Flat rows: `padding:13px 2px; border-top:1px solid --fd-line`; mark 22px; title 15px/600; meta 13px dim; trailing link 14px/700 teal-deep with a 44px target.
   - Rows: due reviews (olive ring mark with the count) · the week (partly filled teal mark) · saved questions (＋ mark, copy "Saved on this device. No patient details.").
   - These replace the separate `.fd-due` / `.fd-resume` / `.fd-lastread` / capture card styles whenever they are not the primary.
5. **"What am I preparing for?"** (existing `fdTodayPurpose`, **open state preserved**)
   - details: `margin-top:24px; padding:4px 0 18px; border-bottom:1px solid --fd-line`; summary min-height 44, 15px/600.
   - Note verbatim, 13px/1.5.
   - Choices: pill buttons, min-height 44, padding 0 16, 1.5px `--fd-line-strong`, 14px/600. Pressed: teal border, teal-wash background, teal-deep 700.
   - The Prepare-for-tomorrow spec's invitation belongs here, not as a new card.
6. **This week**
   - Existing heading ("Suggested this week" on the MS3 path), with "N of M done" at the right.
   - Rows: `.fd-row` restyled to flat (`padding:12px 2px`, border-top line). Keep `aria-pressed` and the "Mark done: Title" toggle names.
   - Badges:
     - "Pending review": 11px/800, padding 2×8, 1px `--fd-olive`, `--fd-olive-deep` on `--fd-olive-wash`.
     - "tool": 11px/700 on teal-wash.
7. **On the unit this week** (new)
   - Layout: grid `28px | 1fr`, gap 0 14, with a vertical thread line.
   - Kicker: "On the unit this week · Case Journeys, week N".
   - Title: the week title from `longitudinal_case.json` (serif 21).
   - Body: `learnerTask` (15px/1.6 text-mid).
   - Callout: "Carry it to rounds:" + `handoff` (padding 10×14, border-left 3 teal, background callout).
   - Ghost button "Open case week N" → `?tool=one-patient-six-weeks.html&week=N` (existing deep link).
   - Render only when the tool ships for the site and has a matching week.
8. **Rail** (desktop only, gap 32)
   - Safety kit panel: `border-top:3px solid --fd-danger`, 1px line on the other sides, radius `0 0 12 12`. Title serif 17. Rows padding 9×16, title 14px/700, cue 12px dim.
   - Quick tools: flat rows, 14px/600 `--fd-text-mid`.
   - "Learning activity & review →" link.
   - On phone: quick tools become pills after the week, Safety stays in the top bar. The active-testing line stays at the top on both sizes.
9. **Removed from Today:** the seven-day activity strip (D2, approved — move it to Learning activity & review), the daily pick (keep it reachable in the Library) and the `.fd-quicktools--pills` `order:-1` hoist.

**Setup (no week):** the eyebrow reads "Thursday · browsing — no week set", the H1 is "Today", and the Now card becomes the setup card. Kicker "30-second setup"; title "Set your rotation week → get a real Today"; button "Set rotation week".

### 2. Library — "Where can I find this?" (`Screen Library.dc.html`)
- **Header:** H1 "Library" (34px), then one 15px sentence.
- **Controls row** (`flex-wrap; gap:12px 16px`):
  - **Segmented control** (from #950's `.fd-library__views`):
    - Container: `inline-grid 2 cols; padding:3px; radius 10`; background `--fd-chip`; 1px line.
    - Option: min-height 38, radius 8, 14px.
    - Selected: surface background, `box-shadow:0 1px 3px rgba(59,51,44,.12)`, teal-deep 700, `aria-pressed="true"`.
    - Labels: "Essentials · 30", "Everything · 83", using live counts.
  - **Filter field** (new `.fd-library__filter`):
    - Box: `flex:1 1 320px; min-height:44px; padding:0 14px; border:1.5px solid --fd-line-strong; radius 10`; 15px.
    - Placeholder "Filter by title or topic — e.g. delirium, family meeting". "/" focuses it on desktop (shows the `/` kbd chip). "Clear" appears when there is a query.
    - Matches titles and hints in the current view only. Highlight matches with `<mark>` (teal-wash, radius 3).
- **Status line:** 13px dim with `role="status"`, reusing the existing strings ("Showing all 30 Essentials items.", "Showing N readings in X."). Filter adds "N of M items|pages match “q”."
- **Body grid:** `200px | minmax(0,1fr) | 320px` (preview column only in Essentials on desktop); gap 36.
  - **Section index** (`.fd-kit__index` moved to a sidebar): rows padding 9×12, 14px, counts in `--fd-text-dim`. Active: teal-wash background, radius 8, teal-deep 700. On phone it becomes horizontally scrolling chips (min-height 40).
    - Essentials sections are the curator's sections. Everything sections are the `libraryColumns` names (Interactive tools, Acute & safety, Core topics, Clinical skills, Evidence & exam).
  - **Review banner** (when readings are pending): the existing string verbatim, styled with olive-wash, `border-left:3px solid --fd-olive`, 13px/1.5; "What that means" is the existing disclosure.
  - **Group heading:** "Name · count", 13px/700 `--fd-text-mid`, padding-bottom 8, `border-bottom:1px solid --fd-line-strong`. Groups after the first two may start collapsed (min-height 48 header with ⌄).
  - **Row** (both views):
    - `padding:16px 2px; border-bottom:1px solid --fd-line`.
    - Title: serif 600, 19px/1.3. In the Everything view use the compact title: Inter 600 16px.
    - Then the existing summary/hint verbatim (15px/1.55 text-mid).
    - Then meta 13px dim: "Reading|Tool · N min · Week N · Case week N", plus the governance badge if pending.
    - Safety items carry an 8px `--fd-danger` dot.
  - **Preview** (desktop Essentials only; extends the existing transient tool-preview pane to readings):
    - Box: padding 20; radius 12; 3px teal top; shadow card.
    - Content: type · minutes; serif 22 title; summary; "Where it is used" (weeks from `curriculum.json`, case weeks whose `links` include the ref); "Practice with" (from `pairings.json` practice items); "✓ faculty-attested" or the pending badge; full-width teal "Open reading" / "Open tool"; note "Preview is not saved. Reload returns to the list."
    - **Selection stays transient** (not persisted, not in the URL).
- **Zero results:**
  - H2 "No titles match “q”" (serif 22).
  - "This filter checks titles and tool descriptions in the current view. Search also checks summaries and related terms across the library."
  - Primary "Search the library" opens global search with the same query; secondary "Clear filter".
  - Note "Still unsure? ＋ Ask a question saves it on this device for supervision."
- **Filtered footer:** "Not seeing it? Search the library for “q” →".

### 3. Path (`Screen Path.dc.html`, shown with the resident site, week 3 current, previewing week 4)
- Eyebrow "You are in week N of M"; H1 "Path".
- **Route:** `.fd-pathroute` simplified to equal columns.
  - Node 40px with the same marks as the Today thread. Current = partial conic fill. Previewed week = `--fd-selected` background with an inset 3px teal bottom bar.
  - Labels: "Week N · done|this week · X of Y|previewing", title 14px/700, theme 12px.
  - On phone: a vertical list (`40px | 1fr`), themes hidden.
- **Detail card** (max-width 860): "Week N · preview"; serif title; the existing "Demonstrate this week" / "Ask your supervisor" callout; rows; one teal "Set as my week" (only when previewing another week) plus "Back to week N".

### 4. Reader (`Screen Reader.dc.html`, "Mood", week 2)
- Back link; grid `220px | 1fr`, gap 48.
- TOC "On this page": serif 15/700 label; items padding 7×10, 14px; current section teal-wash. On phone it collapses into one 48px disclosure row.
- **Article** (max-width 680):
  - **One status line**, 13px: "Reading · 5 min" (700) · "Week 2 · 2 of 5" · "✓ faculty-attested" (teal-deep 700) · the existing receipt "Reviewed by … · date". Strings unchanged; the separate pill presentation goes. A pending page shows the existing pending notice **above** the H1, and pending-high stays `role="alert"`.
  - H1: serif 40px (30px on phone).
  - Lead: 19px/1.65 text-mid.
  - The practice panel folds to one 52px row ("On the Unit Practice and Tools" + its cue line).
  - Body 18px/1.72 (17px on phone); H2 serif 24.
  - Sections fold exactly as `makeCollapsible()` does today; it never runs on crisis pages.
  - End: teal "Mark done" (`aria-pressed`) · "Next in week N: Title →" · "Next in this thread": 2–4 rows (page practice link, this week's case step, next week item).

### 5. Case Journeys (`Screen Case.dc.html`, tool `08_Cases_and_Simulation/one-patient-six-weeks.html`) — **Phase 3, requires re-attestation**
- **Above the frame (shell):** the receipt or the pending notice.
- **Masthead:**
  - Kicker "Longitudinal case arc"; H1 "One Patient, Six Weeks"; the sub sentence verbatim.
  - Boundary note verbatim: padding 11×14, `border-left:3px solid --fd-olive`, olive-wash background.
- **Grid:** `230px | 1fr | 270px`, gap 36. In compare mode it is `230px | 1fr` and the aside moves under the card.
- **Timeline** (`<nav aria-label="Six-week case timeline"><ol>`):
  - Header: "N of 6 weeks completed" + "Checklist progress saved in this browser only".
  - Items: 26px node, 2px connector, "Week N" 12px/700, title 14px. The current week gets a teal-wash background. Week 5 is tagged "✚ safety" in `--fd-danger-dark`.
  - On phone: a horizontal 6-node stepper; week 5 has a danger outline.
  - Button below: "Compare two weeks".
- **Week card:**
  - Header: "Week N" plus "In progress · X of 3 practiced"; serif 28 title; focus tags as dotted text.
  - "What changes in the story" block: border-left 3 `--fd-line-hover`, callout background, 16px/1.6.
  - "Your learning task:" paragraph.
  - **Try → Compare → Mark practiced**, for each existing checklist item:
    - Prompt; step line "✓ Try · ● Compare · ○ Mark practiced".
    - Ghost button "Compare with one way to say it" (`aria-expanded`) reveals the existing `example` (teal-wash block, label "One way to say it").
    - Then a teal "Mark as practiced". This sets the existing `checks.cN` and is the screen's single primary.
    - Optional ghost "＋ Bring to supervision" (Phase 3 bridge into capture: same-origin postMessage, allow-listed fields, prompt text only).
    - Instruction line: "Try each one first — aloud or on paper. Then compare with one way to say it. Nothing you think or say is stored." This is new microcopy and needs faculty review.
  - "Pause and reflect" disclosure; "Carry it to rounds:" callout.
  - Navigation: "← Previous week"; "Next week →" disabled until all checks are set, with the existing text "Complete the checklist to unlock the next week."
  - Footer: the existing storage sentence + "Reset local journey" as a quiet underlined link (not red; keep the confirm).
- **Compare mode:** two week selectors, then rows Focus / What changes in the story / Carry it to rounds, side by side (`repeat(auto-fit,minmax(240px,1fr))`, stacking on phone). Plus that week's reflection prompt. Every string comes from `longitudinal_case.json`.
- **Aside:** "Practice this part of the story" (existing heading). Rows from `links` (tool = teal dot, page = outlined dot; type label; tool hint), then "Opens in place. Back returns to week N." and a "Next week on the thread" box.
- **Unchanged:** `cw_longitudinal_v1` (`{version:1,current,completed:{weekN:{checks:{c0..c2},at}}}`), `?week=N`, the crisis-block marker and `longitudinal_case.json`.

### 6. Search (`Screen Search.dc.html`)
- **Dialog:** `margin:12px 10px 0` on phone (the existing `.fd-searchpanel` on desktop); radius 16; `border-top:3px solid --fd-teal`; input row min-height 56 with "Close" (44px).
- **Results in groups:**
  1. Safety protocols (label in `--fd-danger-dark`, red dots, the kit's own cue lines; the first result on a danger-wash background).
  2. Pages (outlined dot; meta "Reading · section · Weeks…").
  3. Tools (teal dot; the existing hint).
- **Footer:** "Searches page and tool titles, summaries, and related terms. Not here? ＋ Ask a question saves it for supervision."
- Esc or Close returns focus to the opener (existing `restoreInvoker` rules).

---

## Interactions & behaviour
- **Keyboard:** 1–4 switch destinations; "/" or ⌘K opens search (outside text fields; in the Library "/" focuses the filter); Esc closes the top layer; ←/→ move through items in the Reader; a skip link to main appears on every screen. Tab order follows visual order.
- **Focus:** `outline:3px solid var(--fd-focus); outline-offset:2px` on every interactive element, in both themes.
- **Targets:** 44px on touch, 24px minimum on fine pointers (keep the existing `.fd-check::after` overlay).
- **Motion:** 120ms colour/border transitions and 180ms disclosure. Remove the row entrance stagger (`fdFadeUp` with `animation-delay`) on Today. Under `prefers-reduced-motion: reduce`, no animation at all.
- **Responsive:**
  - The ≥1000px threshold stays: tabs and rail on desktop, top bar and bottom bar below.
  - No horizontal overflow at 320px or at 200% text size. Keep the `align-self:stretch` row-title fix and the 320px pin in `front-door.spec.js`.
- **History:**
  - Destination and Library view route as they do today.
  - Section, filter and preview are transient. Restore them on Back and Forward via `history.replaceState` on the Library entry (D3, approved); reload still resets them; never in the URL or storage.
  - `?page=`, `?tool=`, `&week=`, `&case=` deep links are unchanged, and Back restores the origin's scroll.
- **Loading, error and unavailable states:** use the existing governance "Review status unavailable—verify with faculty" and the existing fallbacks. A tool that fails to load shows its own empty message.

## State management
- **No new persisted state.**
- **Existing stores, unchanged:** the block store, question-bank capsule, SRS due counts, `cw_last`, week-scoped done map (#949), capture list, `cw_longitudinal_v1`, theme mode.
- **New transient UI state** (shell memory, reset on reload): `libraryFilter` (string), `libraryIndexSection` (existing `kitSection`), `libraryPreviewRef` (existing `kitToolPreview`, widened to readings), `caseCompare` (`{a,b}` inside the tool).
- **Derived data (pure functions over the existing index):**
  - `usedIn(ref)` → weeks from `curriculum.json` `learningPaths` + case weeks whose `links[].target === ref`.
  - `practiceWith(ref)` → `pairings.json` items with `role:'practice'` in pairings that contain `ref`.
  - `weekCaseStep(week)` → `longitudinal_case.json.weeks[week-1]` when the tool ships for the site.

## Design tokens (existing `clinical-warm.css` values — no new colours)

| Role | Token | Light | Dark |
|---|---|---|---|
| Action fill | --fd-teal | #3a7d6e | #5fa392 |
| Action ink | --fd-teal-deep | #2c6356 | #7fc0ae |
| Action wash | --fd-teal-wash | #edf4f2 | #1d332e |
| Review fill | --fd-olive | #8b7040 | #c0a06a |
| Review ink | --fd-olive-deep | #725b35 | #d8bb87 |
| Review wash | --fd-olive-wash | #f7f0e2 | #332a1c |
| Safety fill | --fd-danger | #a34132 | #d97a68 |
| Safety ink | --fd-danger-dark | #8f372a | #e8917f |
| Safety wash | --fd-danger-wash | #fbefec | #3a231f |
| Brand (ψ only) | --fd-terracotta | #a9634b | #d08a6f |
| Page | --fd-bg | #f6f3ee | #211d1a |
| Surface | --fd-surface | #ffffff | #2a2521 |
| Warm surface | --fd-surface-warm | #fffdf9 | #2f2a25 |
| Callout | --fd-callout | #fbf8f3 | #2b2620 |
| Chip | --fd-chip | #f1ece6 | #332c26 |
| Selected | --fd-selected | #f3ebe5 | #3a2b24 |
| Hairline | --fd-line | #ebe5da | #3a332c |
| Control line | --fd-line-strong | #ddd3c6 | #4a4139 |
| Hover line | --fd-line-hover | #c8baa7 | #5d5248 |
| Text | --fd-text | #3b332c | #ece5db |
| Text mid | --fd-text-mid | #64574b | #bcb0a2 |
| Text dim | --fd-text-dim | #76695d | #a2968a |
| On fill | --fd-on-accent | #ffffff | #211d1a |
| Focus | --fd-focus | #2f6fd0 | #7aa2ff |

**Colour rules:**
- Fill tokens are never text colour (existing ROLE RULE, `bin/check_design_drift.py`).
- One filled teal button per screen.
- Red only for Safety, the kit, crisis and high-risk pending.
- `--fd-success` becomes an alias of `--fd-teal` (D6, approved).

**Type:**
- Display: Source Serif 4 600/700 (self-hosted, `fonts/source-serif-4-latin-opsz-wght600-700.woff2`).
- UI: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`.

| Use | Spec |
|---|---|
| Page title | 34/40 (phone 28); add `--fd-font-4xl: 34px` |
| Reader H1 | 40 (phone 30) |
| Card title | 26/32 (`--fd-font-2xl`; phone 22) |
| Section | 19/25; add `--fd-font-section: 19px` |
| Reading body | 18/1.72 at max 62ch (phone 17) |
| Row title | 15/600 |
| Meta | 13 |
| Labels | 12–13/700, sentence case — no uppercase tracking |
| Badges | 11/700–800 |

**Spacing, shape, elevation:**
- Spacing: existing `--fd-space-1…10` (2,4,6,8,10,12,16,20,24,28) plus new `--fd-space-11: 32px`, `-12: 40px`, `-13: 48px`, `-14: 64px`.
- Radius: 8 controls · 10 segmented/notices · 12 cards/sheets · 16 search dialog · 999 badges and chips · 50% marks.
- Elevation: `--fd-shadow-card` (`0 1px 2px rgba(59,51,44,.05), 0 8px 24px rgba(59,51,44,.04)`; dark `0 1px 2px rgba(0,0,0,.35), 0 8px 24px rgba(0,0,0,.3)`) on one surface per screen only; bottom bar `0 -4px 16px rgba(59,51,44,.08)`.

**Status marks (22px unless noted):**

| State | Mark |
|---|---|
| Not started | 1.5px `--fd-line-strong` ring |
| In progress | 2px teal ring with a conic teal fill (share done) |
| Done | teal fill with ✓ |
| Reviews due | 2px olive ring with the count |
| Pending faculty review | olive "Pending review" badge |
| High-risk pending | red "Pending review · High risk" badge |
| Safety content | 8px red dot |

## Component → existing class map

| Component | Implement in |
|---|---|
| App bar | `.fd-header__bar` (fd_shell.js `fdHeader`) |
| Destination nav | `.fd-tabs` / `.fd-dock` (`fdTabs`, `fdDockModel` — drop `context` and `browse`) |
| Now card | `.fd-continue` + the primary faces in fd_block.js / fd_due.js (one shell) |
| Row | `.fd-row`, `.fd-kit__reading`, `.fd-collink` |
| Segmented control | `.fd-library__views` |
| Filter field | new `.fd-library__filter` in fd_library.js |
| Section index | `.fd-kit__index` |
| Disclosure | `.fd-purpose`, `.fd-kit__group` |
| Thread | `.fd-pathroute` + new `.fd-thread` (Today, case timeline) |
| Next in this thread | new `.fd-nextthread` (fd_reader.js) |
| Try → Compare | inside `one-patient-six-weeks.html` (Phase 3) |
| Notices | spa_index.html governance renderers (strings unchanged), `.fd-pilot`, crisis block untouched |

---

## Rollout (one PR per phase; each reverts with one commit; no data migration)

### Phase 1 — Shell and Today (no content files)
**Files:** fd_shell.js, fd_today.js, fd_wire.js (dock wiring), spa_index.html ("Also today" assembly, capture mount), frontdoor.css, clinical-warm.css (new size/space tokens, success alias), CLASS-INVENTORY.md, tests (fd-shell, fd-today, shell-copy, spa-shell-a11y, front-door.spec, tool-expand.spec), baselines via the workflow.

**Acceptance:**
- [ ] Exactly one filled teal button on Today for each primary kind (resume, block, read, due, week, ahead, setup). It is first after the heading and inside the first screen at 390×844 and 1280×800. Tested with controlled fixtures.
- [ ] `FD_TODAY_PRIMARY_ORDER` and its picker-table test are unchanged. An interrupted block or capsule still leads after reload, and due reviews still outrank Continue.
- [ ] The preparation chooser keeps its open state, copy and session-only choice, and never changes the primary.
- [ ] The same four destinations, labels and order at 320, 390, 768 and 1280px. Safety is visible at all of them, and Search is one activation away from every screen.
- [ ] 1–4, "/", ⌘K and Esc work. Focus returns to the invoker. The active destination has `aria-current`. Landmarks: banner, nav, main, complementary.
- [ ] axe reports no serious or critical issues. Contrast: text ≥ 4.5:1; controls and the focus ring ≥ 3:1, in both themes.
- [ ] At 200% text and at 320px width there is no horizontal scroll and nothing is clipped. With reduced motion there is no animation.
- [ ] Back, Forward and reload keep the destination, Library view and reading place. Every ?tab / ?page / ?tool link resolves.
- [ ] `check_governance_separation.py` is clean, `check_attestation_hashes.py` shows zero new drift, `verify.sh` and both site gates pass, and CLASS-INVENTORY is updated in the same PR.

### Phase 2 — Library (no content files)
**Files:** fd_library.js, fd_search.js, fd_data.js (derived usedIn/practiceWith), fd_wire.js, frontdoor.css, CLASS-INVENTORY.md, tests (fd-library, essentials-inventory helper, front-door.spec).

**Acceptance:**
- [ ] Every shipped page appears in Everything once (essentials-inventory helper). Counts match `shipped_pages.json` per site, and Essentials stays a view of the Library.
- [ ] The filter updates as you type, announces "N of M" through the existing status line, and hands zero results to Search.
- [ ] Section and filter are restored on Back/Forward from `history.state` (D3), reset on reload, and never written to the URL or storage. Preview stays transient.
- [ ] Pending and high-risk badges appear verbatim on every row they apply to, and summaries are byte-identical to topic_meta.
- [ ] Opening an item and pressing Back returns to the same view, section and scroll.
- [ ] All Phase 1 accessibility, zoom, motion and history criteria still hold.

### Phase 3 — Focused learning and the case thread (**content change → re-attestation**)
**Files:** fd_reader.js and spa_index.html (status line, Next in this thread); `08_Cases_and_Simulation/one-patient-six-weeks.html` (timeline, Try → Compare, compare weeks, optional capture bridge). Register the ledger row as **pending** in the same PR: registration, not promotion. Faculty re-attest through the console.

**Acceptance:**
- [ ] Existing `cw_longitudinal_v1` progress renders identically with no migration, and `?week=N` works.
- [ ] Prompts, examples, reflection, handoff and links render verbatim from `longitudinal_case.json`. Any new microcopy is listed in the PR for faculty review.
- [ ] No learner free text, recording or new storage. The reveal is a button with `aria-expanded`, and the next-week lock is unchanged.
- [ ] The crisis-block marker is present and nothing collapses it.
- [ ] Learners see the existing pending notice until re-attestation: "Pending faculty review / Content changed since faculty review on 2026-09-21; awaiting re-attestation." Tests use governance fixtures.
- [ ] From a linked page, Back restores the week and scroll.

## Re-attestation summary
| Change | Re-attest? |
|---|---|
| Shell layout, navigation, Today/Library/Path/Reader/Search | No (shell is not an attested source) |
| Token roles, tool palette (#951) | No (build-injected; sources unchanged) — faculty visual spot-check of safety tools recommended |
| Showing summaries/hints, "Used in", "Practice with" | No, if verbatim and derived (no edits to `topic_meta.json`, `pairings.json` or `longitudinal_case.json`) |
| Case Journeys tool HTML | **Yes** — attested 2026-09-21; any edit drifts its contentHash |

## Owner decisions (answered 2026-10-04)
| ID | Decision | Answer | Affects |
|---|---|---|---|
| D1 | Active-testing banner | **Keep it at the top, shrunk to one line** (title · Details · Share feedback; sentence verbatim behind Details) | Phase 1, Today |
| D2 | Seven-day activity strip | **Move to Learning activity & review** | Phase 1, Today |
| D3 | Library section/filter on Back | **Restore from the history entry** (`history.state`; never URL/storage; reload resets) | Phase 2 |
| D4 | Week control | **Today, Path and Settings only** — remove the header week pill | Phase 1, shell |
| D5 | Case Journeys | **Scheduled for Phase 3**; existing pending notice shows until faculty re-attest | Phase 3 |
| D6 | Done colour | **Teal** — alias `--fd-success` to `--fd-teal` | Phase 1, tokens |

## Assets
- `13_Faculty_Resources/_automation/site_build/fonts/source-serif-4-latin-opsz-wght600-700.woff2` + OFL licence: copied from the repo, already shipped.
- `tests/smoke/baseline/*.png`: the repo's committed CI baselines (the "before" state; they predate main's 1 Oct pass).
- `audit/shots/*.png`: 26 Sept device captures from the repo's `_to_delete/` folder.
- Glyphs (ψ ✚ ⚙ ✓ ⌄ ‹ → ＋) and the search SVG are the ones the shell already uses. No new icons.

## Files in this bundle
- `Library Redesign.dc.html` — the full proposal: audit, overlap, direction, all concepts, before/after, flows, system, governance, rollout, decisions.
- `Screen Today.dc.html` — props `theme` (light|dark), `device` (desktop|mobile), `scenario` (block|setup).
- `Screen Library.dc.html` — props `theme`, `device`, `view` (essentials|everything), `state` (default|filtered|empty).
- `Screen Path.dc.html` — props `theme`, `device` (resident site, week 4 preview).
- `Screen Reader.dc.html` — props `theme`, `device` ("Mood").
- `Screen Case.dc.html` — props `theme`, `device`, `mode` (practice|compare|pending).
- `Screen Search.dc.html` — prop `theme` (phone overlay).
- `support.js` — runtime needed to open the `.dc.html` files locally.
- `PROMPT.md` — a kickoff prompt for Claude Code (Phase 1).
- `screenshots/` — one PNG per concept screen (desktop light; Search is phone light).
- `README_MEDIA.md`, `PROMPT_MEDIA.md`, `Media Integration.dc.html`, `media_map.draft.json` — podcast & book integration ("Beyond this page"), a separate track that builds on the Reader.
