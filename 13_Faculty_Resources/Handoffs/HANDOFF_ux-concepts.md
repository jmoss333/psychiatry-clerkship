# Handoff — Clerkship Hub UX concepts → build

**For:** Claude Cowork (build into the deployed SPA)
**Design source:** `Clerkship UX Concepts.dc.html` (tabbed prototype: Start here · Progress home · Bedside mobile)
**Host app:** `clerkship-hub-deploy/` — vanilla SPA, `index.html` shell + markdown content + iframe tools
**Prepared:** 2026-07-01 · for Joshua Moss, MD
**Nature:** additive UX layer. No teaching content or existing tool is changed.

---

## 0 · What already exists in the shell (build on these, don't reinvent)

From `index.html`:

- **Nav model.** Sidebar sections render buttons: `b.className='navitem'`, `b.setAttribute('data-f', it.f)`, `b._item=it`, where an item is `{t: title, f: filename, k: 'topic'|'tool'}`. `openByFile(f)` finds the matching `.navitem` and calls `show()`.
- **Routing.** `setRoute()` writes `?page=<f>` (topics) or `?tool=<f>` (tools); boot reads `location.search` `page||tool` → `openByFile`; `popstate` does the same; a `message` listener handles `{type:'openPage'|'openLibrary'|'search'|'theme'|'ic-size'}`. **Open a tool/page in-app by clicking its `.navitem[data-f]`** — that's the one primitive everything reuses.
- **Modes.** `.modetoggle` switches **Path** (`showPath()` → loads `tools/learning-path.html` in an iframe) vs **Library** (`reflectLibrary()` → normal browsing). Persisted at `localStorage.cw_mode`.
- **Progress + SRS (already implemented, underused).**
  - `cw_progress_v1` = `{ "<file>": { done:true, at:"YYYY-MM-DD" } }`. Helpers: `progLoad/progSave`, `reviewedCount(p)`, `topicCount()` (counts `topic_meta` entries that have a `quiz`).
  - `cw_srs_v1` = `{ v:1, cards:{ "TOPIC#<file>":{ease,ivl,reps,lapses,due,last} }, day:{lastDay,newToday}, stats:{streak,lastStudy,totalReviews,correct,seen}, settings:{newPerDay:12} }`. `seedSRS(file)` runs on **Mark reviewed**.
- **Per-topic metadata.** `topic_meta.json` keyed by file: `{ read, hy (high-yield bool), tldr, points[], cant, ruleOut[], firstMove, quiz{q,o[{t,c}],why}, cta{href,label} }`. `buildTpl()` renders the "In 30 seconds / Can't miss / mini-tree / Test yourself / Mark reviewed" block.
- **Faculty review status.** `reviewed.json` (`{items:{...}}`) drives the tool `toolrev` attestation bar.
- **Theme.** `cw_theme` (`light`/`dark`) with a full `[data-theme="dark"]` token remap. Tokens: `--bg --bg-alt --surface --border --primary(-dark/-light) --accent(-dark/-light) --text(-mid/-light) --warning/-light --success/-light --danger/-light --info/-light --on-brand`.
- **Mobile.** ≤820px the `aside` becomes an off-canvas drawer (`.open`) with `#menuBtn` + backdrop.

**The concepts are designed to consume these directly** — the data for Progress home already exists in `cw_progress_v1` + `cw_srs_v1` + `topic_meta.json`.

---

## 1 · Concept A — "Start here" landing (first-run orientation)

**Goal:** orient a day-1 student; explain Path vs Library; capture track + week.

**Build:**
1. Add a landing view rendered into `#content` (not markdown) — e.g. a `renderStart()` that emits the same HTML the mock shows.
2. **Boot rule:** on load, if there is no `?page`/`?tool` in the URL **and** `localStorage.cw_seen_start` is unset → show Start here instead of the first nav item. Set `cw_seen_start='1'` once dismissed/actioned. Add a permanent **"Start here"** item at the top of the nav (and/or a small link in the sidebar header) so it's reopenable.
3. **Mode cards:** "Follow the Path" → `showPath()`; "Browse the Library" → `reflectLibrary()` + open the first topic.
4. **Track + week pickers:** write `cw_track` (`MS3` default) and `cw_start_week` (int). These feed Concept B. The `14_Tracks/` content can later filter nav by track — out of scope here, just store the value.
5. **First-day checklist:** each item deep-links to a real file — orientation packet (`?page=orientation.md`), Interview & MSE pocket guide (`?page=pg_interview.md`), MSE tool (`tools/mse.html` via its `.navitem`). Tick state in a small `cw_firstday` object (or reuse `cw_progress_v1`).
6. **Quick tools row:** reuse the launcher-badge registry + `launchTool()` routing.

---

## 2 · Concept B — Progress & Next-up home

**Goal:** one "where am I / what's next" screen. **Almost entirely computed from existing storage.**

**Data mapping (no new tracking needed):**
- **Reviewed ring** = `reviewedCount(progLoad())` / `topicCount()`.
- **Due today** = `cw_srs_v1.cards` where `due <= Date.now()` (count + list; label overdue if `due` < start-of-day). "Start review" → open `tools/review.html`.
- **Streak** = `cw_srs_v1.stats.streak`.
- **Shelf countdown** = days between today and a configurable exam date — add `cw_shelf_date` (set it from Start here or a settings field; fall back to end of Week 6).
- **High-yield · not yet reviewed** = `topic_meta` entries with `hy:true` whose file is **not** `done` in `cw_progress_v1`; tag each with its week/section from the nav model. Items → `openByFile`.
- **Continue where you left off** = last viewed route. The shell already tracks `currentItem` and a `SCROLL` map — persist the last item to `cw_last` on `show()` and restore scroll. "Resume" → `openByFile(cw_last)`.
- **Six-week arc** = curriculum sections; mark done/current from `cw_start_week` + progress.
- **Coverage by section** = group `cw_progress_v1` done-files by their nav section; `% = done/total` per section.

**Wire as:** the default view of **Path** mode (a real home screen instead of jumping straight into the iframe), and/or a **"Home"** nav item. Empty states matter — a brand-new user has 0 reviewed; show an encouraging first-step instead of zeros.

---

## 3 · Concept C — Bedside mobile tool bar

**Goal:** phone-first, one-thumb access to the tools a page maps to.

**Build:**
1. A **fixed bottom bar**, rendered only at ≤820px (desktop keeps the floating launcher dock). List the 3–4 tools mapped to the current page + a **"More"** button.
2. **Page→tools map:** reuse the launcher-badge registry and the per-page placement map (Withdrawal→CIWA, Suicide/Safety→C-SSRS+Violence+Decision Aids, etc.). Same icons, same `data-tool` keys.
3. **Activation:** reuse `launchTool()` (`.navitem[data-f]`.click → iframe `postMessage {type:'openPage',f}` → `?tool=` fallback). "More" opens a bottom sheet listing all 14 tools.
4. **Layout safety:** honor `env(safe-area-inset-bottom)` so it clears the home indicator; don't collide with `#menuBtn`/drawer; **hide the bar when a tool is already open full-screen** (`#content.toolmode`) so it doesn't stack on itself.
5. Tokens + focus halos from the badge component; ≥44×44 targets; wrap motion in `prefers-reduced-motion`.

**Shares one source with the launcher badges** — build the registry + `launchTool()` once and let both the desktop dock and the mobile bar consume it.

---

## 4 · Dependencies & data to add

- **Bundle `marked` locally.** `index.html` loads it from cdnjs — on ward wifi that can blank the whole app. Vendor it so the hub renders offline. (Not a concept, but it blocks all three on the unit.)
- New localStorage keys introduced: `cw_seen_start`, `cw_track`, `cw_start_week`, `cw_shelf_date`, `cw_last`, `cw_firstday`. All optional with sane fallbacks; never clear existing keys.
- `topic_meta.json` already carries `hy` and `quiz` — confirm high-yield flags are set on the topics you want surfaced pre-shelf.

---

## 5 · Suggested phasing

1. **Progress home** first — highest value, and it's mostly reading data that already exists.
2. **Start here** — small, unblocks orientation and sets `cw_track`/`cw_start_week` that Progress home uses.
3. **Bedside bar** — build alongside the launcher badges so they share one registry/routing module.

## 6 · Acceptance checklist

- [ ] Start here shows on true first run only; reopenable; mode cards drive `showPath()`/`reflectLibrary()`; track + week persist.
- [ ] Progress home numbers reconcile with `cw_progress_v1` / `cw_srs_v1` (reviewed ring, due-today, streak); empty state is graceful.
- [ ] "Start review" opens `review.html`; high-yield + continue items open in-app via `openByFile`.
- [ ] Mobile bar appears only ≤820px, reflects the current page's tools, clears the home indicator, hides in `toolmode`, and opens tools in-app.
- [ ] Everything themes via tokens in light + dark; no hard-coded `#fff`/`#000`; reduced-motion respected.
- [ ] `marked` served locally; hub renders with the CDN blocked.
- [ ] No regression: existing nav, routing, tools, and progress untouched.

---

*Visual reference: open `Clerkship UX Concepts.dc.html` and switch tabs. Sample data in the mock is illustrative — real values come from the storage/JSON mappings in §2.*
