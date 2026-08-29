# SP Interview — Codex Review Remediation (PR #406) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two code findings from the Codex review of PR #406 (false suicide-screen credit from causal "hurting yourself **by** X" questions and habitability "not worth living **in**" questions) with pattern narrowings + pinned regression tests, landing on `feat/wp-b-sim-safety` so Josh's one red-team run covers everything.

**Architecture:** Three `replace_all` regex narrowings (negative lookaheads) plus one "thought-framed" recovery pattern appended per case in `sp-interview.pack.json`; new node:test cells in the existing WP-B phrasing suite pin both directions (non-screens never credit, method-clause screens still credit); D8/D9 entries in the faculty decision record. No engine code changes, no new intents, no vocabulary additions.

**Tech Stack:** JSON pack + JS `RegExp` (compiled identically by the offline sim at `sp-interview.html:230` and the live proxy at `sp-proxy/netlify/functions/sp.mjs` `compileIntents`), node:test, `generate-preview.mjs`.

**Spec:** Part 1 (Adjudication) below — this plan argues from it. Companion context: `docs/superpowers/plans/2026-08-24-faculty-decisions.md` (D1–D7), issue #410, PR #406 review thread (chatgpt-codex-connector, 2026-08-27, reviewed commit `66d9cc27a1`).

---

## Part 1 — Adjudication of the Codex review (the spec)

Three inline P1 comments. All three were verified against the branch (`origin/feat/wp-b-sim-safety`); comments 2 and 3 were **reproduced mechanically** by compiling the pack exactly as the engine does (`new RegExp(p,'i').test(text)`).

| # | Codex claim | Verdict | Disposition |
|---|---|---|---|
| 1 | `REDTEAM_CHECKLIST.md` must run before shipping; pack regexes are compiled by the live proxy and alter suicide-gate behavior (B1–B4) | **Correct, but zero new information** — it restates the PR body's own "Blocking before this reaches learners" section verbatim-in-substance. The proxy claim is accurate (`sp.mjs` `deriveState`/`compileIntents` re-runs the same regexes server-side). | No code action. Josh-owned (needs Live mode + passcode). This plan's fixes land **before** his single run so one checklist covers #406 + remediation. |
| 2 | Ray: "Is that apartment not worth living in?" matches the new bare `not worth living` branch → `si_direct` recorded, debrief credits a suicide screen | **Confirmed, reproduced.** Ray's entire case is apartment-centered (delusion about the apartment above, vents, weeks of not leaving it — 5 mentions; Dana/Marcus have 0), so habitability questions are plausible learner moves. Impact on Ray: `c_si` is **non-critical** and no Ray gate keys on `si_direct`, so it's a checklist over-credit **plus** a jarring sim behavior (Ray answers a housing question with his passive death-wish line). The identical pattern also sits in Dana and Marcus, where `c_si` IS critical and gates key on `si_direct` (`si_active` @rapport 1, `g_si_mixed` @rapport 0) — implausible utterance there today, but the exposure exists. | **Fix (Task 3, Edit A):** trailing negative lookahead `(?!\s+(in\|there\|at)\b)`, applied to all 3 occurrences. Verified against every D3-approved phrasing: zero false-miss cost (no genuine screen ends "worth living in/there/at"). |
| 3 | Marcus: "Do you think you're hurting yourself by sleeping only two hours?" matches `hurt(ing)? yourself` → `si_direct`; `g_si_mixed` requires exactly that intent at rapport 0, so it unlocks the SI disclosure **and** certifies the critical checklist item with no screen asked | **Confirmed, reproduced — the highest-impact finding.** `g_si_mixed`: `requiresIntents:["si_direct"]`, `requiresRapport:0` (Marcus's lowest gate bar). `c_si` on Marcus: `critical:true`, `intents:["si_direct"]`, no `partialIfOnly`. Insight/consequence probing is a standard mania-interview move, so the utterance is realistic, not contrived. Crucially this is **not** a retread of the ratified D5 trade: D5 knowingly accepted *euphemistic screen → full credit* as better than a hard miss; it never contemplated *non-screen consequence question → full credit + disclosure*. New failure mode inside D5's blast radius. | **Fix (Task 3, Edits B/C/D/E/F):** `(?!\s+by\b)` lookahead on `hurt/harm(ing)? yourself` (all 3 occurrences each), plus a thought-framed recovery pattern so "Have you thought about hurting yourself **by taking pills**?" — a genuine screen-with-method — still credits. |

**What the review got right that matters:** both counterexamples are instances the project's own ratified heuristic (decision doc, D6/D7: *in a screening simulator, a false pass teaches an incompetent student their non-screen counted; when a safety pattern is ambiguous, decline it*) says must not credit — so the fix direction is already decided policy, not a new faculty call. The narrowings only need ratification-by-merge (D8/D9, Task 5), same flow D6 used.

**What the review missed (why it doesn't stand unmodified):**
1. **No awareness of the tracked landscape.** Issue #410 (items C/D) already documents the euphemism-over-credit class with a structural fix designed (`si_euphemism` + `partialIfOnly` for Marcus/Ray). Codex's examples are sharper — they credit *non-screens*, not weak screens — which is exactly why they warrant a narrow fix now rather than waiting for #410-C. But a reader of the review alone would re-derive known territory.
2. **No false-miss analysis of its own suggestions.** A blanket `by`-exclusion silently fails "Have you thought about hurting yourself by overdosing?" — a genuine screen-with-method — on a case where `c_si` is critical: the exact P0 class #406 exists to fix. The recovery pattern in this plan closes that; Codex's "require thoughts/intent framing" alternative would likewise have failed "Are you hurting yourself?" (a legitimate present-behavior screen). Suggestions taken verbatim would have traded one P0 for another.
3. **Only probed the false-pass direction.** Verification here surfaced (incidentally) that the new worth-living family has **no past tense**: "Did you feel like life **wasn't** worth living?" — a classic screen phrasing — matches nothing in any case. That is a genuine-screen false miss (#410 item-A class). Vocabulary *additions* were explicitly not authorized in #406 ("the contraction gap stands"), so this plan does **not** add it — it is queued for Josh in Appendix A.3.
4. **Comment 1 is severity-flat with 2 and 3.** All three are P1, but 3 ≫ 2 in real impact (critical certification + rapport-0 gate on a plausible utterance vs. a non-critical credit on a stilted one), and 1 is a restated known blocker.

**Fix-design verification already performed (2026-08-29, this session):** the exact replacement patterns below were run against a 42-cell matrix (4 non-screens + 4 screens + 6 D3-approved phrasings × 3 cases) on a simulated post-fix pack: **all 42 cells hold.** One trap was found and designed around: Dana's `si_plan` pattern `how (you )?(would|might)` brushes the "Do you see how you might…" probe — that intent is gated behind `si_active` (cannot manufacture a screen; tracked as #410-E), so the new tests assert on the *crediting* intents (`si_direct`/`si_euphemism`) only. Do not "fix" `si_plan` in this plan.

**Branch decision:** fixes land on `feat/wp-b-sim-safety` (updates PR #406 in place). Rationale: the PR is already blocked on Josh's red-team run, so added commits cost no schedule; one red-team run then covers the final pack; the Codex threads get resolved by commits on the PR they annotate. (If Josh prefers a stacked PR, execute the same tasks on a branch off `feat/wp-b-sim-safety` — nothing else changes.)

---

## Global Constraints

Every task implicitly includes these. They are repo landmines, not style preferences.

- **Work on `feat/wp-b-sim-safety`.** Before pushing, re-verify the PR is still open: `gh pr view 406 --repo jmoss333/psychiatry-clerkship --json state` — PRs here have merged mid-session before; pushes to a merged PR's branch trigger no PR checks.
- **Never run `node --test _prototypes/sp-interview/tests`** (Node 22 resolves the directory as a module → `MODULE_NOT_FOUND`, which reads as a broken pin). Use `bash _prototypes/sp-interview/tests/run-all.sh` or name a file directly.
- **Every pack edit requires regenerating the preview:** `node _prototypes/sp-interview/generate-preview.mjs --write` (it inlines the whole pack as one `window.__SP_PACK__` line). `--check` must print `PASS` afterward.
- **sp-proxy deps:** `npm --prefix sp-proxy ci --include=dev` (guards the NODE_ENV=production devDependency-omission trap).
- **Do not touch:** `do(ing)? something (to yourself|drastic|stupid)` / `do(ing)? something to yourself` stems; `si_plan` breadth (#410-E, deferred); Dana's `si_direct` (a guard test asserts it never matches euphemisms); pack `version`/`built` fields (#406 precedent: pattern edits don't bump them); `sp-interview.html`; `sp.mjs`.
- **No vocabulary additions.** Lookaheads narrow; the recovery pattern only re-admits phrasings the pre-fix stems already matched. Adding new phrasings (past tense, new euphemisms) requires faculty authorization — Appendix A.3, not this plan.
- **No CLAUDE.md edits** in this plan → the `cp CLAUDE.md AGENTS.md` parity step does not apply.
- **Do not merge PR #406, do not claim the red-team ran, do not post GitHub comments/replies** — all Josh-gated (Appendix A).
- The pre-push hook runs `bin/verify.sh` (full battery, minutes). Never bypass with `--no-verify`.
- JSON pattern strings escape backslashes: `\s` is written `\\s`, `\b` is `\\b` in the file. Copy the edit strings below exactly.

---

### Task 1: Branch setup and green baseline

**Files:** none modified.

**Interfaces:**
- Produces: a checkout of `feat/wp-b-sim-safety` with installed sp-proxy deps and a verified-green baseline, in a worktree at `.claude/worktrees/` (or the current worktree switched to the branch if it carries no unique work).

- [ ] **Step 1: Fetch and check out the PR branch**

```bash
git fetch origin feat/wp-b-sim-safety
git switch feat/wp-b-sim-safety 2>/dev/null || git switch -c feat/wp-b-sim-safety origin/feat/wp-b-sim-safety
git log --oneline -2
```

Expected: HEAD at or after `29c6798` (Merge branch 'main' into feat/wp-b-sim-safety). If `origin/feat/wp-b-sim-safety` has moved past that, take the newer tip — do not reset backward.

- [ ] **Step 2: Confirm PR #406 is still open**

```bash
gh pr view 406 --repo jmoss333/psychiatry-clerkship --json state,headRefName --jq '"\(.state) \(.headRefName)"'
```

Expected: `OPEN feat/wp-b-sim-safety`. If MERGED or CLOSED: **stop** and report — the plan's branch decision needs re-making (the same edits would then target a new branch off `main`).

- [ ] **Step 3: Install sp-proxy deps and run the existing phrasing suite**

```bash
npm --prefix sp-proxy ci --include=dev
npm --prefix sp-proxy test
```

Expected: all sp-proxy tests pass (the WP-B suite `sp-safety-screen-phrasing.test.mjs` included). If red at baseline: **stop** and report; do not build on a red baseline.

---

### Task 2: Pin the counterexamples as tests (red first)

**Files:**
- Modify: `sp-proxy/tests/sp-safety-screen-phrasing.test.mjs` (append two tests at end of file; fix one stale comment mid-file)

**Interfaces:**
- Consumes: existing helpers in the same file — `pack` (parsed pack), `matchingSafetyIntentIds(caseDef, text)` (returns matched safety-intent ids for a case), `test`/`assert` imports.
- Produces: two named tests Task 3 must turn/keep green: `consequence and habitability questions never credit a suicide screen (D8/D9)` and `thought-framed screens with a method clause still credit a safety intent (D9)`.

- [ ] **Step 1: Append the two tests at the end of the file**

```js
// ---- Codex review of PR #406 (2026-08-27), inline comments 2 & 3 ----
// Consequence/insight questions ("are you hurting yourself BY <behavior>?") and
// habitability questions ("is that apartment not worth living IN?") are not
// suicide screens, but the widened WP-B stems matched them — which scored c_si
// (critical on Dana and Marcus) and unlocked g_si_mixed at rapport 0 on Marcus.
// Decision provenance: D8 + D9 in docs/superpowers/plans/2026-08-24-faculty-decisions.md.
// Only si_direct / si_euphemism can credit c_si or unlock the si gates, so these
// assertions filter to those two ids: Dana's si_plan ("how (you )?(would|might)")
// legitimately brushes one probe, is gated behind si_active, and is tracked as
// issue #410 item E — not re-litigated here.
const C_SI_CREDITING = new Set(['si_direct', 'si_euphemism']);

const NON_SCREEN_PROBES = [
  'Is that apartment not worth living in?',
  "Do you think you're hurting yourself by sleeping only two hours?",
  'Do you see how you might be hurting yourself by not sleeping?',
  "Aren't you harming yourself by skipping the lithium?",
];

const METHOD_CLAUSE_SCREENS = [
  'Have you thought about hurting yourself by taking pills?',
  'Have you had thoughts of harming yourself by overdosing?',
];

test('consequence and habitability questions never credit a suicide screen (D8/D9)', () => {
  for (const caseDef of pack.cases) {
    for (const phrasing of NON_SCREEN_PROBES) {
      const credited = matchingSafetyIntentIds(caseDef, phrasing)
        .filter((id) => C_SI_CREDITING.has(id));
      assert.deepEqual(
        credited,
        [],
        `${caseDef.id} credited ${JSON.stringify(credited)} for non-screen: "${phrasing}"`,
      );
    }
  }
});

test('thought-framed screens with a method clause still credit a safety intent (D9)', () => {
  for (const caseDef of pack.cases) {
    for (const phrasing of METHOD_CLAUSE_SCREENS) {
      const credited = matchingSafetyIntentIds(caseDef, phrasing)
        .filter((id) => C_SI_CREDITING.has(id));
      assert.ok(
        credited.length > 0,
        `${caseDef.id} failed to credit a genuine screen: "${phrasing}"`,
      );
    }
  }
});
```

- [ ] **Step 2: Fix the stale D3-era comment in the same file**

The `REGRESSION_GUARD` block's comment still says "hurting yourself" was never a Marcus stem and was "flagged in the wpb-report rather than silently fixed" — false since D5 added it. Replace this exact comment text:

```js
// Existing safety phrasings that must STAY matched (regression guard against the
// new patterns accidentally displacing or narrowing coverage). Scoped per case to
// the pre-existing baseline: "hurting yourself" was never a si_direct/si_euphemism
// stem in sp_mania_redirect_001 (that case has no si_euphemism intent at all) —
// that is a pre-existing gap, out of scope for WP-B D3, and is flagged in the
// wpb-report rather than silently "fixed" here.
```

with:

```js
// Existing safety phrasings that must STAY matched (regression guard against the
// new patterns accidentally displacing or narrowing coverage). Historical note:
// at D3 time "hurting yourself" was not a Marcus stem; D5 (2026-08-24) then added
// hurt/harm/do-something-to-yourself to Marcus's and Ray's si_direct, so the
// phrasing now matches in every case. The per-case scoping below predates D5 and
// remains valid as a floor.
```

Leave the `REGRESSION_GUARD` array itself untouched.

- [ ] **Step 3: Run the suite — expect exactly one new failure**

```bash
npm --prefix sp-proxy test
```

Expected: the D8/D9 non-screen test **FAILS** on its first cell — `sp_depression_gated_si_001` credited `["si_direct"]` for "Is that apartment not worth living in?". The method-clause test **PASSES** (pre-fix bare stems already match those phrasings — it is a regression floor, not a red test). All pre-existing tests still pass. If anything else fails, stop and diagnose before Task 3.

- [ ] **Step 4: Commit**

```bash
git add sp-proxy/tests/sp-safety-screen-phrasing.test.mjs
git commit -m "test(sim-safety): pin Codex #406 counterexamples — consequence/habitability questions are not screens"
```

---

### Task 3: Narrow the pack patterns (green)

**Files:**
- Modify: `_prototypes/sp-interview/sp-interview.pack.json` (Dana intents line ~184–185, Marcus intents ~640–648, Ray intents ~1399–1409)

**Interfaces:**
- Consumes: Task 2's two tests as the acceptance harness.
- Produces: the final pattern set Task 4 regenerates the preview from and Task 5 records as D8/D9.

Six edits. A/B/C are `replace_all` (each has exactly 3 identical occurrences — Dana, Marcus, Ray — all of which must change identically; verify counts in Step 2). D/E/F append the recovery pattern via unique anchors. Copy strings byte-exactly, JSON escaping included.

- [ ] **Step 1: Apply the six edits**

**Edit A** — worth-living habitability lookahead (`replace_all`):

```
old: "\\b(isn'?t|is not|no longer|not) worth living"
new: "\\b(isn'?t|is not|no longer|not) worth living(?!\\s+(in|there|at)\\b)"
```

**Edit B** — hurt-yourself causal lookahead (`replace_all`):

```
old: "hurt(ing)? yourself"
new: "hurt(ing)? yourself(?!\\s+by\\b)"
```

**Edit C** — harm-yourself causal lookahead (`replace_all`):

```
old: "harm(ing)? yourself"
new: "harm(ing)? yourself(?!\\s+by\\b)"
```

**Edit D** — Marcus `si_direct`: append the thought-framed recovery pattern. Unique anchor is Marcus's array tail (his `do(ing)? something to yourself` has **no** trailing comma; Ray's does):

```
old:
            "do(ing)? something to yourself"
          ]
new:
            "do(ing)? something to yourself",
            "(thoughts?|think(ing)?) (about|of) (hurt|harm)(ing)? yourself"
          ]
```

**Edit E** — Ray `si_direct`: same append. Unique anchor is Ray's array tail (his `no point…` line has no trailing comma; Marcus's and Dana's do/are inline):

```
old:
            "no point (in )?(going on|carrying on)"
          ]
new:
            "no point (in )?(going on|carrying on)",
            "(thoughts?|think(ing)?) (about|of) (hurt|harm)(ing)? yourself"
          ]
```

**Edit F** — Dana `si_euphemism` (single-line JSON, line ~185): same append. Unique anchor — `"unsafe thoughts"` occurs exactly once in the pack:

```
old: "unsafe thoughts"]
new: "unsafe thoughts", "(thoughts?|think(ing)?) (about|of) (hurt|harm)(ing)? yourself"]
```

Rationale for touching Dana at all: without F, "hurting yourself by skipping meals?" earns Dana a partial while Marcus scores nothing for the same words — a fresh instance of #410-D ("same words, different grade"). F + B/C keep her euphemism mechanic intact (deflection response, `partialIfOnly` partial credit) while declining causal forms uniformly. Dana's `si_direct` is untouched — the guard test asserting it never matches euphemisms must stay green.

- [ ] **Step 2: Validate JSON and occurrence counts**

```bash
python3 -c "import json; json.load(open('_prototypes/sp-interview/sp-interview.pack.json')); print('JSON OK')"
grep -F -c 'worth living(?!' _prototypes/sp-interview/sp-interview.pack.json
grep -F -c 'yourself(?!\\s+by\\b)' _prototypes/sp-interview/sp-interview.pack.json
grep -F -c '(thoughts?|think(ing)?) (about|of) (hurt|harm)(ing)? yourself' _prototypes/sp-interview/sp-interview.pack.json
```

Expected: `JSON OK`, then `3`, `6` (3 hurt + 3 harm), `3`.

- [ ] **Step 3: Run the phrasing suite — all green**

```bash
npm --prefix sp-proxy test
```

Expected: PASS, including both Task 2 tests and every pre-existing test (the D3 approved-phrasings families, the Dana `si_direct` euphemism guard, the case-count pin).

- [ ] **Step 4: Commit**

```bash
git add _prototypes/sp-interview/sp-interview.pack.json
git commit -m "fix(sim-safety): decline causal 'by'-forms and habitability 'worth living in' (Codex #406 r2/r3)"
```

---

### Task 4: Regenerate the preview and run the full local battery

**Files:**
- Modify (generated): `_prototypes/sp-interview/sp-interview.preview.html`

**Interfaces:**
- Consumes: Task 3's pack.
- Produces: a reproducible preview (`--check` PASS) and a green tree Task 6 can push.

- [ ] **Step 1: Regenerate and verify the preview**

```bash
node _prototypes/sp-interview/generate-preview.mjs --write
node _prototypes/sp-interview/generate-preview.mjs --check
```

Expected: `WROTE — sp-interview.preview.html` then `PASS — sp-interview.preview.html is reproducible`.

- [ ] **Step 2: Run the sp-interview suite and the root static suite**

```bash
bash _prototypes/sp-interview/tests/run-all.sh
node --test tests/*.test.mjs
```

Expected: both fully green. (Reminder: never `node --test` the sp-interview tests *directory*.)

- [ ] **Step 3: Commit the regenerated preview**

```bash
git add _prototypes/sp-interview/sp-interview.preview.html
git commit -m "chore(sim-safety): regenerate preview after pack narrowing"
```

---

### Task 5: Record D8/D9 in the decision record

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-faculty-decisions.md` (insert after the D7 section, before the `## Still open after this session` section)

**Interfaces:**
- Consumes: adjudication rationale from Part 1.
- Produces: the decision entries the Task 2 test comment cites (`D8/D9`).

- [ ] **Step 1: Insert the two entries**

```markdown
## D8 · Habitability forms of "worth living" (Codex review of #406, comment 2)

**PROPOSED — ratified by merging PR #406.** `"Is that apartment not worth living in?"` matched the
D3 worth-of-living stem in every case; Ray's case is apartment-centered, so habitability questions
are realistic learner moves there. Fixed by a trailing lookahead — `worth living(?!\s+(in|there|at)\b)` —
which declines "worth living in/there/at …" while preserving every D3-approved phrasing
(regression-tested). Known cost, accepted under the D7 heuristic: a rare genuine screen shaped like
"not worth living in a world without her" now declines — an ambiguous form a regex cannot resolve,
and declining is the safe direction.

## D9 · Causal "by"-forms of hurt/harm-yourself (Codex review of #406, comment 3)

**PROPOSED — ratified by merging PR #406.** `"Do you think you're hurting yourself by sleeping only
two hours?"` — an insight/consequences question, not a screen — matched the D5 stems, certified
Marcus's critical `c_si`, and unlocked `g_si_mixed` at rapport 0. D5 accepted *euphemistic screen →
full credit* as better than a hard miss; it never contemplated crediting a non-screen. Fixed by
`hurt/harm(ing)? yourself(?!\s+by\b)` plus a recovery stem —
`(thoughts?|think(ing)?) (about|of) (hurt|harm)(ing)? yourself` — so thought-framed screens with a
method clause ("thought about hurting yourself by taking pills?") still credit. Applied uniformly:
Marcus `si_direct`, Ray `si_direct`, Dana `si_euphemism` (avoiding a new same-words-different-grade
instance; Dana's deflection mechanic and her `si_direct` euphemism guard are untouched). Does not
supersede #410 item C — the structural `si_euphemism` uniformity for Marcus/Ray remains the full
resolution of euphemism *over-credit*; D9 only stops *non-screens* from crediting at all.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-08-24-faculty-decisions.md
git commit -m "docs(decisions): record D8/D9 — pattern narrowings from the Codex review of #406"
```

---

### Task 6: Full verification, push, and handoff report

**Files:** none beyond prior tasks.

**Interfaces:**
- Consumes: all prior commits.
- Produces: PR #406 updated in place; a handoff report for Josh listing his gated actions (Appendix A).

- [ ] **Step 1: Run the full battery**

```bash
bash bin/verify.sh
```

Expected: green (this is also the pre-push hook, so a clean run here prevents a surprise at push). Locally-skipped CI-only pieces (e.g., the pypdf-dependent PDF export test) are documented behavior, not failures.

- [ ] **Step 2: Re-confirm PR state, then push**

```bash
gh pr view 406 --repo jmoss333/psychiatry-clerkship --json state --jq .state
git push origin feat/wp-b-sim-safety
```

Expected: `OPEN`, then a push that updates PR #406. If the push is rejected because the remote moved: `git pull --rebase origin feat/wp-b-sim-safety`, then re-run `npm --prefix sp-proxy ci --include=dev && npm --prefix sp-proxy test` before pushing (a sync has previously pulled in sp-proxy dep bumps).

- [ ] **Step 3: Watch CI to green**

```bash
gh pr checks 406 --repo jmoss333/psychiatry-clerkship --watch
```

Expected: both required checks SUCCESS. (Trap: Netlify check rows have `name:null` in `statusCheckRollup` — they use `context`; don't jq `.name` with `startswith`.)

- [ ] **Step 4: Write the handoff comment — do NOT post it**

Produce the report for Josh in the session's final message (not on GitHub): what landed (D8/D9 narrowings + tests + preview + decision entries), that CI is green, and the remaining Josh-gated actions from Appendix A. Posting anything to the PR/issue threads is his call.

---

## Appendix A — Josh-gated actions (drafts included; agents do not post or run these)

**A.1 — Reply to + resolve the Codex threads on PR #406** (optional; Codex accepts 👍/👎 reactions too). Suggested reply text, per thread:
- Comment 1 (red-team): *"Tracked from the start — it's the PR's own 'Blocking' section. The remediation commits are on this branch precisely so one checklist run covers the final pack. Running B1–B4 before merge."*
- Comment 2 (worth living): *"Fixed in <sha> with a trailing lookahead `(?!\s+(in|there|at)\b)` rather than a subject constraint — zero false-miss cost against the approved phrasing families, regression-tested in sp-safety-screen-phrasing.test.mjs."*
- Comment 3 (hurt yourself): *"Fixed in <sha>: causal `by`-forms are declined, and a thought-framed recovery stem keeps 'thought about hurting yourself by taking pills?' crediting. Recorded as D9; the structural euphemism-tier fix for Marcus/Ray remains tracked as #410 item C."*

**A.2 — Run `sp-proxy/REDTEAM_CHECKLIST.md`** against the final pack (needs Live mode + passcode). Consider adding two section-B probes while there — the Codex counterexamples verbatim ("Is that apartment not worth living in?" to Ray; "Do you think you're hurting yourself by sleeping only two hours?" to Marcus) — confirming the gates do **not** unlock in Live mode.

**A.3 — Vocabulary decision for the next wave (add to issue #410 item A):** the worth-living family has no past tense — "Did you feel like life **wasn't** worth living?" matches nothing in any case (found during this review's verification). One alternation entry (`wasn'?t|was not|weren'?t`) closes it, but it is an *addition* and needs faculty authorization like the "what is" contraction before it.

**A.4 — Merge PR #406** after A.2 passes (merging = ratification of D8/D9, per the entries' own text).
