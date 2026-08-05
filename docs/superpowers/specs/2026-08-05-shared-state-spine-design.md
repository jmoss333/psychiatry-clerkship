# Shared-State Spine (Direction A) — design

**Date:** 2026-08-05
**Status:** Design — awaiting review
**Author:** Joshua Moss, MD (with Claude Code)
**Line anchors verified against:** `origin/main` @ `6a00a36` (post-#316). Re-derive anchors in a
fresh worktree before editing.
**Companion specs:** `2026-08-05-offline-shell-and-session-capsule-design.md` (Direction D),
`2026-08-05-ward-question-capture-design.md` (Cowork). Merge order in §Sequencing binds all three.

---

## Plain-language summary

The platform's tools each practice well but remember separately: the qbank knows your confidence,
Daily Review knows which grades you chose, and neither ever tells the other — or you. This adds
two small shared pieces: a **calibration ledger** that keeps the judgment-vs-outcome pairs the
tools currently throw away and shows you one honest picture of how calibrated you are, and a
**rotation-phase policy** that finally makes the shelf date you entered govern how much new
material the system feeds you as the exam approaches.

## Problem

1. Judgment-vs-outcome pairs are collected and discarded. `cw_qb_v1` keeps only the LAST attempt
   per item (overwritten wholesale, `question-bank-practice.html:214-229`), and a pretest retake
   clobbers practice records under the same ids (`spa_index.html:1504`). Daily Review's
   suggested-vs-chosen grade divergence exists only as a CSS class (`review.html:240-243`) — the
   single cleanest miscalibration signal on the platform is unrecorded.
2. The two-tier "shaky reasoning" verdict is computed, shown once, and never persisted
   (`twoTierResult` caps the SM-2 grade at Hard; only `tier2Key` is stored).
3. `cw_shelf_date` drives a countdown card and nothing else; `cw_start_week`/`cw_track` are
   write-only dead settings (read solely to prefill their own Start-here inputs,
   `spa_index.html:1509`). The spacing literature's central parameter — time to the criterion
   test — is stored and ignored.

## Scope decision (YAGNI)

**Phase 1 = two PRs (PR-A ledger, PR-B phase policy).** Deferred with reasons:
- **Error taxonomy** — mechanism labels on trap feedback are editorial clinical metadata with an
  unresolved attestation-cost question; the ledger's `t2` field is the down payment.
- **Concept crosswalk** (`concepts.json`) — a new build-emitted artifact (with resident
  re-emission and gate/fixture questions) that no phase-1 consumer justifies. Ledger events store
  `pages`, so a future crosswalk joins retroactively; nothing is lost by waiting.
- **Successive-relearning mastery** — derivable later from ledger + `cw_srs_v1`; shipping now
  puts a competing number next to `masteryByBlueprint` on the same screen.
- **Platform-wide confidently-wrong-first ordering; Shelf/SP ledger writers; qbank interleaving
  mix; dashboard-mode auto-recommendation; any `cw_srs_v1` schema change.**

## Approach

Build-injected shared modules via `SNIPPET_MARKERS` (`common.py:509-511`) — the proven
`sm2_apply_grade.js` pattern. Rejected: per-tool inline writes (three drifting copies — the
`deck#`-bucket failure class) and a shared `tools/*.js` file (shipped JS is invisible to the QA
gate's storage scans; the spine's keys would escape the `cw_*` gate).

**Snippet-mechanics constraints (binding, learned from the capture spec review):**
- `_snippet_signature` (`common.py:556-568`) returns the first *stripped* line anywhere in the
  file that starts with `function ` — position/indentation irrelevant — and duplicate-injection
  detection counts that whole line as an exact substring. Therefore every snippet in this spec
  opens its first function as a short, stable line **under 60 characters** (e.g.
  `function calibLog(evt){`), pinned by a `test_common.py` length assertion per snippet.
- Signatures must be unique across ALL snippet files (existing: `function applyGrade(card,
  grade, opts){`; capture spec adds `function looksLikePhi(t){`).
- Markers appear exactly once per consumer; `inject_shared_snippets` replaces every occurrence.
- **No marker ever enters `_prototypes/sp-interview/**`** — its suite `eval()`s source HTML
  (`smoke.test.js:4-17`); injection only reaches built output.
- Snippet bodies use direct literal `localStorage` calls — never the consumers' `KEY`-variable
  idioms, which are exactly what the computed-key ratchet counts (exact ceilings `ms3:6`,
  `res:9` in `qa-baseline.json`; one new computed call site hard-fails the deploy).

---

## PR-A: Calibration ledger

### Store — `cw_calib_v1` (literal key, appears only inside the injected snippet body)

```js
{ v:1,
  qb:  [ /* newest last, ring-capped at 400 independently */ ],
  rev: [ /* newest last, ring-capped at 400 independently */ ] }
// qb event:  {id:'qb_mood_001', pages:[...], p:'guess'|'likely'|'certain',
//             a:0|1, t2:'both_right'|'shaky'|'wrong'|null, re:0|1, ts:Date.now()}
// rev event: {id:'AR-50#0'|'TOPIC#f.md', p:'Again'|'Hard'|'Good'|'Easy',
//             sug:'Again'|'Good', a:0|1, rq:0|1, ts:Date.now()}
```

- **Per-source rings** (not one shared ring): daily review volume (~30–60 events/day) would
  otherwise evict the qbank calibration history within a week, killing the longitudinal premise.
  ~800 events × ~150 B ≈ 120 KB worst case — fine for quota; sizing is not load-bearing.
- **Enum fields + existing ids only. No free text, ever.** PHI firewall satisfied structurally.
- `re:1` marks a re-attempt (a `cw_qb_v1` record for this id already existed with a same-day
  `ts`) — the focus presets exist to drive immediate re-grinding, and unmarked re-attempts would
  inflate "certain" accuracy minutes after the learner saw the answer.
- `rq:1` marks a same-session Again-requeue regrade in Daily Review (`review.html:194` requeues
  misses; one card can produce two events per session).
- `ts` is epoch millis — never the shell's `'YYYY-MM-DD'` strings or `rollDay`'s unpadded local
  format.
- Load-or-reset on `v!==1` (derived analytics, safe to reset — unlike `cw_srs_v1`, whose
  version this spec does not touch). All writes try/catch-silent (quota, iOS private mode).

### Write/read API — one injected snippet

`SNIPPET_MARKERS["/*__CALIB_LOG__*/"] = "calib_log.js"`. First function line:
`function calibLog(evt){` (21 chars). The same body defines `function calibRead(){` returning the
parsed store (or the empty shape) — the shell panel consumes `calibRead()` so the literal key
exists **only** in the snippet body; the wiring test enforces that no consumer hand-rolls either.
(Signature detection keys on the FIRST function line only, so a second function in the body is
safe.)

### Writers — exactly two

1. **`question-bank-practice.html`** — inside/beside `qbRecord()` (`:214`), which already
   receives `twoTierResult` in its signature (currently unused) and is reached only via
   `commitResponse` (`:819`) **after** the `SESSION.reviewOnly` early-return (`:812-818`) — so
   faculty-preview review sessions never pollute the ledger. Event: `p=confidence`,
   `a=correct?1:0`, `t2=twoTierResult` (null on the sba/relational path, `:766-767`), `pages`,
   `re` per the rule above. This is also the first time the shaky verdict is persisted anywhere.
2. **`review.html` `grade()`** — lift the suggestion out of CSS (`:240-243`: Again when
   `!gotIt`, Good when `gotIt`) into a variable; log `{p:chosen, sug, a:gotIt?1:0, rq}`. Does
   **not** touch `cw_srs_v1.stats` — the stats-write contract (`sm2_apply_grade.js:17-22`) is
   unchanged; its header gains one sentence pointing history logging at `cw_calib_v1`.

**Non-writers, deliberately:** pretest (no judgment side — `confidence:null`); family tool
(self-rating has no ground truth; logging it as "actual" would smuggle in what the stats
contract forbids); Shelf Mode and the SP room (persist nothing today; wiring them is real design
work, deferred). `cw_practice_events_v1` remains reserved for sim *process* events —
distinct from judgment-vs-outcome pairs; noted in the snippet header.

### Home metacognition panel (shell, script 2, inside `renderHome`)

Activates at **n ≥ 20 qb events**; below that, the existing `calibrationSummary()` card renders
unchanged (fallback, not a second source — on activation the new panel replaces that section).
Contents, phase 1 only:

- **Accuracy per confidence level** — from qb events with `re===0` only (first-exposure bars),
  each bin rendered only at **bin n ≥ 5**, else "not enough data yet" (the F2 low-n lesson).
- **Confidently-wrong count + preset button** — count is computed from `cw_qb_v1.certWrong`
  (the SAME population `certWrongItems()` serves), not from the ledger — a panel number and its
  button must never describe different populations (`cw_qb_v1.certWrong` is erased on
  re-attempt; ledger events are permanent — joining them on one control would let the count say
  6 while the button serves 2).
- **One review-divergence line** — "You marked Good/Easy on N cards you answered wrong": rev
  events where `sug==='Again' && p!=='Again'`, counting once per card id per session-day
  (dedup on `rq`).
- One sentence of copy on activation acknowledging the panel counts per-attempt history while
  the old summary counted last-attempts-per-item (the numbers will differ; say so once).

Render function wrapped in deliberate slice markers (`/* ---- end calib panel ---- */`) per
house test style; the `dueBreakdown` region sliced by `tests/srs-home-counters.test.mjs` is not
disturbed.

### Erase & export

- **Erase:** Daily Review's `resetAll` (`review.html:202`) confirm gains "also clears your
  calibration history"; it removes `cw_calib_v1` alongside `cw_srs_v1`.
- **Export:** `exportStudy()` (`spa_index.html:1418-1429`) gains `calib:safeLS('cw_calib_v1')`
  and the schema string bumps to `'clerkship-study-v2'` — a documented **additive superset** of
  v1 (nothing in-tree pins the v1 string; external consumers treat v2 as forward-compatible).
  Ledger is enum-only, so no new privacy surface; `cw_reflect_v1`/`rp_flags`/`cw_capture_v1`
  remain excluded.

### Accepted risks (decisions, not oversights)

- **Concurrent writers:** load-modify-write from two iframes can drop events (single-user,
  single-tab dominant; append-only loss is invisible but bounded). Accepted.
- **iOS ITP:** Safari evicts all script-writable storage after 7 days without a visit unless
  A2HS — the ledger inherits the same sword every `cw_*` key already faces. Mitigations are
  Direction D's A2HS hint and the export path. Accepted.
- **Cold start:** heavy existing users see the fallback card until 20 fresh events accrue
  (seeding from `cw_qb_v1` would bake in the pretest-clobber and last-attempt-only skews).

---

## PR-B: Rotation-phase policy

### Module

`SNIPPET_MARKERS["/*__PHASE_POLICY__*/"] = "phase_policy.js"`. First function line:
`function phasePolicy(now){` (25 chars). Pure function reading literal `cw_shelf_date` (the only
live time anchor; `cw_start_week` stays dead — activating it needs an anchor date that doesn't
exist, and inventing one is out of scope). Returns:

```js
{ phase:'encode'|'interleave'|'consolidate'|'taper'|'post'|'unset',
  daysToShelf:Number|null, newPerDayCap:Number, label:String }
// >28 encode(cap 12) · 15–28 interleave(12) · 7–14 consolidate(8) · 0–7 taper(5)
// daysToShelf < 0 → 'post' (cap 12, review-forward label) — the shell already models this
//   state (spa_index.html:1499 'Shelf date passed'); without it '≤7' captures negative days
//   and throttles a post-exam learner at taper forever.
// no date → 'unset' (cap 12, label prompts Start-here)
```

- **Date parsing:** the shell's exact local-midnight idiom `new Date(shelf+'T00:00:00')`
  (`spa_index.html:1436`, same at `:1499`) — `Date.parse('YYYY-MM-DD')` is UTC midnight and
  would disagree with the adjacent countdown card by hours at every boundary in any US timezone.
  Boundary tests pin local-midnight edges (29/28, 15/14, 8/7, 1/0/−1 days).
- Cap floor is 5 — inside the existing slider range (`min:5`, `review.html:289`; `newPerDay=0`
  is unreachable/untested and stays that way).

### Consumers — two

1. **`review.html`** — the effective new-card allowance becomes
   `min(settings.newPerDay, policy.newPerDayCap)` **only when the learner has never explicitly
   set the slider**. "Never set" is a real flag: `setNewPerDay` (`review.html:201`) additionally
   writes `settings.userSet=true` (all three `cw_srs_v1` loaders preserve unknown settings
   fields under `v===1` — verified; no version bump). A learner who deliberately chooses any
   value — including 12 — is never silently capped. **The min() applies at BOTH computation
   sites via one small shared helper in the injected body:** `metrics()` (`:155-157`, display)
   AND `start()` (`:170-171`, the actual queue: `due.concat(neu.slice(0,newRemain))`) — patching
   only the display was the draft defect; the wiring test pins both call sites. A phase chip
   near the dashboard shows phase + one-line why. Study-ahead is untouched.
2. **Home** — the shelf-countdown card (reads `cw_shelf_date` live at `:1435`, so it never
   inherits `cw_plan_v1`'s frozen `shelfDate`) gains the phase label + one line of guidance.

**Resident-site semantics:** review.html and the rebranded shell ship to the resident site via
copytree; residents don't sit the MS3 shelf. All phase copy is **audience-neutral** ("Exam in
N days", never "shelf" — same token ban as the capture spec's T7, enforced by the same test
pattern), and `'unset'` is the expected resident steady-state: no date set, no throttle, chip
prompts nothing beyond Start-here.

**Deferred consumers:** blocked→interleaved qbank mix; plan-scheduled simulations;
dashboard-mode recommendation (the unread `cw_dashboard_v1.at` hook is noted for phase 2).

---

## Constraint & gate compliance

- Literal `cw_calib_v1`/`cw_shelf_date` keys only, inside snippet bodies → passes the hard
  namespace scan (`check-static-site.mjs:299-301,336-339`); **zero new computed-key call
  sites** → ratchet ceilings (`ms3:6`, `res:9`) untouched.
- No new QA-gate rules, no new SOFT message classes, no `qa-baseline.json` edits, no
  `_headers`/CSP edits, no new `tools/*.html` (no 4-registration cascade), no `*.pack.json`
  naming, no `site_manifest.json`/nav changes.
- `tool_registry.json`: **no edits** — neither writer tool is registered (11 of 22/24 entries
  exist; registry is convention-only, nothing cross-validates except the family pin at
  `test_family_systems_scenarios.py:88-91`, which is untouched because the family tool writes
  no ledger events). Registering both tools is optional follow-on work, out of scope.
- Shell edits stay clear of the frozen regions: the a11y raw-string pins
  (`spa-shell-a11y.test.mjs` — `#mPath`/`#mLib` exact tags, `.mobile-chrome{position:sticky`
  slice anchor, `Tool launcher badges` comment, `announceRoute(` count, `closeSheet` slice)
  and the `srs-home-counters` slice markers.
- Two-origin reality: the spine is per-browser-per-site; `rp_*` surfaces untouched.

## Test strategy

Mirror the SM-2 triad per module, dependency-free in root `tests/`:
- `tests/calib-ledger.test.mjs`, `tests/phase-policy.test.mjs` — behavior: evaluate the snippet
  file via `new Function` with the `memStorage()` stub, `Date.now` monkeypatched in try/finally.
  Pin: per-source ring trim; v-reset; enum rejection; `re`/`rq` semantics; all phase boundaries
  incl. `post` and `unset`; cap floor 5; local-midnight parsing.
- `tests/calib-wiring.test.mjs`, `tests/phase-wiring.test.mjs` — consumer roster pins: marker
  present exactly once per consumer source; no local `function calibLog(`/`function
  phasePolicy(`; literal `'cw_calib_v1'` appears ONLY in the snippet body; **both**
  `review.html` new-card call sites route through the shared helper; audience-token ban on
  phase copy.
- `test_common.py::TestSharedSnippets` — signature pins for both snippets + <60-char signature
  length assertions (T2b pattern from the capture spec).
- Home panel: extraction test slicing between the deliberate end-markers, asserting n-gating,
  first-exposure filtering, and the divergence count against a synthetic ledger.
- Expected green untouched: `sm2-behavior`, `family-srs-parity`, `srs-home-counters`,
  `spa-shell-a11y`, SP `ci-build-contract` fixtures, Playwright smoke. Visual baselines: the
  home panel and phase chip render inside `#content` → captured by `topic-*.png`? No — those
  capture a topic page, not home; **no baseline refresh expected** for PR-A/PR-B (verify at PR
  time; if the sidebar is untouched, `sidebar-*.png` cannot change).

## Effort

| Item | Estimate |
|---|---|
| PR-A: snippet + 2 writers + panel + erase/export + tests | 2–2.5 days |
| PR-B: snippet + both review call sites + userSet flag + home chip + tests | 1.5–2 days |
| **Phase 1 total** | **3.5–4.5 days** across 2 PRs |

## Sequencing

Binds to the three-spec merge order: **(0)** snippet-infrastructure PR (capture spec §Sequencing
step 1: `phi_heuristic.js` + its `SNIPPET_MARKERS` entry + shell marker + `tests/parallel-ceilings.test.mjs`
— see below) → **(1)** D/PR-1 offline shell → **(2) A/PR-A** → **(3)** ward capture (Cowork) →
**(4) A/PR-B**, then D/PR-3 (qbank capsule) → one visual-baseline refresh after the last
`#side`-touching merge (capture's desktop mount).

**`tests/parallel-ceilings.test.mjs`** (lands in PR 0, ~30 lines): asserts (a) per-site
computed-key counts in the built-or-source scan inputs equal `qa-baseline.json` exactly, and
(b) `SNIPPET_MARKERS` entry count equals a pinned constant. Every PR that adds a marker bumps
the constant in the same diff — turning the three silent second-merge traps (ratchet ceiling,
marker-dict conflict, baseline refresh timing) into named PR-time failures. PR-A and PR-B each
bump the pinned marker count in their own diff (as do D/PR-1 and D/PR-3 for theirs).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Ledger read/write drift between shell and tools | Medium | single injected body; wiring tests forbid hand-rolled access |
| Grade-suggestion refactor breaks review.html UX | Low | suggestion becomes a variable feeding both CSS and event; behavior pinned |
| Phase cap overrides learner intent | Medium | `userSet` flag; explicit choice always wins; chip explains the cap |
| Panel numbers disagree with legacy summary at activation | Low | one-sentence copy; fallback card below threshold |
| Concurrent-tab event loss | Low | accepted (bounded, invisible-by-design) |
| Marker-dict merge conflicts across agents | Medium | PR-0 ceilings test + serialized merge order |
