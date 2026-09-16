# HANDOFF — "One Thing First": the Today priority rule

**For:** a Claude Code session on Josh's Mac, in `/Users/jm/Psychiatry-Clerkship-Library`
**From:** Cowork investigation session 2026-09-16 (read-only; nothing was edited in the repo)
**Authority:** Joshua Moss, MD approved the proposal and the preview on 2026-09-16 ("perfect"). One decision is still an assumption — see §2.
**Companion documents:** `claude/today-journey-proposal-2026-09-16.md` (the full audit, in the Claude Project) and the published preview artifact "One Thing First" (Before/After mock, five situations × two audiences). Read the proposal §3, §5, §6 before touching code; this handoff is the execution brief, not a replacement for it.

> Filed into the repo verbatim by the executing session on 2026-09-16 so the plan that argues from
> it (`2026-09-16-today-priority-rule-phase1.md`) travels with its spec. The proposal itself lives in
> the Claude Project and is not in this repository.

---

## 0. Model recommendation

| Phase | Recommended model | Why |
|---|---|---|
| **1** picker + reorder + copy fixes | **Claude Fable 5.1** (fall back to **Opus** if Fable is not offered in your Claude Code) | Cross-module work under nine pinned contracts (ES5-only, pure-render purity tests, the `block-wiring` regex, the audience-copy scan, `fdTodayLive`'s string splice). The failure mode here is a change that passes every test and quietly breaks the meaning of one of them — the class `docs/SILENT_SHRINK_CHECKLIST.md` exists for. Highest-reasoning model, **plan mode first**, tests before code. |
| **2** interrupted practice (F3) | **Sonnet** is sufficient; Opus if you want one model for the whole job | Fully specified, three files, additive capsule field, mechanical. |
| **3** guest deep link (F4) | **Fable 5.1 / Opus** | Changes the first-run contract in `fdResolveState`; needs judgment about what the wizard, header and settings panel do with no role. **Merge blocked on Josh's explicit approval** (§6). |
| Close — visual baselines | any | It is a `workflow_dispatch`, not code. |

Run every phase **on the Mac, not in a sandbox**: `bin/verify.sh` is the pre-push hook, the smoke suite needs `npm ci` in `tests/smoke`, and Git LFS is installed there (a sandbox shows 20 `.m4a` files as "modified" — never commit those; AGENTS.md).

---

## 1. Ground truth to re-establish before the first edit

```bash
git fetch origin --prune
git log -1 --format='%h %ad %s' --date=short origin/main     # audited at 3cdec90 (2026-09-15); newer is fine, re-check §1b if so
git status --short | grep -v '\.m4a$'                       # must be empty apart from the LFS phantom
git switch -c claude/today-priority-rule-p1 origin/main     # branch from ORIGIN main; local main is 9+ behind
```

**1b. If `origin/main` has moved past `3cdec90`**, re-read these before proceeding — they are the lines the plan depends on: `frontdoor/fd_today.js` (whole file, 343 lines), `fd_block.js` (211), `fd_due.js` (73), `fd_wire.js:97–149` (`fdResolveState`) and `:320–361` (toggle branch), `spa_index.html` `fdTodayLive` (~2069–2082), `fdBlockContinue` (~1967–1974), boot role assignment (~2602–2605), `question-bank-practice.html` `checkpointSession` (~846) / `tryResumeSession` (~876) / `init` (~1127). Also `tests/block-wiring.test.mjs:50` and `tests/fd-today.test.mjs:386–394`.

**1c. Duplicate-work check** (the Cowork session could not run `gh`): `gh pr list --state open --search "today OR block OR frontdoor"` and confirm nothing open touches `frontdoor/`. As of 2026-09-16 the four remote branches that diff these files are 800+ commits behind and pre-date the timed block; ignore them.

**1d. Repo rules that bite here** (from AGENTS.md — read the whole file once):
- `frontdoor/*.js` is **ES5 only** (var/function; no const/let/arrows/template literals).
- Every string in `fd_*.js` ships to both sites: **no** MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford tokens (`tests/shell-copy.test.mjs`; `fd_wire.js` is banned file-wide, comments included).
- `fd_today.js` must touch no DOM/storage/clock and must emit no `fd-due|fd-capture` markup (`tests/fd-today.test.mjs:386–394`).
- localStorage keys are `cw_*`/`rp_*` only; **add no new key** in this work.
- `tests/block-wiring.test.mjs:50` pins `fdBlockCard(` inside `fdTodayLive` under the literal `if(!facultyPreviewRequest){ var liveForBlock` — keep that statement shape.
- CSS: tokens only (`--fd-*`); `check_design_drift.py` gates hex literals.
- If you edit `CLAUDE.md`, `cp CLAUDE.md AGENTS.md` (CI fails on divergence). You probably won't need to.
- `bin/verify.sh` (~90 s+) is the pre-push hook; a red gate on the Mac while CI is green is usually **bash 3.2** — write `${ARR[@]+"${ARR[@]}"}`. `--no-verify` is never the answer.
- Visual baselines regenerate **only** via the "Refresh visual baselines" `workflow_dispatch` (Ubuntu), never locally.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>` and the session line per the harness's system reminder; PR body ends with the standard "Generated with Claude Code" footer.

---

## 2. The rule (approved) and the one assumption

Primary action on Today = first true row, top-down:

| # | Condition (inputs the shell already has) | Primary |
|---|---|---|
| 1 | `sessLoad('qbank')` capsule with ≥1 left **or** `blockLoad()` live with a next step **or** `cw_last` names a **read** in the current week that is undone and ≠ Continue's target | Pick up where you left off (resume › block next step › "You were reading") |
| 2 | `fdDueCount(dueBreakdown())>0` | Clear what's due |
| 3 | current week has an undone item | Continue the week (existing card) |
| 4 | week complete | Look ahead (Preview Week N+1 / Review final) + "Practice a fresh set →" |
| 5 | no week | Set your rotation week (existing setup CTA) |

Everything that did not win stays, under **"Also today"**, in fixed order: block card, due row, resume card, "You were reading" row (if not primary), capture triage — then the week list, daily pick, progress card, quick-tool pills, exactly as now.

**ASSUMPTION A1 — "unfinished" outranks "reviews due".** Josh approved the preview built on this; he has not answered the direct question. Implement as written; make the order a single array in `fdTodayPrimary` so a reversal is a one-line change with no test rewrite beyond the picker table. Say so in the PR body.

Learner-facing explanation (verbatim, under the primary): **"First things first: anything you left unfinished, then reviews due, then this week. The rest is just below."**

Invariants that must survive every phase: opening a resource writes nothing to `cw_progress_v1`; the only completion writers remain `data-fd-toggle` and the session receipt. Browser Back returns to Today with the same primary and exactly one history entry per navigation. No storage key added; `cw_sess_v1` gains one optional field (Phase 2). Clinical content, `reviewed.json`, attestation: untouched.

---

## 3. Phase 1 — picker, reorder, copy (one PR)

**Write the tests first.** They should be red on `origin/main` for the right reasons before any source edit.

### 3a. Tests to add
`tests/fd-today.test.mjs`
- `fdTodayPrimary` table: for each of the 5 rules × both `path.id`s (`ms3-six-week`, `resident-four-week`), given plain inputs `{capsuleLeft, blockNext, blockDone, blockTotal, dueTotal, weekProgress:{done,total,next}, hasWeek, lastRead:{ref,kind,done,isContinueTarget}}` → expected `{kind:'resume'|'block'|'read'|'due'|'week'|'ahead'|'setup'}`. Include the tie cases: capsule + block ⇒ `resume`; `cw_last` done ⇒ falls through; `cw_last` a tool ref ⇒ falls through; `cw_last` equals Continue's target ⇒ falls through to `week`.
- `fdContinue(..., primary=false)` carries `is-secondary`; `primary` undefined keeps today's markup byte-identical (protects every existing test).
- `fdContinue` shows a `reference` chip when `progress.next.rights===true`, `tool` chip when kind is tool.
- Week-complete + primary ⇒ output contains `Practice a fresh set` with `data-fd-open="question-bank-practice.html"`.
- Copy scan: every new string passes the existing audience-token regex.

`tests/fd-block.test.mjs`
- Empty plan renders a `data-fd-open="question-bank-practice.html"` control and **no longer** contains "Open the question bank for a fresh set."
- `fdBlockHandoffLabel` returns strings beginning `Mark done · ` for all three branches.
- `fdBlockCard(...,{primary:false})` Start button has `fd-btn--accent`, not `fd-btn--primary`; live kicker reads `Your block · N of M done`.

`tests/fd-due.test.mjs`
- `fdDueRow(b,true)` / `fdResumeCard(c,true)` carry `is-primary` and the §5.1 kicker copy; with `false` the markup equals today's.
- New `fdLastReadRow(item,primary)` renders "You were reading: <title> — N min", escapes the title, never renders for a tool item.

`tests/block-wiring.test.mjs`
- Keep `:50` green (do not rewrite the regex — satisfy it).
- Add: `fdTodayLive` calls `fdTodayPrimary(` exactly once and emits `Also today` exactly once.

### 3b. Source changes (minimal, additive)
- **`frontdoor/fd_today.js`**: add pure `fdTodayPrimary(inputs)`; add `fdTodayWhy()` (returns `<p class="fd-primary__why">…</p>`); extend `fdContinue(index,state,wk,progress,primary)` — `primary===false` ⇒ class `fd-continue is-secondary`; when complete **and** primary, append the ghost "Practice a fresh set →" button; add the kind chip (`fd-chip`/`fd-chip is-tool`, label `reference|tool|read`, same rule as `fdRow`) inside `.fd-continue__title`. `fdToday` reads `state.primaryKind` and passes `primary = (primaryKind===undefined||primaryKind==='week'||primaryKind==='ahead'||primaryKind==='setup')`. Nothing else in the file changes.
- **`frontdoor/fd_due.js`**: `fdDueRow(breakdown, primary)`, `fdResumeCard(capsule, primary)`, new `fdLastReadRow(item, primary)`; `is-primary` modifier + §5.1 copy when primary.
- **`frontdoor/fd_block.js`**: line ~197 empty state → sentence + `<button type="button" class="fd-btn fd-btn--accent" data-fd-open="question-bank-practice.html">Practice a fresh set</button>`; line ~206 hint → "Runs as one session. Each step is marked done as you finish it — the page when you mark it, the questions by the receipt at the end."; `fdBlockHandoffLabel` prefix `'Mark done · '`; `fdBlockCard(plan,minutes,block,doneMap,opts)` honours `opts.primary===false` (accent Start; live kicker "Your block · N of M done").
- **`spa_index.html` `fdTodayLive`**: compute inputs (`sessLoad('qbank')`, `blockLoad`+`fdBlockStatus`, `dueBreakdown()`, `fdTodayProgress`, `LS('cw_last')` resolved through `FD_INDEX.byRef` and the current week's items), call `fdTodayPrimary` once, set `live.primaryKind`, then compose: `[primary slot html] + fdTodayWhy() + '<h2 class="fd-sectionhead fd-also">Also today</h2>' + [secondaries in fixed order]`. The primary slot for kinds `week|ahead|setup` is rendered by `fdToday` itself (leave those cards where they are; just don't duplicate them). Keep the `if(!facultyPreviewRequest){ var liveForBlock` statement verbatim.
- **`frontdoor.css`**: `.fd-primary` (top 3px `--fd-terracotta` bar, `--fd-shadow-card`), `.fd-primary__why`, `.fd-continue.is-secondary` (no gradient/top accent), `.fd-also`. Tokens only.

### 3c. Gates before opening the PR
```bash
node --test tests/*.test.mjs
bash bin/verify.sh                       # background it; read the output, not just the exit code
python3 13_Faculty_Resources/_automation/site_build/check_design_drift.py   # or however verify.sh names it — must be green
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npm ci && npx playwright test front-door.spec.js
```
Then add the **A-series and D/E acceptance checks** below to `tests/smoke/front-door.spec.js` (seeded localStorage; run per audience with the existing project-suffix helper) and make them pass. Expect the two Today visual baselines to fail — that is the Close step, not a blocker for review; say so in the PR.

### 3d. PR body must state
what the rule is (one paragraph), assumption A1, that `fd_today.js` stays pure, that no storage key was added, the list of tests added, and "visual baselines to be refreshed via workflow_dispatch after approval".

---

## 4. Phase 2 — interrupted practice, F3 (one PR, after Phase 1 merges)

- `question-bank-practice.html` `checkpointSession`: add `fromBlock: !!SESSION.fromBlock`, `n: SESSION.queue.length`, `cat: SESSION.catFilter||null` to the capsule (additive; readers guard shape).
- `tryResumeSession`: set `SESSION.fromBlock = cap.fromBlock===true` (+ `catLabel` if present).
- `spa_index.html` `fdBlockContinue`: when `status.next.kind==='qb'` and `sessLoad('qbank')` has `fromBlock===true` and ≥1 left → route `?tool=question-bank-practice.html&resume=1&block=1&n=<step.n>[&cat=<step.cat>]` instead of `fdBlockRouteForStep`.
- `fd_due.js` `fdResumeCard`: when `capsule.fromBlock`, href carries the same block params and shows the sub-line `Block · <done> of <total> done`; `fd_block.js` live card Continue label becomes `Resume: <left> of <n> questions left →` when the shell passes `opts.resume`.
- Tests: `sess-capsule` round-trips the new fields; `session-receipt` — a `?resume=1&block=1&n=6` session with `blockKind:'qb'` marks the qb step (`cwReceiptMatchesBlock` already reads `block`/`n`/`cat` from the URL, so resume-before-block in `init` is enough); `block-wiring` — resume route preferred when capsule is from a block.
- Smoke B1–B4 below.

## 5. Phase 3 — guest deep link, F4 (one PR; **merge gated on Josh**)

- `fd_wire.js` `fdResolveState`: when a routed non-alias `page`/`tool` ref is present and there is no stored role → `out.screen='app'`, `out.guest=true`, **no role assigned**. Everything else unchanged; `fdResolveState('/', {})` must still return `setup-role`.
- `spa_index.html` boot (~2602–2605): delete the `fdStored.role=(FD_ROLES[0]&&FD_ROLES[0].id)||'reader'` line; keep `browsing=true`.
- Greeting with no role already renders "Evening, there —" (pinned by `fd-today.test.mjs:117`) — leave it.
- Check the header (`fdHeader`) and the settings panel render sanely with no role (no selected chip is the truth).
- Tests: `fd-wire` — `/?page=x.md` + `{}` ⇒ `screen:'app', guest:true`, `role` absent; `fd-shell-boot` unchanged; smoke C1–C4.
- **Do not merge until Josh has written approval of the contract change** ("a guest can read one linked page without choosing a role; the next plain visit runs the wizard from step 1").

## 6. Close — after 1–3 merge
Trigger the "Refresh visual baselines" `workflow_dispatch`; open the baseline PR; Josh approves the two Today screenshots.

---

## 7. Acceptance checks (write as Playwright; all seeded via `page.addInitScript` → localStorage)

**A · one primary** — A1 seed `cw_sess_v1` (qbank, 4 left) + `cw_block_v1` (live, next=qb) + `cw_srs_v1` (2 due) + `cw_capture_v1` (1) ⇒ exactly one `.fd-primary`, containing the Resume control. A2 remove capsule ⇒ block; remove block ⇒ due; clear dues ⇒ `.fd-continue:not(.is-secondary)`; mark week complete ⇒ title starts "Preview Week" and a "Practice a fresh set" control exists; clear `cw_rotation_start` ⇒ `.fd-setupcta`; seed `cw_last` = undone week read (no capsule/block) ⇒ primary text starts "You were reading". A3 every demoted card still present and its click changes `location.search` as before. A4 both audiences: same primary kind for the same seed. A6 after clicking the primary in every A2 state, `cw_progress_v1` byte-identical to before.

**B · interruption/reload** — B1 start a block (page + 6 q), mark page via reader button (label begins "Mark done ·"), answer 2, Back ⇒ one primary = Resume with "Block · 1 of 2 done"; block card secondary. B2 click Resume ⇒ URL has `resume=1&block=1&n=6`; counter shows 3 of 6; finish ⇒ receipt "Block complete · 2 of 2 done"; `cw_block_v1` cleared. B3 `page.reload()` on `/` and on `?page=<step>&block=1` ⇒ `.fd-primary` text and reader primary label unchanged. B4 `createdAt` 13 h old ⇒ planner face, no error, primary falls through.

**C · guest + Back** — C1 fresh context → `/?page=pg_suicide.md` renders; after "Back to Today", `cw_frontdoor_v1` has no `role`. C2 `/` ⇒ "Who's this for?". C3 wizard path unchanged (`first run reaches Today` stays green). C4 click primary, `goBack()` ⇒ same primary, `history.length` +1.

**D · keyboard** — D1 first focusable inside `.fd-today__main` is the primary's control in every A2 state. D2 Enter fires the same route as click; `1/2/3`, `/`, ⌘K, Esc, ←/→ unchanged. D3 focus after Back lands on the primary's control or Today's `h1`, never `<body>`.

**E · mobile 390×844, reduced motion, both audiences** — E1 A1 seed: `.fd-primary` bottom ≤ 844. E2 `scrollWidth <= clientWidth`. E3 every control in `.fd-primary` and "Also today" ≥ 44 px tall.

---

## 8. Kickoff prompt (paste into Claude Code, plan mode)

> Read `docs/superpowers/plans/2026-09-16-today-priority-rule-handoff.md` (this file) end to end, then AGENTS.md, then the proposal referenced in it. Run §1 exactly. Enter plan mode and produce a plan for **Phase 1 only** that lists every test you will add (red first) and every source line you will change, then stop for my approval. Constraints you must not violate: ES5 in `frontdoor/`, audience-neutral copy, `fd_today.js` purity, the `block-wiring` regex at line 50, no new localStorage key, tokens-only CSS, branch from `origin/main`, never `--no-verify`. Treat assumption A1 as given and say so in the PR body. Do not start Phase 2 or 3 in the same branch.

---

## 9. Known unknowns (say them in the PR, don't hide them)
- Tab-stop counts and above-the-fold claims in the proposal were DOM-order inferences; the D/E checks are where they get measured for the first time.
- `gh` was absent in the investigating session; §1c is the first real open-PR check.
- The proposal's line numbers are from `3cdec90`; if `main` moved, re-anchor per §1b before quoting them in commit messages.
