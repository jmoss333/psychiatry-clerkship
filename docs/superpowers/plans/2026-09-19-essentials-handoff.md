# HANDOFF — "Essentials by default": the brief trainee view

**For:** a Claude Code session on Josh's Mac, in `/Users/jm/Psychiatry-Clerkship-Library`
**From:** Cowork session 2026-09-19 (read-only; nothing edited in the repo)
**Decision recorded 2026-09-19 (Josh):** Essentials **replaces the default** trainee experience on both existing sites; the full Library stays one tap away. No third site. Nothing deleted or de-attested.
**Companion:** `claude/essentials-brief-site-proposal-2026-09-19.md` in the Claude Project (the keep/demote lists, §3–§4, and the layout, §5). This file is the execution brief; the proposal is the source of the lists.
**Repo state read:** `origin/main` @ `8b18812` (2026-09-18, "#689 Interview Room release verification"). The Mac checkout is on `claude/frozen-colour-ratchet` @ `8075b89` — branch from **`origin/main`**, not the local checkout.

---

## ★ Phase 1 is DONE — read this before Phase 2 (added 2026-09-19 after #706)

**PR #706** (`claude/essentials-p1`, Codex-authored, reviewed and merged from the Cowork session via `gh pr update-branch` + squash auto-merge → `origin/main` @ **`44dcf36`**, 2026-09-19 14:33 UTC) landed §2 in full: `curriculum.json.essentials`, the schema entry, validator **E1–E6 exactly as specified** with mutation tests for every code (E1 missing/empty/malformed; E2 unshipped and other-audience refs; E3 shipped-but-unplaced, site-addition satisfies, site-exclusion cannot hide; E4 duplicate; E5 each Safety Kit ref; E6 no tool / no populated safety section), per-site projection in `build_frontdoor_payload` (raises on a missing or empty selection — fail-closed at build time too), and a `reachable_refs()`-unchanged test. `bin/verify.sh` 90/90 on the Mac; both required checks green; build inventories byte-identical apart from the injected payload (which now also rides in `tools/rotation-curator.html` — harmless, it embeds the same payload).

**Seven things in this brief were wrong or have moved. Phase 2 must use these instead:**

| # | This brief said | Reality after #706 and main @ 2026-09-19 | What Phase 2 does |
|---|---|---|---|
| 1 | MS3 Essentials = **29** links | **30** (2+3+5+6+2+3+2+7 — the brief's own §2a list adds to 30; the prose was miscounted) | Pin **30 / 35** in `fd-library.test.mjs`; the validator already pins them in `test_real_curriculum_passes_and_pins_selection_counts` |
| 2 | Full Library = **81 / 87** | Shared `libraryColumns` place **83** (81 + the two 2026-08-21 therapy pages); resident adds 10 → **93**. `fd-library.test.mjs:211` already asserts 83 (its title still says 81 — stale title, correct body) | "Full library (N pages)" must read **83** on MS3 and **93** on resident — compute N from `index.columns`, never hard-code; pin both numbers per site |
| 3 | `fdLibrary()` header is `count + ' pages · press / to filter'` | Since **#705** it is `…' pages<span class="fd-library__shortcut"> · press <span class="fd-kbd">/</span> to filter</span>'` (slash hint keyboard-only) and `.fd-library__grid` is CSS multi-column (`columns:280px`) with `.fd-col{break-inside:avoid}` | `fdEssentials()` reuses `.fd-library__grid` / `.fd-col` / `fdCollink()` verbatim and inherits balanced columns for free; copy the `__shortcut` span pattern for the hint |
| 4 | Move the Today pill row first on phones "with CSS `order`, not markup" | **Not possible as written**: `.fd-today__main` is a flex *item* (`flex:10 1 520px`), not a flex container, so `order` on its children does nothing | Either (a) in the ≤480 px media query only, `.fd-today__main{display:flex;flex-direction:column}` + `.fd-quicktools--pills{order:-1}` (check margin collapse on the cards — measure), or (b) emit the pill row first in markup and update the `fd-today.test.mjs` pins. Prefer (a) if the phone layout survives a screenshot; fall back to (b). Acceptance T1 measures `getBoundingClientRect()`, so either passes or fails honestly |
| 5 | `fd_today.js` :1–5, :179–184, :322 | **#707** (phone polish) and the **Today priority rule (Phase 1 of the 09-16 handoff) have landed**: `fdTodayPrimary`/`fdTodayPrimaryHolds` at :80–:120, `.fd-primary__why` emitted; the pill row is now at ~:418 inside `.fd-today__main` (opened at :390) | Re-anchor line numbers; T1 compares the pill row against `.fd-primary`, which now exists |
| 6 | `fdResolveState` :86, `searchParams.get('tab')` :102 | **#708** touched `fd_wire.js` (manifest-title fallback); re-read the parse site before adding `library` | Same design; re-anchor |
| 7 | "Essentials ⊆ Library" as a validator check only | #706 also enforces it in the **catalog** (build raises on a missing selection) | `fd_data.js` may assume `cur.essentials` exists and is non-empty; still skip an unknown ref defensively and expose `index.essentialsDropped` |

**Phase 2 plan review (2026-09-19, Codex's plan, approved with four amendments):**

| # | Amendment | Why |
|---|---|---|
| A1 | **Reorder steps 4–5 and add the CI re-trigger.** `refresh-baselines.yml` commits `[skip ci]` (line 91), so the branch head it leaves has NO required checks and the PR is BLOCKED until something triggers CI on that head: `git commit --allow-empty -m "ci: run checks on refreshed baselines"` or `gh pr update-branch`. Also, because the plan ADDS Library visual coverage, the new screenshots have no baseline until the refresh runs — so run the refresh **first**, have Josh review the PNGs in the PR diff (those are the four views), then re-trigger CI. Precedent: `755f64d` `[skip ci]` → `#709`. | Otherwise the PR sits green-looking but unmergeable |
| A2 | **Never render an empty kit.** If `index.essentials` resolves to zero items (old fixtures, an edition preview, a future data mistake the catalog somehow misses), `fdEssentials()` returns `fdLibrary(index)` — the full grid — and a test pins it. | The silent-shrink checklist: a blank "Your kit" is the worst possible failure and it is exactly what an empty selection would produce |
| A3 | **#699 overlap is real, not theoretical.** `claude/attestation-render-stale` (open, non-draft, updated today) touches `spa_index.html`, `tests/fd-data.test.mjs`, `tests/smoke/front-door.spec.js` — all three are Phase 2 files. Keep the `spa_index.html` edit to the two sites named in §3c (the Library dispatch at ~2080 and the route parse), append tests rather than editing existing blocks, and rebase onto main if #699 lands first. Josh decides the order; the safe default is to let #699 merge first if it is within a day of ready. | Semantic merge conflicts have broken main here before (#595/#596) |
| A4 | **Say what the curator's student preview shows.** `rotation-curator.html` embeds the same payload; if `fd_edition_student.js` renders the Library, it must default to Your kit like the live site, with one test. | An attending previewing an edition should see what the trainee sees |

**Phase 2 review of draft PR #713 (2026-09-19, head `e476f81`, Cowork session):** source and 18 Ubuntu screenshots reviewed. **Screenshots APPROVED** (Your kit 30/35, Full 83/93, "← Your kit" / "Full library (N pages) →" controls, phone pill row first, empty-kit fallback present, `libraryView` kept out of `FD_KEYS`, `?page=x&tab=library&library=full` round-trips through `fdResolveState`). **One change requested before merge:** the phone rule was written at `@media (max-width:480px)` — a value this brief invented — and `design_drift_baseline.json` was edited to *authorise a new non-standard breakpoint* (allowed set is `{430, 640, 1000}`; the sheet's phone cut is 640, used six times). Move the rule into the existing `640` query, revert the baseline note and the `480` entry, and keep the ratchet unloosened. The 390-px baselines do not change. Non-blocking polish: `fdLibrary()` renders "← Your kit" even when the kit is empty and `fdEssentials()` has fallen back to it — a no-op loop; hide the button when `index.essentials` has no items. Then: empty commit → CI on the exact head → ready → merge (Josh's timing).

**Finding outside #713's scope, surfaced by its screenshots:** since #699 merged, **94 of 108 reviewed pages render "Pending review" (many "· High risk")** because their text changed after attestation. Your kit therefore opens on a wall of pending badges. This is #699 working as designed, not a Phase 2 defect — and the fix is Josh's alone (agents may not sign; see attestation integrity). The 30 MS3 + 35 resident kit pages are the re-attestation priority list; the faculty console is where they are signed.

**Phase 2c — readings-first revision (2026-09-19, Josh's design feedback on the #713 screenshots). HOLD #713's current render; revise on the same branch; re-baseline once.**

Josh's direction, verbatim in spirit: *the core readings are the primary and biggest thing; sections as a dropdown; very simple, sleek to navigate.* Sketch approved for direction (Claude artifact "Your Kit, readings first"; MS3 + resident, desktop + phone). Data, counts, routes, storage rules and the A1–A4 amendments are unchanged — this is a rendering change inside `fdEssentials()` plus one tab label.

| Element | Spec |
|---|---|
| Page | One reading column (max ~720 px) + right rail (desktop ≥ 1000 px); on the phone cut (640) the rail collapses to a horizontal pill strip **above** the readings |
| Heading | `Core readings` (display serif, largest type token on the scale) · `N readings · M tools` muted |
| Section control | A native `<select data-fd-kit-section>`: `All sections · N` then one option per Essentials section with its count. Wire it in `fd_wire.js`'s existing `changeHandler` (the one the exam-date input uses); state `kitSection` in memory only — not in `FD_KEYS`, not in the URL, resets to All on every visit |
| Groups | Each section is a native `<details open>` with a `<summary>` (uppercase eyebrow + count + chevron). No JS, no state, keyboard-accessible by default. Filtering via the select shows one group; All shows every group open |
| Reading row | Whole row is the existing `data-fd-open` button. Title in the display serif at the ~23 px token; the one-line takeaway under it from `item.summary` (this is `topic_meta.tldr`, which #707 already maps); meta `N min` from the same field the reader's "READING · 5 min" uses; **no per-row governance pill** — a 7 px amber dot with `aria-label="Awaiting faculty re-review"` from a compact variant of the shared `governanceBadge()` helper (`{compact:true}`), so the projection and the reader notice stay the single source |
| Review status | One line above the groups: `Faculty re-review in progress — X of N readings changed since they were last attested · What that means` (X counted from `item.governance` over the kit's readings; the link opens the existing governance explainer). Rendered only when X > 0 |
| Tools | Rail list on desktop (teal dot + title), pill strip on phone; the seven / nine kit tools only |
| Footer | `Everything (83/93 pages) →` = the existing `data-fd-library-view="full"` control; full view keeps `← Your kit` |
| Tab label | `Library` → **`Your kit`** in `fd_shell.js` (ids unchanged: `today\|path\|library`); update `tests/shell-copy.test.mjs` pins; Path stays |
| Copy rules | Audience-neutral (`shelf` still banned in shell copy — the title "COMAT & Shelf Review Guide" is data and fine); ES5; tokens only — note the `distinct_font_sizes` ratchet in `design_drift_baseline.json`: every size must be a `--fd-font-*` token, never a literal |
| Governance policy (Josh's call, recorded) | The per-row pill → dot is a presentation change only; the reader keeps its full "Pending faculty review" notice; `governance.json`, `reviewed.json`, the console and the digest are untouched. Josh accepts that the kit shows dots until he re-attests the kit pages |

Tests (red first): `fd-library` — 30/35 rows, exactly one `<select>` with N+1 options, 8/7 `<details open>`, status line count equals the number of kit readings whose projected governance is pending, no `governance-badge` pill markup inside `.fd-kit` rows, footer names 83/93; `fd-wire` — the select's `change` dispatch sets `kitSection` and never touches storage or the URL; `shell-copy` — new strings pass; smoke — select filters to one group, `<details>` toggles by keyboard, phone strip sits above the first row at 390 × 844, no horizontal scroll, 44 px targets; visual — re-baseline once via `workflow_dispatch`, then the A1 empty commit.

**Phase 2c review of #713 @ `fb0e67b` (2026-09-19, Cowork session): APPROVED — screenshots and source.** Verified against `origin/main` (0 behind): the 480 breakpoint and the `design_drift_baseline.json` edit are gone (phone rule lives in the existing 640 query; baseline diff vs main is empty); sections are native `<details open>`; the section `<select>` dispatches `kitSection` in memory only (`FD_KEYS` unchanged, nothing in the URL, resets to All on every Library entry); rows use `governanceBadge(item.governance,{compact:true})`; the status line counts pending readings from the projection; tab label is **The Essentials** (Josh's name) with `shell-copy` pins updated; empty kit still falls back to the full grid. Screenshots: MS3 23 readings + 7 tools, resident 26 + 9; phone tool strip sits above the first reading; Full library keeps "← The Essentials".

Codex's four recorded choices — accepted as made: (1) "The Essentials" naming; (2) title at the existing `--fd-font-xl` (21 px) rather than a new size — correct, the `distinct_font_sizes` ratchet forbids a literal; (3) a native `<details>` "What that means" explainer; (4) **Tools as a dropdown option** — fine, but it makes "All sections · 30" disagree with the heading's "23 readings · 7 tools" at a glance; acceptable.

Non-blocking polish for a follow-up PR (do not hold the merge): (a) the native `<select>` is the one unstyled control on the page — give it the Week chip's pill treatment (tokens only); (b) the status line ends in a dangling " ·" when the explainer wraps to its own line — drop the dot; (c) on phones the tab label wraps to two lines ("The / Essentials") in the bottom bar — either shorten the *tab* to "Essentials" (page keeps the full name) or let the bar fit it; Josh's call.

Sequence now (A1): `git commit --allow-empty -m "ci: run checks on refreshed baselines"` on `claude/essentials-p2` → required checks on the exact head → `gh pr ready 713` → `gh pr merge 713 --squash --auto`. Merge timing is Josh's; the change is additive and safe mid-rotation.

**SHIPPED — 2026-09-19.** #713 squash-merged as `e6e3e23`; **production for both learner sites is `ready` at `0974714`** (#692, merged on top of it) — verified from the Mac at ~22:35 UTC: both sites 200, served `index.html` carries `fdEssentials`, the `fd-kit` CSS, "Core readings", the per-site `essentials` payload and the "The Essentials" tab; LFS audio still serves real bytes (3,473,535 B). Nobody signed into Netlify; no manual deploy was made.

**Incident to learn from (small, but it will recur):** #713's squash inherited `[skip ci]` from the two baseline-refresh commits because the repo's squash default is `squash_merge_commit_message: COMMIT_MESSAGES` (every commit body concatenated). GitHub Actions ran anyway (the marker was not in the title), but **Netlify honours `[skip ci]` anywhere in the message and skipped both production deploys**. Production caught up only because #692 happened to merge 80 minutes later. Codex then tried to force a rebuild through Netlify without a session, which is the right instinct and the wrong tool: a CLI/API deploy would have billed 15 credits per site, bypassed the git-only path, and appeared as `deploy_source: cli` — exactly the hole `netlify_and_github_settings` says to close. Two fixes, in order of value:
1. **Repo setting (Josh's approval, one command):** `gh api -X PATCH repos/jmoss333/psychiatry-clerkship -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY` — squash messages become title + PR body, so a `[skip ci]` in a branch commit can never reach main. Reversible; changes nothing else.
2. **Guard (a small PR):** `bin/pr_preflight.py` warns when any commit on the PR head carries `[skip ci]`/`[skip netlify]` and the repo squash setting is `COMMIT_MESSAGES`; and `maintenance-production-canary.yml` should compare each learner site's production `commit_ref` to `origin/main` and open a gate when they differ for > 60 min — that check would have caught this before anyone noticed.
Until 1 lands: merge PRs that end in a baseline refresh with `gh pr merge --squash --body-file <clean body>` (as #706 was), never bare `--squash`.

**Follow-through 2026-09-20:** #716 added the "This week" filter (Codex). PR `claude/console-essentials-first` (Cowork) makes the **faculty console order The Essentials first** in its review queue, label them, and count "N of M Essentials need review" — `curriculum.json` read for order only, branch-then-base, advisory, never a failed load; tests red-first then 383/383; `bin/verify.sh` 98/98. After it deploys (~20 s post-merge, no build), Josh confirms the queue order on the live console with the key — the standing rule for any change to what the console reads. `TASKS.md` and the productivity `memory/` (local-only, `.git/info/exclude`) were bootstrapped the same day.

Everything else in the plan stands, including the deferrals (weekly case card, tool-tile links, tab relabel, analytics, Your-kit-as-home) and the route table (`?tab=library` → kit; `…&library=full` / `?library=full` → full; invalid → kit).

Unchanged and still binding: no renderer/shell change has shipped yet (`fd_data.js` has no `essentials`; the Library tab still renders the full grid); no new `localStorage` key; ES5; audience-neutral copy (**"shelf" banned**); tokens-only CSS; visual baselines via `workflow_dispatch` only; branch from `origin/main` (now past `#706`'s squash), never the shared checkout.

**Phase 2 kickoff prompt (replaces §8 for this phase):**

> Read `docs/superpowers/plans/2026-09-19-essentials-handoff.md` end to end — the ★ section first, then §3 with its corrections applied — then `AGENTS.md`. `git fetch origin` and confirm `curriculum.json` on `origin/main` has `essentials` (it does, #706). Branch `claude/essentials-p2` from `origin/main`. Enter plan mode and produce a plan for **Phase 2 only**: `fd_data.js` `index.essentials`; `fd_library.js` adds `fdEssentials()` beside an otherwise untouched `fdLibrary()` (plus the one "← Your kit" control); shell `state.libraryView` defaulting to `essentials`, `?library=full` deep link, `data-fd-library-view` dispatch, `openLibrary` postMessage lands on Essentials; the phone pill-row reorder per correction 4; tests first (pins 30/35 and 83/93 per site; L1–L6, T1, G1–G3). Stop for my approval before writing source. Constraints: ES5, `fd_library.js`'s existing tests stay green unmodified, no new storage key, no "shelf" in shell copy, never `--no-verify`. Do not start Phase 3.

---

## 0. Model and mode

| Phase | Model | Why |
|---|---|---|
| **1** data + validator | **Sonnet** is enough; Opus if you want one model throughout | Fully specified; the validator's failure test is the only subtle part |
| **2** Library renderer + Today rail | **Fable 5.1 / Opus, plan mode first** | Touches the frontdoor under nine pinned contracts (ES5, purity tests, audience-copy regex, `fd-library.test.mjs` count pins, visual baselines) |
| **3** tool-tile merges | Sonnet | Two links, two tests |
| **4** tab relabel (optional) | Opus | Copy change under `tests/shell-copy.test.mjs` |

Run every phase **on the Mac**: `bin/verify.sh` is the pre-push hook, Git LFS is installed there, and `tests/smoke` needs `npm ci`. A sandbox shows ~20 `.m4a` files as "modified" — the LFS phantom; never commit those.

---

## 1. Re-establish ground truth (before the first edit)

```bash
git fetch origin --prune
git log -1 --format='%h %ad %s' --date=short origin/main      # read at 8b18812 (2026-09-18)
git status --short | grep -v '\.m4a$'                          # empty apart from the LFS phantom
git switch -c claude/essentials-p1 origin/main
gh pr list --state open --search "essentials OR library OR frontdoor"   # duplicate-work check; none expected
```

**Files the plan depends on — read them whole before editing:**

| File | Why it matters |
|---|---|
| `curriculum.json` + `curriculum.schema.json` | Root is `additionalProperties:false` — a new `essentials` key **fails the registry validator until the schema gains it** (`test_validate_registry_schemas.py::test_curriculum_rejects_an_unknown_root_property`). `libraryColumns` is the shape to copy: `[{name, accent∈{tool,safety,topic}, refs[]}]`. |
| `13_Faculty_Resources/_automation/validate_curriculum.py` (+ its `test_validate_curriculum.py`) | The existing totality guard: every shipped slug placed in a column or excluded; every ref shipped on its site; reads `shipped_pages.json` via `load_shipped_pages()` (ADR-002). Essentials checks go **here**, not in a new script. |
| `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py::build_frontdoor_payload(site, …)` | Projects `curriculum.json` into the per-site payload (`libraryColumns` + `siteLibrary.<site>.additions`, minus exclusions). Essentials must be projected **per site** the same way, and `reachable_refs()` must not change (full Library still ships every ref). |
| `site_build/frontdoor/fd_data.js::fdBuildIndex` (lines ~53–142) | Turns the payload into `index.columns` (order preserved). Add `index.essentials` beside `index.columns`; `byRef` already resolves title/kind/rights/governance. |
| `site_build/frontdoor/fd_library.js` | `fdLibrary(index)` — pure, ES5. **Leave it byte-identical** (see §3); add a sibling `fdEssentials(index)`. |
| `site_build/spa_index.html` ~line 2080 | `if(state.tab==='library') return fdSurface('library', function(){ return fdLibrary(FD_INDEX); });` — the one dispatch point to change. Line ~2349: `openLibrary` postMessage → `data-fd-tab:'library'`. |
| `site_build/frontdoor/fd_shell.js` :24–25, :148 | Tabs are the literal list `['today','path','library']` with labels Today / Path / Library. Untouched until Phase 4. |
| `site_build/frontdoor/fd_today.js` :1–5, :179–184, :322 | The quick-tools rail and pill row are emitted from one `quickTools` list; the pill row is last in `.fd-today__main` (F10 in the 09-16 audit). |
| `tests/fd-library.test.mjs` | Pins: five columns in file order; **81 rendered links against the real curriculum.json** (:211); header "Everything, one screen" (:151); no audience token; ES5/no-DOM. |
| `tests/shell-copy.test.mjs` :21 | `AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i` — **"shelf" is banned in shared shell copy.** The Essentials section is "Exam", never "Shelf"; `shelf.md` / `shelf-mode.html` as slugs are fine, prose is not. |
| `docs/SILENT_SHRINK_CHECKLIST.md` | §D2 / `bin/check_vacuity.py`: the new validator must fail on an empty or missing Essentials list, never pass over it. |

Repo rules that bite here: ES5 only in `frontdoor/`; audience-neutral copy everywhere in `fd_*.js`; **no new `localStorage` key** in Phase 1–3 (the view toggle lives in shell state and the URL, not storage); tokens-only CSS (`check_design_drift.py`); visual baselines regenerate **only** via the "Refresh visual baselines" `workflow_dispatch`; `--no-verify` is never the answer; a red local gate with green CI is usually bash 3.2 (`${ARR[@]+"${ARR[@]}"}`).

---

## 2. Phase 1 — data + validator (one PR; no learner-visible change)

### 2a. `curriculum.json` — add `essentials`

Shape mirrors `libraryColumns`, keyed per audience so the resident list can differ:

```json
"essentials": {
  "_note": "The default Library view. Everything here MUST also be placed in libraryColumns (or that site's siteLibrary additions): Essentials is a view of the Library, never a second catalogue. Order is display order.",
  "ms3": [
    {"name": "Start here",        "accent": "topic",  "refs": ["welcome.md", "doc_oral.md"]},
    {"name": "Pocket cards",      "accent": "safety", "refs": ["pg_interview.md", "pg_suicide.md", "pg_formulation.md"]},
    {"name": "Acute & safety",    "accent": "safety", "refs": ["agitation.md", "delirium.md", "catatonia.md", "suicide.md", "exp_consult.md"]},
    {"name": "Core diagnoses",    "accent": "topic",  "refs": ["ddx.md", "t_mood.md", "t_psychosis.md", "t_sud.md", "t_personality.md", "t_anxiety.md"]},
    {"name": "Medications",       "accent": "topic",  "refs": ["psychopharm_primer.md", "med_monitoring.md"]},
    {"name": "Family & discharge","accent": "topic",  "refs": ["exp_family.md", "collateral_workflow.md", "brief_psychotherapy.md"]},
    {"name": "Exam",              "accent": "topic",  "refs": ["shelf.md", "rapid_review.md"]},
    {"name": "Tools",             "accent": "tool",   "refs": ["mse.html", "withdrawal.html", "capacity.html", "oral.html", "question-bank-practice.html", "review.html", "sp-interview.html"]}
  ],
  "resident": [
    {"name": "Start here",        "accent": "topic",  "refs": ["rotation.md", "doc_oral.md"]},
    {"name": "Pocket cards",      "accent": "safety", "refs": ["pg_interview.md", "pg_suicide.md", "cl_reference.md"]},
    {"name": "Acute & safety",    "accent": "safety", "refs": ["agitation.md", "delirium.md", "catatonia.md", "suicide.md", "exp_consult.md", "violence.md", "toxidromes.md", "systems_medlegal.md"]},
    {"name": "Diagnosis & meds",  "accent": "topic",  "refs": ["ddx.md", "t_mood.md", "t_psychosis.md", "t_sud.md", "t_personality.md", "psychopharm_primer.md", "adv_psychopharm.md", "med_monitoring.md"]},
    {"name": "Systems & family",  "accent": "topic",  "refs": ["exp_family.md", "collateral_workflow.md", "supervision_teaching.md"]},
    {"name": "Scholarship",       "accent": "topic",  "refs": ["case_formulation.md", "landmark_trials.md"]},
    {"name": "Tools",             "accent": "tool",   "refs": ["mse.html", "withdrawal.html", "capacity.html", "violence.html", "oral.html", "rp-agitation.html", "rp-post-event-huddle.html", "question-bank-practice.html", "review.html"]}
  ]
}
```

These are the §3/§4 lists verbatim (MS3 29 items; resident 35). Josh edits **this block** to flip a call — nothing else in the repo encodes the lists. Section names are audience-neutral on purpose (no "Shelf", no "MS3").

### 2b. `curriculum.schema.json`

Add `essentials` to root `properties` (root stays `additionalProperties:false`): object with `_note` (string) and required `ms3` / `resident`, each an array of the **same item schema as `libraryColumns`**, `minItems: 1`; each column `refs` `minItems: 1`, `uniqueItems: true`.

### 2c. `validate_curriculum.py` — the Essentials guard

Add after the library-totality block, using the `bad(where, msg)` helper already there:

| # | Check | Why |
|---|---|---|
| E1 | `essentials` present with both `ms3` and `resident`, each non-empty | vacuity — an absent list must be red, not "0 problems" |
| E2 | every ref is in `site_shipped[site]` for that audience | a demoted-then-unregistered page must not linger here |
| E3 | every ref is also placed in `libraryColumns` ∪ `siteLibrary.<site>.additions` | Essentials ⊆ Library, always |
| E4 | no ref appears twice across an audience's sections | one tile per page |
| E5 | every `safetyKit[].ref` (today: `pg_suicide.md`, `agitation.md`, `exp_consult.md`, `t_sud.md`, `delirium.md`) is present in **both** audiences' Essentials | the brief view may never lose a safety surface |
| E6 | at least one `.html` tool per audience and at least one item from a `safety`-accent section | a data edit cannot ship an Essentials view with no kit |

Tests in `test_validate_curriculum.py`, **red first**: remove `essentials` → E1 fires; add `t_sleep.md` to resident essentials but remove it from `libraryColumns` → E3 fires; drop `delirium.md` from ms3 essentials → E5 fires; duplicate `mse.html` → E4 fires; the shipped data → 0 problems.

### 2d. `frontdoor_catalog.py`

In `build_frontdoor_payload(site, …)`: `projected["essentials"] = copy.deepcopy(curriculum["essentials"][site_key])` (the same `site_key` mapping used for `siteLibrary`), then `projected.pop("essentials")`'s other audience. `reachable_refs(payload)` is unchanged and a test should assert it is (same set before/after the key is added).

### 2e. Gates to exit Phase 1

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
node --test tests/*.test.mjs
bash bin/verify.sh          # background to a log; read it
```
Nothing renders differently yet; both builds should be byte-identical apart from the injected payload. PR body: "data only; Essentials is not yet rendered; lists per proposal §3/§4; Josh may edit `curriculum.json.essentials` freely — validator E1–E6 is the contract."

---

## 3. Phase 2 — render Essentials by default (one PR; the learner-visible change)

**Write the tests first** (`tests/fd-library.test.mjs` extended, `tests/fd-data.test.mjs`, `tests/fd-wire.test.mjs`, smoke `front-door.spec.js`).

### 3a. `fd_data.js`
`fdBuildIndex` adds `index.essentials = [{name, accent, items:[resolved via byRef]}]` from `cur.essentials`, resolving exactly as `columns` does (title, kind, rights, governance). Unknown ref → skip **and** count it in an `index.essentialsDropped` number the shell can log; the validator makes this impossible on a green build, but the renderer must not throw.

### 3b. `fd_library.js` — add, do not modify
- `fdEssentials(index, opts)` — pure, ES5. Sections from `index.essentials`, one `fdCollink()` per item (reuse it — dots, rights, governance badge come free). Header: **"Your kit"** with `<n> pages · press / to filter`. Footer control: `<button class="fd-btn fd-btn--ghost" data-fd-library-view="full">Full library (<N> pages) →</button>` where N is the full-column count.
- `fdLibrary(index)` gains one line at the top of its head: `<button … data-fd-library-view="essentials">← Your kit</button>`. Keep the "Everything, one screen" header and the 81-link count so `fd-library.test.mjs` :151/:211 stay green (the count test counts `.fd-collink`; the new button is not one).
- New tests: sections render in `curriculum.json` order; every Essentials row carries `data-fd-open`; the footer control names the full count; no audience token in output; the real MS3 payload renders **29** links and the real resident payload **35** (pin the numbers — a silent shrink here is exactly the checklist failure).

### 3c. Shell (`spa_index.html` ~2080, `fd_wire.js`)
- `state.libraryView` ∈ `{'essentials','full'}`, default `'essentials'`, **not persisted** (no new storage key; Phase 5 may add one if the data says people keep opening Full). Deep link: `?library=full` sets it; `fdResolveState` already parses the query — add the key there and pin it in `fd-wire.test.mjs`.
- Dispatch: `data-fd-library-view` → set state, re-render the library surface; `data-fd-tab="library"` from anywhere (including the `openLibrary` postMessage at ~2349) lands on **Essentials**.
- Search is unchanged and still indexes the full set (`fd_search.js` reads `index.byRef`/`columns`, not the view).

### 3d. Today — unit-kit rail first on mobile
In `fd_today.js` move the `.fd-quicktools--pills` row to the **top** of `.fd-today__main` on ≤480 px. Do it in CSS with `order` on the existing flex/grid container rather than reordering the markup, so `fd-today.test.mjs` markup pins and the desktop rail are untouched; token-only CSS.

### 3e. Today — one COTW card (optional in this PR; may be split out)
"This week's case": the newest `cotw_registry.json` entry for this site, rendered as one `fd-continue is-secondary`-style card under "Also today". Read it from `index.byRef` (COTW pages are in the index via `shipped_pages`), never from the registry directly (`tests/shipped-pages-readers.test.mjs` freezes direct readers).

### 3f. Gates to exit Phase 2
```bash
node --test tests/*.test.mjs
bash bin/verify.sh
python3 13_Faculty_Resources/_automation/site_build/check_design_drift.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npm ci && npx playwright test front-door.spec.js nav-crawl.spec.js
```
Expect the Library and Today visual baselines to fail — that is the Close step. **Human gate: Josh reviews four screenshots (Library-essentials, Library-full, Today desktop, Today mobile) before the baseline refresh.**

---

## 4. Phase 3 — tool-tile merges (one PR)

| Kept tile | Absorbed | Change |
|---|---|---|
| `question-bank-practice.html` | `shelf-mode.html` | On the qbank start screen add a link "Exam simulation →" to `shelf-mode.html` if one is not already there (the word "Shelf" is fine **inside** the tool file — the ban is on shared shell copy; still prefer "Exam simulation"). |
| `sp-interview.html` | `communication-practice.html` | Add "Quick drills →" on the Interview Room's landing state. |

Both absorbed tools stay shipped, attestable, in Full library and in search. Tests: each kept tool's built HTML contains the link; `check-static-site.mjs` stays green (single-file tool rule).

---

## 5. Phase 4 — tab relabel (optional; separate PR; Josh's call)

Today / **Your kit** / **Library** in `fd_shell.js` :25 (and the `tabs` list at :148 keeps ids `today|path|library` — only labels change). The Path tab stays the week browse surface; "Your kit" label goes on the **library** tab whose default view is Essentials. Run `tests/shell-copy.test.mjs` and the smoke crawl. If the rename tests poorly with learners, revert this PR alone.

---

## 6. Close and follow-through

| Step | Owner | Check |
|---|---|---|
| Refresh visual baselines via `workflow_dispatch` (Ubuntu only) | agent | baseline PR; Josh approves the four screenshots |
| Deploy timing | **Josh** | Additive change, nothing removed — safe mid-rotation; if you prefer, merge Phase 2 between blocks |
| `CLERKSHIP_ANALYTICS=res`, then `both` (Netlify UI per site; owner's call per the 2026-09-04 design) | **Josh** | weekly counters exist for each Essentials ref; add one allowlisted event `library_full_opened` (registry edit via `analytics_events.py --write`, never a free-text string) |
| Re-cut after one rotation | Josh | any Essentials item with 0 opens over a rotation → demotion candidate; any Full-library item in the top quartile → promotion candidate; both are a `curriculum.json` edit under E1–E6 |

---

## 7. Acceptance checks (Playwright, seeded via `page.addInitScript`; both audiences via the project-suffix helper)

**L · Library**
- L1 fresh context → Library tab → header "Your kit"; `.fd-collink` count = 29 (MS3) / 35 (resident); a control `[data-fd-library-view="full"]` names the full count (81 / 87).
- L2 click it → header "Everything, one screen"; `.fd-collink` count = 81 / 87; control `[data-fd-library-view="essentials"]` present; click it → back to L1 state.
- L3 `/?library=full` → lands on the full view; `/` → Essentials. Reload preserves whichever view the URL names; a plain reload of `/` returns to Essentials (no storage).
- L4 every demoted ref is still openable: for each `libraryColumns` ref not in Essentials, `data-fd-open` from the full view changes `location.search` as before.
- L5 search from the Essentials view for a demoted title (e.g. "Dissociative") returns the page.
- L6 `localStorage` key set is identical before and after L1–L3 (no new key).

**T · Today**
- T1 at 390×844 the first child of `.fd-today__main` in DOM-order-adjusted layout is the pill row (`getBoundingClientRect().top` of `.fd-quicktools--pills` < that of `.fd-primary`); at 1280 px the desktop rail is unchanged.
- T2 (if 3e shipped) one COTW card, title = newest registry entry for this site; on a site with no COTW it is absent, not empty.

**G · governance**
- G1 `validate_curriculum.py` on the shipped data → 0 problems; with `essentials` deleted → exit 1 naming E1.
- G2 `reviewed.json`, `shipped_pages.json`, `cotw_registry.json`, `crisis_resources.json` byte-identical to `origin/main`.
- G3 `node --test tests/shell-copy.test.mjs` green; rendered Essentials on both builds contains none of the banned tokens.

---

## 8. Kickoff prompt (paste into Claude Code on the Mac, plan mode)

> Read `docs/superpowers/plans/2026-09-19-essentials-handoff.md` (this file) end to end, then `AGENTS.md`, then the proposal it references. Run §1 exactly and branch from `origin/main`. Enter plan mode and produce a plan for **Phase 1 only** (data + schema + validator E1–E6 + catalog projection) that lists every test you will add — red first — and every line you will change, then stop for my approval. Constraints: root schema stays `additionalProperties:false`; Essentials ⊆ Library (E3); all five Safety Kit refs in both lists (E5); the validator must fail on a missing or empty list (E1); no renderer or shell change in this phase; never `--no-verify`. Do not start Phase 2 in the same branch.

---

## 9. Known unknowns
- The 29/35 counts assume the proposal's lists verbatim; if Josh flips any call, update the two pinned numbers in `fd-library.test.mjs` in the same PR as the data — a stale pin is the point.
- `fdResolveState` (`fd_wire.js` :86) already reads `parsed.searchParams.get('tab')` at :102 — add `library` beside it; the `site` key in `build_frontdoor_payload` is literally `"ms3" | "resident"` (:74), matching the `essentials` keys above.
- Line numbers are from `8b18812`; re-anchor if `main` moves.
- Usage is unmeasured; every keep/demote is judgment until §6's counters run for one rotation.
