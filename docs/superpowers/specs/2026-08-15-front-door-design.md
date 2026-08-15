# Front Door — shell rewrite (design)

**Date:** 2026-08-15
**Status:** approved, pending implementation plan
**Source design:** Claude Design project `9d05222d-1bec-4365-9202-6ef2affa6297`,
file `Front Door - Hi-Fi v2.dc.html` + `design_handoff_clerkship_front_door/README.md`
**Fidelity:** high — colors, typography, spacing, copy, and interactions in the handoff are final.

---

## 1 · What this is

The design replaces the SPA shell with a "front door": a student sets role + rotation week once
(device-local, no account), then gets a week-aware **Today**, a six-week **Path**, a full
**Library**, global search with clinical synonym expansion, an in-place reading pane, and a
crisis-first **Safety kit** side sheet. Desktop (≥1000px) adds sticky rails; phone keeps a compact
single column.

The current shell (`13_Faculty_Resources/_automation/site_build/spa_index.html`, 2,274 lines) is
replaced. Features that earn their place are ported; the rest are deleted.

### Decisions taken

| Decision | Choice |
|---|---|
| Relationship to existing shell | **Replace it**, porting what earns its place |
| Library coverage | **All 88 shipped pages**, remapped into the design's 5 columns |
| SRS due counts + question bank | **Port, prominent** |
| Ward capture + triage | **Port, prominent** |
| Progress & mastery | **Port, demoted** — a reading-pane page, not a fourth tab |
| Ward dashboard / mode companion | **Cut from v1** — superseded by Today |
| Dark mode | **Keep** — derive dark tokens for the new palette |
| Role picker | **Site-scoped role lists** (MS3 build and resident build differ) |
| Implementation | **Marker-injected modules** via `common.py` `SNIPPET_MARKERS` |
| Week/item source of truth | New `curriculum.json` (structure only), joined to `topic_meta.json` |
| `learning-path.html` | **Retired** — the Path tab is a strict superset |

Governance/attestation notices, crisis blocks, and the faculty-console preview route are ported
regardless of the triage above: the first two are compliance surfaces and the third is a hard
dependency of `faculty-console/`.

---

## 2 · Deviations from the prototype

These are forced by the codebase or are prototype defects. Everything else in the handoff is
implemented as specified.

### 2.1 Routing stays URL-based

The handoff specifies in-place, "browser-free" navigation. That cannot ship here. Deep links via
`?page=<slug>.md` and `?tool=<slug>.html` are load-bearing for:

- `topic_meta.json` `cta[]` entries (e.g. `?tool=decision-aids.html`, `?page=collateral_workflow.md`)
- every `01_Six_Week_Curriculum/Week_*/README.md`
- `communicationHref()` / `familyAction()` deep links carrying `&case=`, `&scenario=`, `&resume=1`
- the faculty-console preview route (`spa_index.html:877`, `:919`)
- `tests/smoke/nav-crawl.spec.js`

`history.pushState` + the `popstate` handler are kept. The design's felt behavior is unchanged —
the back link still returns to the originating tab, and closing a sheet or search still lands the
student exactly where they were. Browser back additionally works.

**Routed state:** open item (`?page=`/`?tool=`) and tab (`?tab=today|path|library`, omitted for the
default). **Transient (never routed):** `searchOpen`, `query`, `sheet`, `sheetFrom`, `stepsDone`,
`justDone`, `justCelebrate`, `navDir`, `nudge`, `ringPct`, `desk`.

`tab` and `openId` are both routed *and* persisted, so precedence is explicit: **on load the URL
wins when it carries `page`/`tool`/`tab`; persisted values are the fallback for a bare URL.** A
shared deep link therefore always opens what it names, and a returning student with no query
resumes where they were.

### 2.2 State is not duplicated

The prototype invents `pcl-frontdoor-v1` holding all state. Two problems: the key violates the
namespace rule (`check-static-site.mjs:345` hard-fails any key in `index.html` not prefixed
`cw_`/`rp_`), and three of its fields already have homes that would silently desync.

| Prototype field | Existing home | Action |
|---|---|---|
| `done` (map id→bool) | `cw_progress_v1` (`progLoad`/`progSave`) | **Reuse** |
| `streak`, `lastDay` | `cw_srs_v1.stats.streak` | **Reuse** |
| `week` | `cw_rotation_start` → `rotationWeek()`; `cw_start_week` manual override | **Reuse** |
| `role`, `tab`, `viewWeek`, `openId`, `fromTab`, `scrollPos` | none | **New** → `cw_frontdoor_v1` |

The daily pick needs no persisted field: it derives from the local day index, so it is already
stable within a day and caching it would only add a staleness bug.

The design marks both reads *and* tools done, whereas `cw_progress_v1` today only records "Mark as
read" on content pages. It is extended to hold tool slugs in the same map, keyed by shipped slug —
the same key space, not a parallel one. Existing entries remain valid, so no migration is needed.

First-run detection reads the **existing** keys: a student who already set a rotation start never
sees the wizard.

### 2.3 Dates are local, not UTC

The prototype computes the streak day as `new Date().toISOString().slice(0,10)` (line 615) and the
daily pick as `floor(Date.now()/86400000)` — both UTC. For a US Eastern user the day boundary lands
at 7–8pm: the daily pick rotates after dinner and streak arithmetic can attribute an evening
session to the next day.

This repo already has the answer. `shelfDaysUntil()` is the documented single legal local-midnight
parse site (`spa_index.html:2022`), and the phase-chip contract bans inline midnight-suffix date
parses — *including in comments* (`tests/phase-chip.test.mjs`). Both the streak boundary and the
daily-pick index derive from the local-date helper. No new date parsing is introduced.

### 2.4 Light-only palette gains a dark counterpart

The handoff specifies one light palette. The shell ships a dark theme (`cw_theme`, `data-theme`,
`clinical-warm.css`) that all 21 tools inherit. The design's colors are expressed as CSS custom
properties in `clinical-warm.css` with dark counterparts, so the toggle survives and a tool opened
from the front door does not disagree with it visually.

### 2.5 Role lists are per-site

The handoff's step 1 offers MS3 / Sub-I MS4 / Resident / Nursing·SW·family. Audience is already
split at the site level (`une-ms3-psychiatry`, `mmc-psychiatry-residents-sanford` — two Netlify
builds from this tree). Offering "Resident" on the MS3 build either dead-ends or has to link
off-site. Role lists are therefore build-injected per site from `curriculum.json`, and role only
tunes the greeting and defaults.

### 2.6 Shared shell copy is audience-neutral

`tests/shell-copy.test.mjs` bans the tokens `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford`
from shell copy that ships identically to both sites without passing through
`RESIDENT_REBRAND`. `phase_policy.js:5` states the house resolution: *"labels ship to both sites —
audience-neutral, 'Exam', never 'Shelf'."*

Two consequences for the handoff's copy:

- The shelf countdown becomes **"· exam in ~N days"** and **"· exam day — good luck"**. The
  behavior (days to Friday; week 5 adds 7) is unchanged.
- Brand and role strings — the header wordmark and the step-1 role list — are **build-injected per
  site** rather than literal, joining the existing per-site role lists from §2.5.

Any other new shared string added during implementation must pass the same token scan, and
`extractShellCopy()` in that test gains extractors for the front door's shared strings.

---

## 3 · Architecture

Nine new sources under `13_Faculty_Resources/_automation/site_build/frontdoor/`, each registered in
`common.py` `SNIPPET_MARKERS` and injected into a single `index.html` at build time. The shipped
artifact remains one file, so offline/service-worker/hosting behavior is unchanged.

| Module | Marker | Responsibility |
|---|---|---|
| `fd_state.js` | `/*__FD_STATE__*/` | State load/persist/migrate; pure engagement functions (streak rollover, daily-pick rotation, shelf countdown, ring interpolation) |
| `fd_shell.js` | `/*__FD_SHELL__*/` | Sticky header, tab row, first-run wizard, keyboard map, event delegation, boot |
| `fd_today.js` | `/*__FD_TODAY__*/` | Continue card + ring, due row, this-week list, daily pick, desktop quick-tools and safety rails, capture triage |
| `fd_path.js` | `/*__FD_PATH__*/` | Six-week timeline + week detail card |
| `fd_library.js` | `/*__FD_LIBRARY__*/` | Five-column index over all 88 shipped pages |
| `fd_reader.js` | `/*__FD_READER__*/` | Article pane, week navigator rail, prev/next footer, mobile action bar |
| `fd_search.js` | `/*__FD_SEARCH__*/` | ⌘K / `/` overlay, synonym expansion, ranking, cap-at-8 |
| `fd_sheet.js` | `/*__FD_SHEET__*/` | Safety kit list, protocol view, item preview, post-protocol nudge |
| `frontdoor.css` | `/*__FD_CSS__*/` | Layout + component CSS. **Tokens live in `clinical-warm.css`** with dark counterparts |

`inject_shared_snippets()` is idempotent and `page_contract_failures()` turns a skipped injection
into a hard build failure — both already exist and are extended, not modified in shape.

Each module exposes a small named surface on a single `FD` namespace object and holds no reference
to another module's internals. Renderers return HTML strings (the shell's existing idiom); event
handling is delegated from `fd_shell.js`.

---

## 4 · Data model

### 4.1 `curriculum.json` (new, repo root)

Structure only, seeded from `learning-path.html`'s `WEEKS[]`. Paired with `curriculum.schema.json`
and `13_Faculty_Resources/_automation/validate_curriculum.py`, following the repo's existing
validator convention.

Holds:

- `weeks[]` — `{n, title, theme, items:[{ref, kind}]}` where `ref` is a shipped slug
- `libraryColumns[]` — `{name, accent, refs[]}` for the five columns
- `safetyKit[]` — ordered kit membership: `{ref, sub}` (the short subtitle) for the five protocols
- `roles` — `{ms3:[...], resident:[...]}` per-site role lists
- `synonyms` — the search synonym map

**Validation:** every `ref` must resolve to an entry in `site_manifest.json`. A ref to an unshipped
slug fails the **build**, not the browser.

Every shipped page must appear in at least one `libraryColumns` entry **or** in an explicit
`libraryExclude[]` list carrying a one-line reason. This is what keeps "all 88 reachable" true as
content is added, and it is the front-door analogue of the existing orphaned-source check. The
exclusion list exists so the rule stays a hard failure rather than being quietly weakened for the
handful of pages that genuinely are not library content (e.g. `feedback.html`,
`orientation-video.html`) — adding a page and forgetting to place it must break the build.

### 4.2 Joins — no duplicated facts

Everything *about* an item joins from where it already lives:

| Design field | Source |
|---|---|
| minutes ("6 min") | `topic_meta[slug].read` |
| summary | `topic_meta[slug].tldr` |
| Key points callout | `topic_meta[slug].points` |
| "✓ faculty-attested" pill | `topic_meta[slug].facultyReview.status` |
| "Try it now" tool launcher | `topic_meta[slug].relatedTools[0]` |
| category dot, risk level | `tool_registry.json` `category` / `riskLevel` |
| governance warning state | existing surface-governance document (`build_deploy.py`) |

### 4.3 Protocol steps → `topic_meta.safetySteps` (new field)

The design's protocol steps are ordered *actions* ("vitals and fingerstick glucose first"), which
`topic_meta.points` is not — points are *facts* ("delirium almost always has a medical cause").
They are genuinely new clinical content.

They are added as a `safetySteps` array on the five kit pages in `topic_meta.json` (plus the
protocol's `doc` line as `safetyDoc`), **not** to `curriculum.json`. Rationale: `topic_meta` carries
the high-safety governance bundle, faculty attestation, and the crisis-block scope rule. A second
content store outside `validate_topic_meta.py` would ship unreviewed clinical safety content on the
one surface whose purpose is being correct at 2am.

Consequences: `topic_meta.schema.json` and `validate_topic_meta.py` gain the field, and every
`topic_meta.json` edit goes through the `topic-meta-author` skill per repo policy.

The protocol sheet is a risk-work surface under the crisis-block scope rule (the learner is
assessing or planning disposition there), so it carries `<!-- crisis-block-html -->`.

---

## 5 · Surfaces

Visual specification — colors, type scale, spacing, radii, shadows, animation curves and durations
— is the handoff README, which is treated as normative and is not restated here. Behavior that the
implementation must get right:

- **First run** — 2 steps (role, then week). Picking a week lands on Today; "just browse" lands on
  Library with no week set. Skipped entirely when a rotation start already exists.
- **Today** — greeting; due row; Continue card with the 600ms cubic-ease-out ring sweep; this-week
  list with 35ms-staggered rows, check-pop on the just-toggled item only, and animated strike-draw;
  daily pick; capture triage. Desktop adds the quick-tools and safety rails; mobile renders quick
  tools as pill chips.
- **Path** — six-week timeline with done/current/future dot states; detail card; "Set as my week"
  when viewing a non-current week.
- **Library** — five columns, `repeat(auto-fill,minmax(196px,1fr))`, category dots by column accent.
- **Reader** — article + sticky week-navigator rail (desktop); Key points callout; "Try it now"
  launcher; prev/next footer both breakpoints; **mobile action bar fixed to the viewport and a
  sibling of the animated article — never a descendant**, since a transformed ancestor silently
  breaks `position:fixed`.
- **Search** — ⌘K or `/`; synonym-expanded substring match over title + source + summary; protocols
  merged first; capped at 8; Enter picks the first result; results open as a preview **sheet**, not
  a navigation. Empty query shows the 5 protocols, next unread item, MSE builder, CIWA/COWS, pocket
  card.
- **Sheet** — right-anchored; kit list → protocol view → optional full page. Step checks are
  session-only and reset per open. Closing a protocol whose linked page is unread raises the
  bottom-center nudge toast, auto-dismissed at 8s.
- **Keyboard** — ⌘K / `/` open search; `esc` closes search, then sheet; `←`/`→` move within the week
  while reading; `1`/`2`/`3` switch tabs. All suppressed while typing in an input.
- **Mark done** — sets done, then auto-advances to the next unread item in the week (slide-left) or
  returns to the originating tab. `autoAdvance` remains a flag, default true.

---

## 6 · Error handling

The current shell's own comments record the failure mode to design against: an unguarded throw in
`renderHome()` blanks the whole page rather than one row (`spa_index.html:2106`).

- Each surface renderer is independently try/caught and degrades to a minimal fallback with the
  header and tab row intact.
- Persisted state is read through `try{JSON.parse}catch{→{}}` (existing idiom) and every field is
  shape-checked before use — the shell already learned this from `sessLoad()` returning a
  well-formed-but-unvalidated capsule (`spa_index.html:2110`).
- A `curriculum.json` ref to an unshipped slug fails the build.
- A missing `topic_meta` entry renders the row without minutes/summary rather than throwing.
- `localStorage` unavailable (private mode) degrades to in-memory state for the session.

---

## 7 · Testing

**`node --test` per module** — the reason for the module split. Directly unit-tested:

- `fd_state.js` — streak rollover across a date gap and across a local midnight; daily-pick
  determinism for a fixed local day; shelf countdown at week 5, week 6, and on shelf day; ring
  interpolation endpoints; migration from pre-existing `cw_progress_v1` / `cw_srs_v1` state.
- `fd_search.js` — synonym expansion, protocol-first merge order, cap-at-8, empty-query defaults.
- `fd_library.js` — every shipped slug appears in exactly the expected column set; no orphans.

**Python** — `test_validate_curriculum.py`; `test_common.py` extended for the nine new markers.

**Playwright** — `nav-crawl.spec.js` rewritten against the Library; new specs for the first-run
wizard, tab switching, reader prev/next, search overlay, safety sheet, and the mobile fixed action
bar (a regression test for the transformed-ancestor trap in §5).

**Visual baselines** are regenerated via the Ubuntu "Refresh visual baselines" `workflow_dispatch`,
never locally.

**a11y** — `tests/spa-shell-a11y.test.mjs` rewritten for the new landmark structure; mobile primary
actions keep a 44px minimum hit target.

---

## 8 · Deletions and the pins they trip

**Removed:** the sidebar and collapsed rail; `renderModeCompanion` + `renderWardDashboard` +
`itemsForMode`/`scoreItemForMode` scoring; `01_Six_Week_Curriculum/learning-path.html`;
`tests/smoke/mode-companion.spec.js`.

`topic_meta.workflowStages` / `workflowModes` lose their only consumer. The data stays valid and is
left in place.

Retiring `learning-path.html` moves tool counts 23→22 (ms3) and 25→24 (resident). Three pins must
move with it, **two of which the local test battery never runs**:

| Pin | Location | Runs locally? |
|---|---|---|
| `SITE_EXTRAS` — lists `learning-path.html` for **both** sites | `13_Faculty_Resources/_automation/validate_tool_governance.py:40` | yes |
| `EXPECTED_TOOL_COUNTS = {"ms3": 23, "resident": 25}` | `13_Faculty_Resources/_automation/validate_tool_governance.py:52` | yes |
| `assertInventory(ms3, 23)` / `(resident, 25)` | `_prototypes/sp-interview/tests/ci-build-contract.test.mjs:103,114` | **no — CI only** |
| `RESIDENT_REBRAND` needles + the `learning-path` rebrand | `13_Faculty_Resources/_automation/resident_section.py:127,141` | build-time |

The counts decompose as 21 `site_manifest.json` tools + `SITE_EXTRAS` (2 for ms3, 4 for resident).
Because `assertInventory` never runs in the local battery, the implementation must run
`node --test _prototypes/sp-interview/tests` before pushing, not only the root suite.

`RESIDENT_REBRAND` uses `apply_verified_replacements` — a needle that no longer matches **aborts
the resident build**. The shell rewrite invalidates that list wholesale, so it is rewritten as part
of this work, not after it.

---

## 9 · Constraints carried from repo policy

- localStorage keys are `cw_*` (shared hub) or `rp_*` (resident); any other prefix hard-fails the
  QA gate.
- Crisis contacts come only from `crisis_resources.json` via the `<!-- crisis-block -->` /
  `<!-- crisis-block-html -->` markers. Never hard-coded.
- No PHI. Clinical content is synthetic / de-identified only.
- `CLAUDE.md` and `AGENTS.md` stay byte-identical (`cp CLAUDE.md AGENTS.md`); CI fails divergence.
- Dose literals stay banned in `rp-*` / `*-trainer` tools.
- A new shipped page must be registered in `site_manifest.json` **and** in nav, or the orphaned-source
  check hard-fails.

---

## 10 · Out of scope for v1

- The ward dashboard / mode companion (cut; `workflowStages` data retained for a possible return).
- Any change to the 21 clinical tools themselves beyond theme-token alignment.
- Any change to `faculty-console/` beyond keeping the preview route working.
- Content authoring: `curriculum.json` is seeded from the existing `learning-path.html` mapping and
  `topic_meta.safetySteps` is authored for exactly the five kit pages. Broader curricular re-scoping
  is a separate effort.
- **The repo-root `index.html`.** Despite its `<meta name="description">` calling itself the "front
  door to the adult inpatient psychiatry clerkship library", it is a standalone 125-line static
  landing page that neither Netlify site publishes — it appears in no build path and no manifest
  entry. The shell this spec replaces is
  `13_Faculty_Resources/_automation/site_build/spa_index.html`, which the build copies to
  `_build/<site>/index.html`. The root file is left untouched.
