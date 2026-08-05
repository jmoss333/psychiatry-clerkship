# Tools Quick-Wins Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 13 quick-win improvements from the 2026-08-04 tools review — retrieval-practice, calibration, routing, and governance upgrades that reuse existing attested content across 12 mostly-disjoint files.

**Architecture:** Each task edits one tool (single-file HTML, React 18 UMD via `React.createElement` or vanilla JS) or one platform file (SPA shell, SM-2 grader, QA gate). No new build steps; new behavior rides existing localStorage stores, the build-injected SM-2 marker, and the existing Netlify form. Tasks are independent except where noted; execute in order.

**Tech Stack:** Vanilla JS / React 18 UMD (no JSX, no Babel), Python build pipeline, node:test, Netlify Forms.

## Global Constraints

- localStorage keys MUST be namespaced `cw_*` (shared hub) or `rp_*` (resident) — the QA gate hard-fails any other prefix.
- Single-file HTML tools; **no runtime CDN references** (QA gate hard-fails). Do not add script tags to external hosts.
- **No dose literals** in `rp-*` / `*-trainer` tools (QA gate HARD).
- Crisis contacts only via the `crisis_resources.json` injection — never hard-code a crisis number.
- **No PHI**: any new free-text input must carry a "no patient information" style warning (copy the pattern from rp-brief-psych's plan label field).
- Code style: 2-space indent, single quotes in JS, `var` + function style matching each file's existing idiom (these tools deliberately avoid ES6+ syntax — match the file you are editing).
- **topic_meta.json may only be edited by following the `topic-meta-author` skill** (invoke via the Skill tool; if unavailable read `.claude/skills/topic-meta-author/SKILL.md` first) and must pass `python3 13_Faculty_Resources/_automation/validate_topic_meta.py`.
- SM-2 behavior is pinned by `tests/sm2-behavior.test.mjs` and `tests/family-srs-parity.test.mjs` — grader changes must be backward-compatible by default and extend those tests deliberately.
- Verification commands (run from repo root):
  - `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`
  - `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`
  - `node --test tests/*.test.mjs`
- Commit style: `feat(scope): summary` / `fix(scope): summary`, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Never edit generated `_build/` output — edit source files only.

---

### Task 1: Question bank "Redo my misses" and "Confidently wrong" session presets

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`

**Interfaces:**
- Consumes: `qbLoad()` (cw_qb_v1 map keyed by item id; records carry `correct:boolean`, `confidence:'guess'|'likely'|'certain'`, `certWrong:true` when confidently wrong — see ~line 207-221), `activeItems()`, `buildQueue(items, catFilter, diffFilter, sizeLimit)` (~line 267), `startSession(...)` (~line 603), `renderSetup()` (~line 299).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the setup + queue code.** Read `renderSetup()`, `startSession()`, `buildQueue()`, and the cw_qb_v1 record shape to see how sessions start and how the setup screen is wired.
- [ ] **Step 2: Add two preset entry points to the setup screen.** In `renderSetup()`, add a "Focus modes" row with two buttons:
  - **Redo my misses** — queue = `activeItems()` whose id has a cw_qb_v1 record with `correct === false`.
  - **Confidently wrong** — queue = `activeItems()` whose record has `certWrong === true`.
  Each button shows its live count, e.g. `Redo my misses (7)`; render disabled with `(0)` when empty. Clicking starts a session with that exact queue (shuffled), bypassing category/difficulty filters. Implement as a thin wrapper that calls the existing session-start path with a prebuilt queue (add an optional queue parameter to `startSession` or a sibling `startSessionWithQueue(queue)` — match file idiom).
- [ ] **Step 3: Preserve the session player unchanged.** Confidence capture, grading, srsUpdate, and the summary must behave identically in these modes. A correct re-attempt in any mode overwrites the record via the existing write path (this is what clears an item from the presets — desired).
- [ ] **Step 4: Verify.** `node --test tests/*.test.mjs` passes; `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` passes. Manually sanity-check the built file renders the new row (grep the built `_build/ms3/tools/question-bank-practice.html` for the button labels).
- [ ] **Step 5: Commit.** `feat(qbank): add redo-my-misses and confidently-wrong session presets`

---

### Task 2: Wire The Interview Room and One Patient, Six Weeks into the adaptive/routing layer

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `topic_meta.json` (ONLY via the topic-meta-author skill)

**Interfaces:**
- Consumes: the shell's **duplicated** literal maps — `PRACTICE_LABELS` (~line 685) + `LAB` (~line 1066), `PRACTICE_PAGE_TOOLS` (~line 687) + `PAGE_TOOLS` (~line 1076), `ICON` (~line 1067), `DASH_CONFIG` (~line 1159). Both copies of each pair are live (IIFE scoping) and MUST be edited in lockstep.
- Produces: `'sp-interview.html'` and `'one-patient-six-weeks.html'` as registered launcher keys (Task 3's chips and Task 13's integrity scan will see them).

- [ ] **Step 1: Add labels + icons (both copies).** Add to BOTH `PRACTICE_LABELS` and `LAB`: `'sp-interview.html':'The Interview Room — AI Patient'`, `'one-patient-six-weeks.html':'One Patient, Six Weeks'`. Add to `ICON`: `'sp-interview.html':'interview-circle'`, `'one-patient-six-weeks.html':'review'` (reusing existing icon keys). Do NOT add either to `SAFE`.
- [ ] **Step 2: Add page→tool dock entries (both copies).** Add to BOTH `PRACTICE_PAGE_TOOLS` and `PAGE_TOOLS`: `'pg_interview.md':['sp-interview.html','mse.html']`, append `'sp-interview.html'` to the existing `'pg_suicide.md'` and `'t_psychosis.md'` arrays, and add `'collateral_workflow.md':['one-patient-six-weeks.html','family-systems.html']`.
- [ ] **Step 3: Add dashboard-mode routing.** Read `DASH_CONFIG` (~line 1159). Add `sp-interview.html` to the tool lists of the ward, safety, and family modes; add `one-patient-six-weeks.html` to ward and shelf modes. Use the same entry shape as neighboring tool entries (via `toolAction(...)` if that's how tools appear there).
- [ ] **Step 4: topic_meta relatedTools.** Invoke the Skill tool with `topic-meta-author` (fallback: read `.claude/skills/topic-meta-author/SKILL.md` and follow it exactly). Add `sp-interview.html` to `relatedTools` for the `pg_interview.md`, `pg_suicide.md`, and `t_psychosis.md` entries, and `one-patient-six-weeks.html` for `collateral_workflow.md`. Run `python3 13_Faculty_Resources/_automation/validate_topic_meta.py` — must pass.
- [ ] **Step 5: Verify.** Both site builds pass. Grep built `_build/ms3/index.html` to confirm both new keys appear in both map copies. Confirm the mobile "All tools" sheet picks them up automatically (it renders `Object.keys(LAB)`).
- [ ] **Step 6: Commit.** `feat(shell): route the Interview Room and One Patient into docks, dashboard modes, and mobile sheet`

---

### Task 3: Practice-aware search results

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`

**Interfaces:**
- Consumes: `runSearch(q)` (~line 984) and the result-rendering block (~lines 1030-1040, `SI.docs`); topic_meta data already loaded by the shell for topic pages (locate the variable that holds it — the "Test yourself" widget builder uses it); Task 2's launcher keys.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Locate the result renderer and the in-memory topic_meta map.** Read the search block (`runSearch`, `renderResults`) and find where topic_meta entries are accessible by page file id.
- [ ] **Step 2: Append at most one action chip per result row.** For a result whose page has a topic_meta entry: if it has a `quiz`, append a small `Test yourself` chip; else if it has `communicationCases`, append `Spoken drill`; else if `relatedTools` is non-empty, append the first tool's short label. The chip is an `<a>` with the same `?page=`/`?tool=` href convention the shell already intercepts (for the quiz chip, link to the page itself — the widget is on-page; for cases, use the existing `communicationHref(id)`-style deep link if available in scope, otherwise `?tool=communication-practice.html`). Keyboard-accessible (real anchors), no new listeners beyond the existing delegated click handling.
- [ ] **Step 3: Keep it cheap.** No new data loads: only what the shell already has in memory. If topic_meta is not reachable from the search IIFE's scope, expose the minimal lookup (a `window.__cwTopicMeta`-free solution — pass via the same pattern the other cross-IIFE fallbacks use, e.g. a `typeof` guard).
- [ ] **Step 4: Verify.** Both builds pass; grep built index.html for the chip class; confirm search still renders results for a query with no topic_meta (no chip, no error).
- [ ] **Step 5: Commit.** `feat(shell): add practice-action chips to search results`

---

### Task 4: rp-brief-psych — retrieval-first cue mode + history/coverage panel

**Files:**
- Modify: `_prototypes/brief-psych/rp-brief-psych.html`

**Interfaces:**
- Consumes: cue grid render (~line 202: each cue shows `c.label` + `c.mechanism`), technique list `t.mechanism` (~line 173), plan store `PKEY='rp_bp_v1'` (~line 94), pack-driven content (rp-brief-psych.pack.json).
- Produces: extended `rp_bp_v1` records (Task 12 does not depend on this, but both tasks touch this file — Task 12 runs later; leave FlagButton untouched here).

- [ ] **Step 1: Read the cue-grid and plan-store code.** Understand how cues render, how a cue routes to a technique, and the exact `rp_bp_v1` record shape.
- [ ] **Step 2: Add a Practice/Reference mode toggle (default Practice).** In Practice mode the cue grid hides each cue's mechanism line (render the label only; keep the safety cue's `⚑ Route to your team` visible always — the suicidality routing must never be hidden). After the learner picks a cue, insert a two-step predict screen before the technique reveal: (a) "Which mechanism is driving this?" — 6 tappable options enumerated from the distinct `mechanism` values in the pack; (b) "Which technique fits?" — 6 options from the technique titles. Then reveal the existing technique card, marking each prediction right/wrong against the pack's own mapping (pure UI reordering of pack content; no new clinical claims). Reference mode = current behavior exactly.
- [ ] **Step 3: History & coverage panel.** Add a History section that aggregates ALL `rp_bp_v1` entries (not just today's): per-technique attempt counts, did/tried/didn't distribution, and a "not yet practiced" line listing mechanisms with zero entries. Keep the existing today-filtered plan view unchanged. Extend stored plan entries with prediction outcomes (`predMech:true|false, predTech:true|false`) backward-compatibly (older entries lack the fields — render them as unknown, never crash).
- [ ] **Step 4: Verify.** `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` passes (rp tools ship on the resident site; the dose-literal and localStorage-prefix gates run there). Confirm the safety cue still hard-routes without a predict step.
- [ ] **Step 5: Commit.** `feat(rp-brief-psych): retrieval-first practice mode and all-time history panel`

---

### Task 5: Oral-presentation module — rep log + post-rep self-rating rubric

**Files:**
- Modify: `02_Clinical_Skills/Oral_Presentations/oral-presentation-module.html`

**Interfaces:**
- Consumes: timer state (`sec`, `run`, `microKey`, `microSec`, `microRun`, ~lines 132-140), `STEPS` (~line 103) with per-step pacing targets, the Do/Don't card content (~lines 195-205).
- Produces: `cw_orals_v1` store: `{v:1, reps:[{at:ISOdate, format:'full'|'collateral'|'rounds', total:seconds, perStep:[{k,target,actual}]|null, rubric:{oneLiner,siHi,synthesis,planByProblem,endedWithAsk}|null}]}` (newest last, cap 50).

- [ ] **Step 1: Read the timer flow.** Identify where a timed rep ends (timer stop for the full 7-step timer and for each micro-format).
- [ ] **Step 2: Persist each completed rep.** On stop of a run that lasted ≥30 seconds, append a rep record to `cw_orals_v1` (localStorage, defensive JSON parse, cap 50 by dropping oldest). Record per-step actual-vs-target where the step timings are known (full format); `null` otherwise.
- [ ] **Step 3: Post-rep rubric.** When the rep is saved, show a 5-item binary self-check whose labels are lifted **verbatim** from the module's existing Do/Don't card text (led with a one-liner; SI/HI stated explicitly; assessment synthesized rather than recapped; plan organized by problem; ended with the question/disposition ask). Store the five booleans on the rep record. Skippable ("Skip" stores `rubric:null`).
- [ ] **Step 4: "Last 5 reps" panel.** On the Practice tab, render the last 5 reps: date, format, total time vs target, rubric score n/5, plus one calibration line computed over those reps when per-step data exists, e.g. `You are consistently ~40s over — usually the Plan step` (compute: mean overage of the worst mean-overage step; only render when ≥2 full reps).
- [ ] **Step 5: Verify.** MS3 build + gate passes (new `cw_orals_v1` key satisfies the cw_ prefix rule). Reload page → reps persist; with 0 reps nothing new renders.
- [ ] **Step 6: Commit.** `feat(oral): persist timed reps with self-rating rubric and pacing calibration`

---

### Task 6: Interview Circle — blank-circle recall mode

**Files:**
- Modify: `02_Clinical_Skills/Interviewing/interview-circle.html`

**Interfaces:**
- Consumes: the vanilla-JS node builder that fills `#nodes` (~line 97) with `.node` elements containing `.tt` (title) and `.sb` (subtitle).
- Produces: `cw_circle_v1` `{v:1, lastTested:ISOdate}`.

- [ ] **Step 1: Add a "Test yourself" toggle button** beside the existing theme toggle. On activate: every node's `.tx` content is masked (CSS class that hides `.tt`/`.sb` text and shows a `?` placeholder; the colored chip/icon stays visible as the recall cue). Clicking/Enter-ing a masked node reveals that node. A "Reveal all" button ends the round; when all 8 are revealed (by clicks or reveal-all), show a one-line completion note ("Recalled from memory: N of 8") counting nodes the learner revealed individually.
- [ ] **Step 2: Accessibility.** Masked nodes get `role="button"`, `tabIndex=0`, Enter/Space handler, `aria-label="Hidden domain — reveal"`; restore normal semantics when revealed.
- [ ] **Step 3: Persist last-tested.** On round completion write `cw_circle_v1` `{v:1,lastTested:date}`. If `lastTested` is >7 days old (or absent), render a subtle "Test yourself — it's been a while" hint on the toggle.
- [ ] **Step 4: Verify.** MS3 build + gate passes; toggle works with keyboard only; dark mode unaffected.
- [ ] **Step 5: Commit.** `feat(interview-circle): blank-circle recall mode with last-tested nudge`

---

### Task 7: Decision Aids — cover-and-recall toggle on the trees

**Files:**
- Modify: `04_Acute_and_Safety/Decision_Aids/decision-aids.html`

**Interfaces:**
- Consumes: `TREES` (~line 134: entries with `ruleOut[]` and `firstMove`), the tree render function.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add a per-tree "Quiz me" toggle.** When active for a tree: each `ruleOut` chip's text and the `firstMove` text are covered (blurred/`?`-masked, individually tap-to-reveal). The learner generates the rule-out list and first move aloud/mentally, then reveals to check. Toggle off restores normal display. State is per-tree, in-memory only (no persistence).
- [ ] **Step 2: Accessibility + theming.** Masked elements are buttons (`aria-label="Covered — reveal"`), keyboard operable; masking works in both light and dark themes (this tool has dark mode via `cw_theme`) — use background/color swap, not `filter:blur` alone (blur leaks text to screen readers and print; ensure masked text is not exposed to AT until revealed, e.g. render placeholder text and swap on reveal).
- [ ] **Step 3: Verify.** MS3 build + gate passes (contrast checks run on this tool — keep AA contrast for mask placeholders in both themes).
- [ ] **Step 4: Commit.** `feat(decision-aids): cover-and-recall quiz toggle on rule-out trees`

---

### Task 8: Family Systems — handoff and safety-escalation retrieval prompts

**Files:**
- Modify: `06_Family_and_Relational/family-systems-practice.html`

**Interfaces:**
- Consumes: `DEFAULT_RETRIEVAL` (~line 223), `revealContent(it, rp)` (~line 230 — already generic over `sections[revealFrom]`), scenario JSON sections (verified keys: `ask, avoid, handoff, prepare, safety`).
- Produces: two new FAM# retrieval cards per scenario (ids flow through the existing card-id scheme).

- [ ] **Step 1: Append two prompts to `DEFAULT_RETRIEVAL`:**
```js
{id:'handoff',prompt:'Say the rounds handoff for this family — what must it separate?',revealFrom:'handoff'},
{id:'safety',prompt:'When do you stop ordinary information-gathering and escalate — and to whom?',revealFrom:'safety'}
```
- [ ] **Step 2: Confirm card-id stability.** Check how retrieval card ids are composed (scenario id + retrieval id) and that existing FAM# cards in `cw_srs_v1` are unaffected; the two new cards must yield new distinct ids, not collide.
- [ ] **Step 3: Verify.** `node --test tests/*.test.mjs` (family-srs-parity must stay green); MS3 build + gate passes; scenarios with `handoff`/`safety` sections now render 5 retrieval cards.
- [ ] **Step 4: Commit.** `feat(family-systems): retrieve the handoff and safety-escalation sections`

---

### Task 9: Reflection & PIF — opt-in on-device drafts + week-1 vs week-6 confrontation

**Files:**
- Modify: `02_Clinical_Skills/Reflection_PIF/reflection-and-pif-set.html`

**Interfaces:**
- Consumes: prompt list + `txt` state, `assemble()`/`copyAll()` (~lines 74-87).
- Produces: `cw_reflect_v1` `{v:1, on:true, entries:{<promptId>:text}, savedAt:ISOdate}`.

- [ ] **Step 1: Add an explicit save toggle.** A checkbox/switch near the top: "Save privately on this device" with one line of copy: nothing ever leaves this device; plus an "Erase all saved reflections" button (with a confirm) that deletes the key and unchecks the toggle. Toggle ON: load any existing entries into state and write-through on every edit (debounced). Toggle OFF (default): current in-memory behavior, and the key is not written.
- [ ] **Step 2: Update the textarea placeholder** when saving is on: `Write freely — saved only on this device.` (keep the current placeholder when off).
- [ ] **Step 3: Week-6 confrontation.** On the week-6 integration prompt, when a saved week-1 entry exists, render it read-only above the week-6 textarea under the heading "Here is what you wrote in week 1 — what changed?". Identify the week-1 and week-6 prompts by their existing ids (read the prompt data to find them; wire by id, not array index).
- [ ] **Step 4: Verify.** MS3 build + gate passes (`cw_reflect_v1` satisfies prefix rule). Toggle off → localStorage untouched; toggle on → entries survive reload; erase works.
- [ ] **Step 5: Commit.** `feat(reflection): opt-in on-device drafts with week-1 vs week-6 self-confrontation`

---

### Task 10: Decisional Capacity — stamp the copied note as a supervised trainee draft

**Files:**
- Modify: `04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html`

**Interfaces:**
- Consumes: `note()` (the clipboard text builder) and `copyNote()` (~line 140).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append a fixed final line inside `note()`'s returned text** (so every copy path carries it):
```
—
Drafted with a teaching tool — findings verified and note reviewed with the supervising clinician.
```
- [ ] **Step 2: Verify.** MS3 build + gate passes; the on-screen note preview (if the same `note()` feeds it) showing the stamp is acceptable and desirable.
- [ ] **Step 3: Commit.** `feat(capacity): stamp copied notes as supervised trainee drafts`

---

### Task 11: SRS spine — overdue-first ordering + deterministic ±15% interval fuzz

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js`
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html` (consumer call site + due ordering)
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (consumer call site)
- Modify: `06_Family_and_Relational/family-systems-practice.html` (consumer call site)
- Test: `tests/sm2-behavior.test.mjs` (extend — do not weaken existing pins)

**Interfaces:**
- Consumes: `applyGrade(card, grade)` as build-injected via the SM2_APPLY_GRADE marker; `start(ahead)` in review.html (~line 160) building `due`/`neu`/`fut` and `shuffle(due)`.
- Produces: `applyGrade(card, grade, opts)` where `opts = {fuzzKey?:string}` — **backward compatible: omitted opts ⇒ byte-identical behavior to today.**

- [ ] **Step 1 (TDD): extend `tests/sm2-behavior.test.mjs` first.** Add cases: (a) `applyGrade(card,'Good')` with no third arg produces intervals identical to current pinned expectations (existing tests already cover — do not touch them); (b) with `{fuzzKey:'QB#x'}` and resulting `ivl < 3`, output identical to no-fuzz; (c) with fuzzKey and `ivl >= 3`, interval is within ±15% of the unfuzzed value, never `< 1`, never `> 365`; (d) same card state + same fuzzKey ⇒ same output (determinism); different fuzzKey ⇒ (typically) different offset. Run: `node --test tests/sm2-behavior.test.mjs` — new cases FAIL.
- [ ] **Step 2: Implement fuzz in `sm2_apply_grade.js`.** After the existing interval computation and 365 cap, add:
```js
/* Deterministic ±15% interval fuzz (opts.fuzzKey): de-synchronizes cohort-seeded
   cards so due-load avalanches spread out. No fuzzKey (legacy callers) = no fuzz. */
function sm2Fuzz(ivl, key, reps){
  if(ivl < 3 || !key) return ivl;
  var h = 2166136261, s = key + ':' + reps;
  for(var i=0;i<s.length;i++){ h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0; }
  var f = ((h % 2001) / 1000) - 1;               /* [-1, 1] */
  return Math.min(365, Math.max(1, Math.round(ivl + ivl * 0.15 * f)));
}
```
  Call it for the Hard/Good/Easy branches (and first-encounter Easy `ivl=4`) as `c.ivl = sm2Fuzz(c.ivl, opts && opts.fuzzKey, c.reps); c.due = Date.now() + c.ivl*DAY;` — restructure minimally so `due` always derives from the final (possibly fuzzed) `ivl`. `Again` branches are never fuzzed. Signature becomes `function applyGrade(card, grade, opts)`.
- [ ] **Step 3: Run the extended test.** `node --test tests/sm2-behavior.test.mjs` — all pass, including untouched pins.
- [ ] **Step 4: Pass fuzzKey at the three consumer call sites** (in each source file, find the `applyGrade(` call and pass the card id): review.html `grade()` → the card id it already has; question-bank-practice `srsUpdate()` → the `QB#`-prefixed card id; family-systems `srsGradeFamily()` → the FAM# card id. The injected marker means the grader body updates everywhere at build automatically; only the call sites change by hand.
- [ ] **Step 5: Overdue-first ordering in review.html `start()`.** Replace `shuffle(due)` with: sort `due` descending by overdue ratio `(now - st.due) / ((st.ivl || 1) * DAY)`, then shuffle only within consecutive bands of 5 to keep light variety:
```js
due.sort(function(a,b){ return ratio(b) - ratio(a); });
for(var i=0;i<due.length;i+=5){ var band=due.slice(i,i+5); shuffle(band); for(var j=0;j<band.length;j++) due[i+j]=band[j]; }
```
- [ ] **Step 6: Verify.** `node --test tests/*.test.mjs` all green (family-srs-parity included); both site builds + gate pass.
- [ ] **Step 7: Commit.** `feat(srs): deterministic interval fuzz and overdue-first daily review ordering`

---

### Task 12: Route rp_flags through the existing Netlify feedback endpoint

**Files:**
- Modify: `_prototypes/agitation-trainer/rp-agitation.html` (FlagButton ~line 124, `LS.flags='rp_flags'`)
- Modify: `_prototypes/brief-psych/rp-brief-psych.html` (FlagButton ~line 102)

**Interfaces:**
- Consumes: the shipped Netlify form `library-feedback` (see `13_Faculty_Resources/Feedback/feedback.html` ~line 63: fields `form-name`, `site`, `page`, `type`, plus the free-text field — read feedback.html first to get the exact free-text field name). Netlify only stores fields that exist on the registered form — use those names exactly.
- Produces: rp_flags entries gain `sent:true` after successful transmission.

- [ ] **Step 1: Read feedback.html's full form** to capture the exact field names (especially the free-text field) and the AJAX submit pattern (POST to `'/'`, `application/x-www-form-urlencoded`, `form-name=library-feedback`).
- [ ] **Step 2: Add a shared transport function to each rp tool** (duplicated per single-file convention): `flagSend(entry)` POSTs urlencoded fields — `form-name=library-feedback`, `site=location.hostname`, `page='<tool-id> ['+entry.ctx+'] v'+entry.v`, `type='content-flag'`, `<free-text field>=entry.reason`. On HTTP 200 mark the entry `sent:true` in `rp_flags`; on failure leave it unsent (offline behavior unchanged).
- [ ] **Step 3: Send on save + flush on load.** FlagButton's save path calls `flagSend` fire-and-forget after persisting locally. On tool load, flush: read `rp_flags`, send every entry lacking `sent:true` (sequentially, stop on first failure). Never block the UI; never throw.
- [ ] **Step 4: Verify.** `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` passes (rp tools ship on res). Flag save with network blocked leaves an unsent entry that flushes on next load (verify by stubbing fetch in a quick manual check, or by code inspection + a comment documenting the contract).
- [ ] **Step 5: Commit.** `feat(rp-tools): transmit content flags through the library-feedback Netlify form with offline queue`

---

### Task 13: QA gate — shell-reference integrity scan + soft-finding ratchet

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs`
- Create: `13_Faculty_Resources/_automation/site_build/qa-baseline.json`

**Interfaces:**
- Consumes: the gate's `H()`/`S()`/`I()` pushers and its walk of the build dir; built `index.html` literal maps (`LAB`, `PAGE_TOOLS`, `PRACTICE_PAGE_TOOLS`, `PRACTICE_LABELS`, `DASH_CONFIG`, `CASE_TITLES`, `FAMILY_SCENARIO_TITLES`, `ICON`); shipped `communication_cases.json` and `family_systems_scenarios.json`; shipped `content/*.md`.
- Produces: two new gate sections; a committed baseline file.

- [ ] **Step 1: Shell-reference integrity scan (new section "7b", HARD).** Against the build directory being checked: (a) extract tool filenames from the built `index.html`'s `LAB`, `ICON`, `PRACTICE_LABELS`, `PAGE_TOOLS`, `PRACTICE_PAGE_TOOLS`, and `DASH_CONFIG` literals (regex for `'<name>.html'` occurrences within each `var X={...};` block is acceptable — document the fragility in a comment) and hard-fail any that don't exist in the build's `tools/` dir; (b) hard-fail any id in `CASE_TITLES` missing from `communication_cases.json`'s case ids, and any id in `FAMILY_SCENARIO_TITLES` missing from `family_systems_scenarios.json`'s scenario ids; (c) scan shipped `content/*.md` for `?page=`/`?tool=` references and hard-fail any target that is not a shipped content slug / tool file. If the scan finds pre-existing violations, FIX the underlying data in this task (they are real dead ends) — only if a fix is genuinely out of scope, register that one reference in a documented allowlist constant with a comment explaining why.
- [ ] **Step 2: Soft-finding ratchet.** Add `classify(msg)` mapping soft messages to stable classes by regex (e.g. `metadata`, `review-coverage`, `near-dup`, `blueprint-gap`, `dose-soft`, `other` — derive the classes from the actual `S()` call sites). Load `qa-baseline.json` (`{"<class>": maxCount}`); after checks run, any class whose count exceeds its baseline becomes a HARD failure naming the class, the count, and the baseline. When counts drop below baseline, print an `I()` note inviting a baseline lowering. `UPDATE_BASELINE=1 node check-static-site.mjs <dir>` rewrites the file from current counts (for deliberate adoption).
- [ ] **Step 3: Generate the baseline.** Run both builds; run the gate with `UPDATE_BASELINE=1` on the ms3 build (single shared baseline; if per-site counts differ materially, key the file per site: `{"ms3":{...},"res":{...}}` — choose based on what you observe and document the choice in a comment).
- [ ] **Step 4: Verify.** Both `build_and_check.sh` runs pass end-to-end with the new sections active (this proves Tasks 1-12 introduced no dead references). Temporarily inject a fake dead tool key locally to confirm the scan fails, then revert the injection.
- [ ] **Step 5: Commit.** `feat(qa-gate): shell-reference integrity scan and soft-finding ratchet baseline`

---

## Final verification (after Task 13)

- [ ] `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py && python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py && python3 13_Faculty_Resources/_automation/validate_topic_meta.py && python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py`
- [ ] `node --test tests/*.test.mjs`
- [ ] `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`
- [ ] Note for the PR: UI changes to tools will likely require the "Refresh visual baselines" workflow_dispatch after the PR opens (visual baselines are CI-generated on Ubuntu/Chromium — never regenerate locally).
