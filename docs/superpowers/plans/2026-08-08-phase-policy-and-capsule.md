# Rotation Phase Policy + Qbank Session Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two held PRs from the #317 specs now that ward capture (#323) has merged:
**PR-B** (rotation phase policy — `cw_shelf_date` finally governs the study diet) and **PR-3**
(interrupt-proof qbank session capsule), plus three small ride-along items Josh approved for
this window.

**Architecture:** Two build-injected snippets (`phase_policy.js`, `sess_capsule.js`) via the
`SNIPPET_MARKERS` mechanism; consumers are `review.html`, `question-bank-practice.html`, and the
shell. No existing-store version bumps. The specs are authoritative on design:
`docs/superpowers/specs/2026-08-05-shared-state-spine-design.md` §PR-B and
`…offline-shell-and-session-capsule-design.md` §PR-3 — this plan re-anchors them to
post-#323 main (`17dd86e`, spa_index.html = 1886 lines) and binds the four #323 integration
constraints below.

**Tech Stack:** ES5 single-file tools, `SNIPPET_MARKERS` injection, dependency-free `node:test`,
Playwright smoke, per-site static builds.

## Global Constraints

- Two PRs, serialized: PR-B (branch `claude/phase-policy`) merges before PR-3 (branch
  `claude/qbank-capsule`, cut from main after PR-B lands).
- Snippet rules: first stripped `function ` line <60 chars and unique (existing signatures:
  `applyGrade(card, grade, opts)`, `looksLikePhi(t)`, `registerClerkshipSW()`, `calibLog(evt)`);
  marker exactly once per consumer; never in `_prototypes/sp-interview/**` (eval-source tests).
- `tests/parallel-ceilings.test.mjs`: `EXPECTED_MARKER_COUNT` is **4** on main → PR-B bumps to
  **5** (PHASE_POLICY), PR-3 to **6** (SESS_CAPSULE), each in its own diff.
- Literal `cw_*` keys only inside snippet bodies; ZERO new computed-key call sites (exact
  ceilings ms3:6 / res:9); `cw_srs_v1` version untouched (v-gate wipe hazard).
- All learner-facing copy audience-neutral (`/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`
  ban — "Exam in N days", never "Shelf") and no `RESIDENT_REBRAND` needle collisions. NOTE: the
  shell's OWN pre-existing shelf copy says "Shelf in N days" — do not touch it; the ban applies
  to NEW strings this plan adds.
- **#323 constraint 1:** the shell has THREE home re-render paths (`[data-mc-mode]` :1623,
  `[data-dash-mode]` :1869, `capHomeRefresh()` :1234). Reuse `capHomeRefresh()`; add no fourth.
- **#323 constraint 2:** `__afterSpecial`'s `__home__` click delegation handles `[data-cap-*]`
  with early returns. This plan adds NO new delegation branches at all: the phase chip is
  non-interactive except an unset-state button reusing the existing `data-pt="start"` pattern
  already handled by the pretest delegation.
- **#323 constraint 3:** the local-midnight parse (`+'T00:00:00'`) exists at spa_index :1759 and
  :1826. PR-B extracts ONE injected helper and rewires both — never a third copy. The phase chip
  and the countdown card must agree at every boundary by construction.
- **#323 constraint 4:** renderHome is crowded; the phase chip renders INSIDE the existing
  shelf-countdown line region (immediately after the `hmRoot` H1/subhead area where `shelfDays`
  already renders, :1758-1766) as a small inline chip — not a 15th `hm-sec`.
- Verification per PR: 4 Python validators, `test_common.py`, `node --test tests/*.test.mjs`,
  contrast check, `build_and_check.sh ms3` AND `res`, `bash _prototypes/sp-interview/tests/run-all.sh`,
  plus targeted Playwright projects when the shell changes. **All verification chains fail-fast
  (`set -e`).** ci.yml is NOT touched by this plan (no new CI steps → no digest churn).
- Anchors here were verified at `17dd86e`; re-verify in your checkout before editing.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

# PR-B — Rotation phase policy (branch `claude/phase-policy`)

### Task 1: `phase_policy.js` snippet (incl. shared date helper) + behavior tests + pins

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/phase_policy.js`
- Modify: `common.py` (`SNIPPET_MARKERS` + `"/*__PHASE_POLICY__*/": "phase_policy.js"`),
  `tests/parallel-ceilings.test.mjs` (4→5), `test_common.py` (signature pin)
- Create: `tests/phase-policy.test.mjs`

**Interfaces:**
- Produces: `shelfDaysUntil(shelfStr, nowMs)→Number|null` (local-midnight; null on absent/invalid)
  and `phasePolicy(nowMs)→{phase,daysToShelf,newPerDayCap,label}` reading literal `cw_shelf_date`.
  Phases: `>28 'encode'(cap 12) · 15–28 'interleave'(12) · 7–14 'consolidate'(8) · 0–7 'taper'(5)
  · <0 'post'(12, review-forward label) · no/invalid date 'unset'(12, prompts Start-here)`.

- [ ] **Step 1: failing behavior tests** (`new Function` + `memStorage()` stub per
  `tests/sm2-behavior.test.mjs`; `Date.now` fixed via parameter — both functions take `nowMs`,
  no monkeypatching needed). Pin: every boundary at local midnight (29/28, 15/14, 8/7, 1/0/−1
  days); cap floor 5 (slider min, `review.html:289`-region); `'unset'` on absent AND on
  `'banana'`; `'post'` on negative days with cap 12; `shelfDaysUntil` agrees with the shell's
  existing idiom (construct the expected value with `new Date(s+'T00:00:00')` inside the test);
  labels audience-neutral (regex ban applied to every returned label).
- [ ] **Step 2: implement** (first function line `function shelfDaysUntil(shelfStr, nowMs){`
  — 41 chars, unique):

```js
/* Rotation phase policy — cw_shelf_date finally governs the study diet.
   shelfDaysUntil() is THE local-midnight date helper: spa_index.html's two prior inline
   copies (countdown card + shelfIntensityHtml) now call this so the phase chip and the
   countdown can never disagree at a boundary. phasePolicy() is pure derivation; the cap
   floor (5) stays inside the Daily Review slider's range. Copy rule: labels ship to both
   sites — audience-neutral, "Exam", never "Shelf". */
function shelfDaysUntil(shelfStr, nowMs){
  if(!shelfStr) return null;
  var t=new Date(shelfStr+'T00:00:00').getTime();
  if(isNaN(t)) return null;
  return Math.ceil((t-(nowMs||Date.now()))/86400000);
}
function phasePolicy(nowMs){
  var shelf=null;
  try{ shelf=localStorage.getItem('cw_shelf_date'); }catch(_){ }
  var days=shelfDaysUntil(shelf, nowMs);
  if(days===null) return {phase:'unset',daysToShelf:null,newPerDayCap:12,label:'Set an exam date on Start-here to tune pacing.'};
  if(days<0)  return {phase:'post',daysToShelf:days,newPerDayCap:12,label:'Exam date passed — review mode.'};
  if(days<=7) return {phase:'taper',daysToShelf:days,newPerDayCap:5,label:'Exam in '+days+' day'+(days===1?'':'s')+' — taper new cards, review daily.'};
  if(days<=14)return {phase:'consolidate',daysToShelf:days,newPerDayCap:8,label:'Exam in '+days+' days — consolidate: fewer new cards, more retrieval.'};
  if(days<=28)return {phase:'interleave',daysToShelf:days,newPerDayCap:12,label:'Exam in '+days+' days — mix topics as you practice.'};
  return {phase:'encode',daysToShelf:days,newPerDayCap:12,label:'Exam in '+days+' days — steady building.'};
}
```

- [ ] **Step 3:** marker entry; ceilings 4→5; `test_common.py` expansion + signature pins
  (mirror the CALIB_LOG pin pattern). Run `python3 …/test_common.py` +
  `node --test tests/phase-policy.test.mjs tests/parallel-ceilings.test.mjs` → GREEN.
- [ ] **Step 4: Commit** `feat(build): rotation-phase-policy snippet (PHASE_POLICY marker)`

### Task 2: Daily Review consumer — capped new cards + userSet flag + phase line

**Files:**
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html` (marker near
  `/*__SM2_APPLY_GRADE__*/` ~:118; BOTH newRemain sites :159-160 and :174-175; `setNewPerDay`
  :207)
- Create: `tests/phase-wiring.test.mjs`

**Interfaces:**
- Consumes: `phasePolicy(nowMs)` from Task 1.
- Produces: `effectiveNewPerDay(s)` — the single helper BOTH call sites use.

- [ ] **Step 1:** Add near the SM-2 region (after the injected snippets):

```js
function effectiveNewPerDay(s){
  var set=(s.settings&&s.settings.newPerDay)||12;
  if(s.settings&&s.settings.userSet) return set;             /* explicit choice always wins */
  var cap=12; try{ cap=phasePolicy().newPerDayCap; }catch(_){ }
  return Math.min(set, cap);
}
```

  Rewire :159 (`metrics()`) and :174 (`start()`) to
  `Math.max(0, effectiveNewPerDay(<store>) - (…newToday||0))` — the review of the original
  draft proved patching only the display site leaves the queue unthrottled; the wiring test
  pins BOTH. `setNewPerDay` (:207) additionally sets `s.settings.userSet=true` (all `cw_srs_v1`
  loaders preserve unknown settings fields under v===1 — verified previously; no version bump).
- [ ] **Step 2:** One phase line on the dashboard (near the existing stats row): render
  `phasePolicy().label` in a `.sub`-styled div when phase is not `'unset'`; when `'unset'`,
  render nothing here (Start-here prompting lives on the home chip). No new delegation.
- [ ] **Step 3:** `tests/phase-wiring.test.mjs`: marker exactly once; no local
  `function phasePolicy(`/`function shelfDaysUntil(`; literal `'cw_shelf_date'` in review.html
  appears ONLY inside the injected body (source has none — verify source, not built); BOTH
  newRemain call sites reference `effectiveNewPerDay` (regex with nonzero-extraction guards);
  `setNewPerDay` sets `userSet`. RED-teeth one pin, restore.
- [ ] **Step 4:** `node --test tests/*.test.mjs` + `build_and_check.sh ms3` and `res`; grep
  built review.html for the expanded body exactly once. **Commit**
  `feat(review): phase-capped new cards with learner-override (userSet)`

### Task 3: Home phase chip (shell)

**Files:**
- Modify: `spa_index.html` — marker in the un-IIFE'd top-level script (script 2 owns
  renderHome; place marker near the CALIB_LOG one), chip render inside the countdown region
  (:1758-1766), rewire the two inline midnight parses (:1759, :1826) to `shelfDaysUntil`
- Create: `tests/phase-chip.test.mjs` (slice-marker extraction test)

- [ ] **Step 1:** Rewire :1759 to `var shelfDays=shelfDaysUntil(shelf);` and
  `shelfIntensityHtml` (:1826) to use `shelfDaysUntil(shelf)` — deleting both inline
  `+'T00:00:00'` parses. (The PHASE_POLICY marker must sit ABOVE both call sites in the same
  script; verify script boundaries first — renderHome's script opens after the capture block.)
- [ ] **Step 2:** Chip: in the `hmRoot` header region (immediately after the existing
  `shelfDays` line renders into the subhead area, before `capTriageHtml()` at :1772), wrap in
  slice markers `/* ---- phase chip ---- */` … `/* ---- end phase chip ---- */`:
  non-`'unset'` → a small inline chip `<span class="hm-phase">`+`esc(p.label)`+`</span>`
  (CSS: pill, `var(--accent-light)` bg / `--accent-dark` text — AA-verified pair, both
  themes); `'unset'` → reuse the EXISTING Start-here affordance pattern
  (`<button class="hm-inl" data-pt="start">` as `shelfIntensityHtml` already does) so no new
  click delegation exists. Re-render happens naturally via `capHomeRefresh()`/renderHome —
  no new path (constraint 1).
- [ ] **Step 3:** `tests/phase-chip.test.mjs`: slice the chip region; with stubbed
  `phasePolicy` assert non-unset renders the label, unset renders the `data-pt="start"`
  button; assert the file contains ZERO `+'T00:00:00'` literals outside the injected snippet
  body (the dedup pin — this is the test that keeps constraint 3 true forever); dueBreakdown
  and calib-panel slice regions untouched (`node --test tests/srs-home-counters.test.mjs
  tests/calib-panel.test.mjs tests/spa-shell-a11y.test.mjs` green).
- [ ] **Step 4:** Both builds + gate; `cd tests/smoke && npx playwright test --project=nav-ms3
  --project=faculty-console --project=offline` (shell changed — canaries). **Commit**
  `feat(home): rotation phase chip + single-source shelf-date parsing`

### Task 4: Ride-alongs — T3b three-copy pin + reflection copy stamp

**Files:**
- Modify: `tests/ward-capture.test.mjs` (T3b → all three PHI copies),
  `02_Clinical_Skills/Reflection_PIF/reflection-and-pif-set.html` (`copyAll()` ~:151)

- [ ] **Step 1:** Extend T3b: extract the `var PHI_PATTERNS=` line from `phi_heuristic.js`,
  `_prototypes/sp-interview/sp-interview.html`, AND `_prototypes/sp-interview/sp-interview.preview.html`;
  assert all three byte-identical (message names all three files). RED-teeth by mutating the
  preview copy in-memory within the test? No — mutate on disk, observe, restore, document.
- [ ] **Step 2:** Reflection stamp: in `copyAll()`'s assembled text, append the fixed final
  line (mirroring `decisional-capacity-module.html:139`'s pattern):
  `Written with a private reflection tool — personal draft, shared by choice.`
  (Reflection is learner-private free text, not a clinical note — the capacity wording would
  be wrong here; this stamp marks provenance + intentional sharing. Audience-neutral, no
  needle collision — run `tests/shell-copy.test.mjs` pattern manually against it.)
- [ ] **Step 3:** `node --test tests/ward-capture.test.mjs` green; ms3 build. **Commit**
  `test(phi): pin all three PHI_PATTERNS copies + stamp reflection clipboard egress`

### Task 5: PR-B verification + PR

- [ ] **Step 1:** Full fail-fast verification suite (Global Constraints list).
- [ ] **Step 2:** Push `claude/phase-policy`, `gh pr create` — body: the four #323 constraints
  and how each is honored; userSet override semantics; the T00:00:00 dedup pin; ride-alongs;
  note "after merge, trigger the Refresh visual baselines workflow_dispatch — riding along per
  Josh (sidebar/home changed across #323 + this PR)".

---

# PR-3 — Qbank session capsule (branch `claude/qbank-capsule`, after PR-B merges)

### Task 6: #324 post-merge follow-ups — userSet backfill + phase-label copy guard

**Files:**
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html` (`loadS()` :106),
  `tests/phase-wiring.test.mjs`, `tests/shell-copy.test.mjs`

**Context (Josh's post-merge review of #324):** learners who set their slider BEFORE #324 have no
`userSet` flag, so the phase cap silently overrides their explicit choice once — time-sensitive
(shipped mid-rotation). Verified premise: ALL four `cw_srs_v1` writers default `newPerDay:12`
(family-systems :142, review freshStore :105 / loadS fallback :106, spa seedSRS :616, qbank
:240), so `newPerDay !== 12` proves an explicit pre-#324 choice. Separately: the six
`phase_policy.js` labels ship verbatim to the resident site but no test reads them —
"Exam, never Shelf" is enforced by a comment only.

- [ ] **Step 1: failing test** in `tests/phase-wiring.test.mjs`: evaluate `loadS()` (extraction
  per the existing wiring-test pattern) against three stubbed stores: `{newPerDay:20}` no
  userSet → backfilled `userSet===true`; `{newPerDay:12}` no userSet → NOT backfilled;
  `{newPerDay:20, userSet:false}`? — impossible state today (only setNewPerDay writes it, as
  true); treat any existing `userSet` key as authoritative: backfill ONLY when the key is
  absent (`!('userSet' in s.settings)`).
- [ ] **Step 2: implement** in `loadS()`'s `v===1` branch, after the settings fallback:

```js
/* #324 backfill: sliders set before userSet existed. Every cw_srs_v1 writer defaults
   newPerDay to 12, so a non-12 value proves an explicit choice. Learners who explicitly
   chose exactly 12 are irreducibly indistinguishable from the default and stay cappable. */
if(!('userSet' in s.settings) && s.settings.newPerDay && s.settings.newPerDay!==12){ s.settings.userSet=true; }
```

- [ ] **Step 3: label guard** — `tests/shell-copy.test.mjs` `extractShellCopy()` gains
  `phase_policy.js`: extract every `label:'…'` literal (regex over the snippet source, by
  role, same as the `sw_register.js` pattern), assert ≥6 extracted (nonzero guard), run each
  through the audience-token ban AND the `RESIDENT_REBRAND` needle check. RED-teeth: feed a
  mutated in-memory label containing "Shelf", observe FAIL (in-memory only — no disk writes,
  per the Task 4 lesson).
- [ ] **Step 4:** `node --test tests/phase-wiring.test.mjs tests/shell-copy.test.mjs
  tests/*.test.mjs` green; res build; **Commit**
  `fix(review): backfill userSet for pre-#324 sliders + guard phase-label copy`

### Task 7: `sess_capsule.js` snippet + behavior tests + pins

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/sess_capsule.js`
- Modify: `common.py` (+`"/*__SESS_CAPSULE__*/": "sess_capsule.js"`), ceilings 5→6,
  `test_common.py` pin
- Create: `tests/sess-capsule.test.mjs`

**Interfaces:**
- Produces: `sessLoad(tool, nowMs)→session|null` (expiry-checked; nowMs optional),
  `sessSave(tool, session)`, `sessClear(tool)`. Store `cw_sess_v1` = `{v:1,sessions:{<tool>:{at,expiresAt,queueIds,idx,
  responses:[{id,correct,confidence}]}}}`; literal key ONLY in the snippet body.

- [ ] **Step 1: failing tests** (memStorage + fixed nowMs parameter): round-trip; 24h expiry
  (expired → null AND entry pruned on load); corrupt store → null, no throw; v-reset;
  `sessClear` removes only its tool's slot; first function line
  `function sessLoad(tool, nowMs){` (28 chars, unique).
- [ ] **Step 2: implement** per the spec §PR-3 (expiresAt = at + 86400000; prune-on-load).
- [ ] **Step 3:** pins + ceilings; suites green; builds unaffected (marker unconsumed yet).
- [ ] **Step 4: Commit** `feat(build): session-capsule snippet (SESS_CAPSULE marker)`

### Task 8: Qbank checkpoint + resume wiring

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (marker;
  `beginSession` :660 funnel; advance path after `SESSION.responses.push` :818/:826;
  completion → `sessClear`; `resume=1` boot path via `activeItems()` :297)
- Test: extend `tests/sess-capsule.test.mjs` with wiring pins

- [ ] **Step 1:** Checkpoint at question boundaries ONLY (on advance/skip — never
  mid-question; `showQuestion` :687 resets unreconstructable display state):
  `sessSave('qbank',{at,expiresAt,queueIds,idx,responses})` where `responses` carries
  `{id,correct,confidence}` per answered item (so a resumed `showSummary` covers the WHOLE
  session); delete on summary. `remaining`/`responsesDone` are NOT stored (derivable).
- [ ] **Step 2:** On load with `?resume=1` (rides `toolExtraFromParams` :636 — no shell
  change): `sessLoad('qbank')` → rebuild queue from `queueIds` filtered through
  `activeItems()` (drops ids removed by a deploy), restore `idx`/`SESSION.responses`,
  continue; absent/expired → normal start. Grading state is NEVER in the capsule (answers
  already persist per-interaction at :818-826 — no double-write).
- [ ] **Step 3:** Wiring pins: marker once; literal `cw_sess_v1` absent from the tool source;
  checkpoint call reachable only from the advance path (regex on the handler), sessClear on
  summary; `tool_registry.json` — verify question-bank-practice is still unregistered (as of
  `17dd86e`); if #323 registered it, add `cw_sess_v1` to its storageKeys, else no edit.
- [ ] **Step 4:** suites + ms3 build; manual browser check of interrupt→resume via the built
  site (document). **Commit** `feat(qbank): question-boundary session capsule + resume`

### Task 9: Home Resume row (merged into "Continue where you left off")

**Files:**
- Modify: `spa_index.html` — the shell needs the `SESS_CAPSULE` marker too (for `sessLoad`);
  add it beside the PHASE_POLICY one; the row lands INSIDE the existing
  "Continue where you left off" section, slice-markered
- Create: `tests/resume-card.test.mjs`

**Decision (stated per Josh's request):** the qbank Resume row MERGES into the existing
"Continue where you left off" section rather than sitting apart. Why: identical learner intent
(pick up where you stopped), and renderHome crowding is a binding constraint — a separate
Resume section would be the 15th. Mechanics: the section's gate widens from `if(last…)` to
`if(last… || sess)`; when both exist the SESSION row renders FIRST (24 h expiry + progress
state make it more perishable and more actionable than a page bookmark), page-resume second;
heading unchanged.

- [ ] **Step 1:** Row renders only when `sessLoad('qbank')` returns a session:
  "Resume question bank — N left, ~M min" (M = remaining × 45s static estimate per spec;
  N = `queueIds.length - idx`), deep-linking
  `?tool=question-bank-practice.html&resume=1` via the existing `.hm-li` + `data-f` pattern
  the section's page row already uses (its delegation branch exists; no new branches).
  Re-render via existing paths only (constraint 1).
- [ ] **Step 2:** Slice-marker extraction test: session row present with a stubbed live
  session (and ordered before the page row when both exist), absent when null; existing slice
  suites green (`srs-home-counters`, `calib-panel`, `phase-chip`, `spa-shell-a11y`).
- [ ] **Step 3:** Builds + shell canaries (`nav-ms3`, `offline`). **Commit**
  `feat(home): resume-session card for the question bank`

### Task 10: PR-3 verification + PR

- [ ] **Step 1:** Full fail-fast suite.
- [ ] **Step 2:** Push + `gh pr create` — body: question-boundary-only rationale (attack
  finding), whole-session summary via captured responses, 24h expiry, no-double-write
  invariant, ceilings at 6.
