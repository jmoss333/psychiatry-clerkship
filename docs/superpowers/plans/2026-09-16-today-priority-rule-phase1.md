# "One Thing First" — Phase 1 (picker, reorder, copy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today shows exactly one primary action, chosen by a single pure ranking function, with everything that did not win demoted under an "Also today" heading — with no new storage key, no change to what writes `cw_progress_v1`, and every existing pinned contract still green.

**Architecture:** A new pure picker `fdTodayPrimary(inputs)` in `fd_today.js` ranks seven kinds from plain inputs. The shell's `fdTodayLive` (in `spa_index.html`) derives those inputs from stores it already reads, calls the picker once, hands `state.primaryKind` to the pure `fdToday` renderer (which demotes its own Continue card when a device-store row won), and composes the primary slot, the explanation line, the "Also today" heading and the demoted rows around a marker `fdToday` emits after its lead card. The three row renderers (`fd_due.js`, `fd_block.js`) gain a `primary` flag that changes class and kicker copy only.

**Tech Stack:** ES5 browser JS (`frontdoor/*.js`, injected into `spa_index.html` at build), tokens-only CSS (`frontdoor.css`), `node:test` unit contracts (`tests/*.test.mjs`), Playwright smoke (`tests/smoke/front-door.spec.js`), Python build + QA gate.

**Spec:** `docs/superpowers/plans/2026-09-16-today-priority-rule-handoff.md` §2, §3, §7 (A/D/E), §9. Assumption **A1** ("unfinished outranks reviews due") is treated as given.

**Ground truth recorded 2026-09-16 by the planning session:** `origin/main` = `41184a4` (seven commits past the audited `3cdec90`; none touch `frontdoor/`, `spa_index.html`, `question-bank-practice.html`, `frontdoor.css`, or the front-door tests — every handoff line anchor was re-read and holds). Branch `claude/today-priority-rule-p1` created from `origin/main` in worktree `.claude/worktrees/production-accessibility-audit-3d2f52`. `gh pr list --state open` (9 PRs) — none touches `frontdoor/`. Working tree clean.

## Global Constraints

Copied from the handoff §1d and from the contracts actually read in the repo:

- `frontdoor/*.js` is **ES5 only**: `var`/`function`; no `const`/`let`, no `=>`, no template literals. `tests/fd-due.test.mjs:82` scans the **whole source of `fd_due.js` including comments** with `/\b(?:const|let)\s|=>|`/` — so no comment may contain the words "const " or "let " either.
- Every rendered string ships to both sites: none may match `/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`. `tests/fd-due.test.mjs:83` applies this **to the source of `fd_due.js`, comments included, case-insensitively** — so no comment in that file may contain the letter sequence "une" ("tune", "June", "unexpected", "reunite", "immune", "fortune"), nor "shelf", "student", "resident".
- `fd_today.js` source (comments included) must not match `/localStorage\.|document\.|window\.|Date\.now\(\)/` (`tests/fd-today.test.mjs:386`), and its rendered output must not match `/fd-due|fd-capture|data-fd-due|data-fd-capture/i` (`:391`). `fd_block.js` body with comments stripped must not match `/document\.|localStorage|Date\.now\(|new Date\(\)/` (`tests/fd-block.test.mjs:192`).
- `tests/fd-today.test.mjs:114` pins the default Continue card's opening `class="fd-continue" data-fd-open="t.html"` byte-exactly.
- `tests/block-wiring.test.mjs:50–58`: the `fdTodayLive` → `fdRenderCapture` slice of `spa_index.html` must contain `fdBlockCard(` and match `/if\(!facultyPreviewRequest\)\{\s*var liveForBlock/`. Satisfy it; do not edit the regex.
- `tests/ward-capture-store.test.mjs:249–254`: the `fdTodayLive` → `fdProgressMarkup` slice must contain `if(!facultyPreviewRequest)` and `data-capture-open` (the latter lives in `fdRenderCapture`, so the function order `fdTodayLive`, `fdRenderCapture`, `fdProgressMarkup` must not change).
- `tests/resume-card.test.mjs:38` pins `/fdResumeCard\(sess\)/` in the shell. Passing a second argument breaks this regex; the plan updates that pin (Task 5) — it is the only test edit that is not purely additive, and the contract it protects ("Today composes the capsule row") still holds.
- `tests/fd-reader.test.mjs:159,172` count the substrings `Continue to your 2 questions →` and `Finish block →`; the `Mark done · ` prefix keeps them as substrings, so they stay green untouched.
- **CSS ratchet** (`bin/check_design_drift.py`, pinned in `design_drift_baseline.json`): any `font-size`, `border-radius`, `gap`, `padding` or `margin` declaration whose value is not `var(...)` or one of `0|none|auto|inherit|initial|unset|100%|50%|999px` raises `raw_dimension_declarations` and **fails**. New CSS uses `var(--fd-space-N)`, `var(--fd-font-*)`, `var(--fd-radius-*)` for those five properties, always. `color:` must never be set to a fill token (`--fd-terracotta|--fd-teal|--fd-olive`); use the ink tokens (`--fd-terracotta-dark`, `--fd-teal-deep`). No colour literals. Breakpoints only `430|640|1000`.
- `tests/fd-tokens.test.mjs:181` pins the **distinct `fd-*` selector-name count** in comment-stripped `frontdoor.css` to the number on line 6 of `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` (currently 277). Adding selectors requires updating that line.
- `tests/fd-tokens.test.mjs`'s `block()` resolves a selector by **first textual match** — put every new rule **after** the base rules it overrides (append to the end of `frontdoor.css`).
- localStorage keys are `cw_*`/`rp_*`; **this phase adds no key**.
- Copy literal for the explanation line, verbatim: `First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.`
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never `--no-verify`. Visual baselines are refreshed only by the "Refresh visual baselines" `workflow_dispatch` — never locally.
- Run everything from the worktree root `/Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/production-accessibility-audit-3d2f52` (all paths below are relative to it). `_build/` is generated output; never edit it.

---

## File structure

| File | Responsibility in this phase |
|---|---|
| `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js` | **Modify.** Add the pure picker (`FD_TODAY_PRIMARY_ORDER`, `fdTodayPrimaryHolds`, `fdTodayPrimary`), the last-read resolver `fdTodayLastRead`, the explanation `fdTodayWhy`/`FD_TODAY_WHY`, the splice marker `FD_TODAY_LEAD_END`; extend `fdContinue` with `primary`, the kind chip and the fresh-set button; `fdToday` reads `state.primaryKind` and emits the marker. |
| `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js` | **Modify.** Add `fdCapsuleLeft`; `fdDueRow`/`fdResumeCard` take `primary`; add `fdLastReadRow`. |
| `13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js` | **Modify.** `fdBlockHandoffLabel` prefix; `fdBlockCard` takes `opts` (`primary`); empty-state control; hint copy. |
| `13_Faculty_Resources/_automation/site_build/spa_index.html` | **Modify** `fdTodayLive` only (lines 2069–2082). |
| `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css` | **Modify.** Add `.fd-lastread` to the shared runtime-row selector lists (lines 796/801/803); append the One-Thing-First block at the end of the file. |
| `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` | **Modify.** Selector count on line 6; document the new classes under §3 Today and the state-class table. |
| `tests/fd-today.test.mjs`, `tests/fd-due.test.mjs`, `tests/fd-block.test.mjs`, `tests/block-wiring.test.mjs` | **Modify (additive).** New contracts, written red first. |
| `tests/resume-card.test.mjs` | **Modify** one regex (line 38). |
| `tests/smoke/front-door.spec.js` | **Modify (additive).** A-, D-, E-series checks. |

Not touched in this phase: `fd_wire.js`, `question-bank-practice.html`, `reviewed.json`, any content page, `CLAUDE.md`/`AGENTS.md`, `site_manifest.json`, any registry.

---

### Task 0: Stage the handoff and this plan on the branch

**Files:**
- Already written (uncommitted): `docs/superpowers/plans/2026-09-16-today-priority-rule-handoff.md`, `docs/superpowers/plans/2026-09-16-today-priority-rule-phase1.md`

- [ ] **Step 1: Confirm branch and cleanliness**

Run:
```bash
git branch --show-current && git status --short | grep -v '\.m4a$'
```
Expected: `claude/today-priority-rule-p1`; the only two untracked lines are the two plan docs.

- [ ] **Step 2: Commit the docs**

```bash
git add docs/superpowers/plans/2026-09-16-today-priority-rule-handoff.md docs/superpowers/plans/2026-09-16-today-priority-rule-phase1.md
git commit -m "docs(plan): One Thing First — handoff + Phase 1 plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: The pure picker, last-read resolver, explanation line and lead marker in `fd_today.js`

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js` (insert after `fdTodayProgress`, i.e. after line 52, before the `fdRow` comment block)
- Test: `tests/fd-today.test.mjs`

**Interfaces:**
- Produces: `FD_TODAY_PRIMARY_ORDER` (array of 7 strings), `FD_TODAY_LEAD_END` (string `'<!--fd-lead-end-->'`), `FD_TODAY_WHY` (string), `fdTodayPrimary(inputs) → {kind}` where `inputs = {capsuleLeft:number, blockNext:object|null, dueTotal:number, weekProgress:{done,total,next}, hasWeek:boolean, lastRead:object|null}`, `fdTodayLastRead(ref, weekItems, progress, doneMap) → {ref,kind,title,minutes,done,isContinueTarget}|null`, `fdTodayWhy() → string`.
- Consumed by Task 2 (`fdToday`), Task 5 (`fdTodayLive`).

- [ ] **Step 1: Extend the test harness exports**

In `tests/fd-today.test.mjs`, change lines 21–22 (the `return {…}` inside `make`) to:

```js
  return { fdTodayProgress: fdTodayProgress, fdToday: fdToday, fdBuildIndex: fdBuildIndex,
           fdItemsForWeek: fdItemsForWeek, fdLibraryOnlyReads: fdLibraryOnlyReads,
           fdFindWeek: fdFindWeek, fdContinue: fdContinue, fdTodayPrimary: fdTodayPrimary,
           fdTodayLastRead: fdTodayLastRead, fdTodayWhy: fdTodayWhy,
           FD_TODAY_PRIMARY_ORDER: FD_TODAY_PRIMARY_ORDER, FD_TODAY_LEAD_END: FD_TODAY_LEAD_END,
           FD_TODAY_WHY: FD_TODAY_WHY };
```

- [ ] **Step 2: Write the failing picker tests**

Append to `tests/fd-today.test.mjs`:

```js
// ---- One Thing First: the priority rule (handoff 2026-09-16 §2) --------------------------
//
// The picker is pure over plain inputs the shell derives. The ORDER is one array so that
// reversing assumption A1 ("unfinished outranks reviews due") is a swap of two entries in
// fd_today.js plus the expected column of the table below — nothing else moves.

const PICK = (over) => F.fdTodayPrimary(Object.assign({
  capsuleLeft: 0, blockNext: null, dueTotal: 0, hasWeek: true,
  weekProgress: { done: 0, total: 2, next: { ref: 'a.md' } }, lastRead: null,
}, over)).kind;
const LAST_READ = { ref: 'b.md', kind: 'read', done: false, isContinueTarget: false };
const NO_WEEK = { done: 0, total: 0, next: null };

test('the order is a single array, top-down, and A1 places unfinished work above reviews due', () => {
  assert.deepEqual(F.FD_TODAY_PRIMARY_ORDER, ['resume', 'block', 'read', 'due', 'week', 'ahead', 'setup']);
});

test('the primary is the first true row of the table', () => {
  const table = [
    // rule 1: unfinished — resume › block › "You were reading"
    [{ capsuleLeft: 4, blockNext: { kind: 'qb' }, dueTotal: 2, lastRead: LAST_READ }, 'resume'],
    [{ blockNext: { kind: 'qb' }, dueTotal: 2, lastRead: LAST_READ }, 'block'],
    [{ dueTotal: 2, lastRead: LAST_READ }, 'read'],
    // rule 2: reviews due
    [{ dueTotal: 2 }, 'due'],
    // rule 3: the week has an undone item
    [{}, 'week'],
    // rule 4: week complete
    [{ weekProgress: { done: 2, total: 2, next: null } }, 'ahead'],
    // rule 5: no week
    [{ hasWeek: false, weekProgress: NO_WEEK }, 'setup'],
    // unfinished work and dues still outrank a missing week
    [{ hasWeek: false, weekProgress: NO_WEEK, capsuleLeft: 1 }, 'resume'],
    [{ hasWeek: false, weekProgress: NO_WEEK, dueTotal: 3 }, 'due'],
  ];
  for (const [over, kind] of table) assert.equal(PICK(over), kind, JSON.stringify(over));
});

test('"You were reading" falls through when the last item is done, a tool, or already the Continue target', () => {
  assert.equal(PICK({ lastRead: Object.assign({}, LAST_READ, { done: true }) }), 'week');
  assert.equal(PICK({ lastRead: Object.assign({}, LAST_READ, { kind: 'tool' }) }), 'week');
  assert.equal(PICK({ lastRead: Object.assign({}, LAST_READ, { isContinueTarget: true }) }), 'week');
  assert.equal(PICK({ lastRead: null }), 'week');
});

test('a capsule with nothing left and a block with no next step do not win', () => {
  assert.equal(PICK({ capsuleLeft: 0, blockNext: null, dueTotal: 1 }), 'due');
  assert.equal(PICK({ capsuleLeft: -1 }), 'week');
  assert.equal(PICK({ capsuleLeft: 'x' }), 'week');
});

test('a week with no items is neither complete nor in progress; Continue still leads', () => {
  assert.equal(PICK({ weekProgress: NO_WEEK }), 'week');
  assert.equal(F.fdTodayPrimary(undefined).kind, 'setup', 'no inputs at all reads as no week');
});

test('fdTodayLastRead resolves cw_last against THIS week only and carries done + target', () => {
  const items = F.fdItemsForWeek(IDX, 1);           // a.md (read), t.html (tool)
  const progress = F.fdTodayProgress(items, {});    // next = a.md
  assert.equal(F.fdTodayLastRead('zzz.md', items, progress, {}), null, 'not a week item');
  assert.equal(F.fdTodayLastRead('', items, progress, {}), null);
  assert.equal(F.fdTodayLastRead(null, items, progress, {}), null);
  assert.deepEqual(F.fdTodayLastRead('a.md', items, progress, {}),
    { ref: 'a.md', kind: 'read', title: 'Page A', minutes: 6, done: false, isContinueTarget: true });
  assert.deepEqual(F.fdTodayLastRead('t.html', items, progress, { 't.html': true }),
    { ref: 't.html', kind: 'tool', title: 'Tool T', minutes: null, done: true, isContinueTarget: false });
});

test('the explanation line is one paragraph with the approved copy, audience-neutral, and no due/capture markup', () => {
  assert.equal(F.fdTodayWhy(),
    '<p class="fd-primary__why">First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.</p>');
  assert.equal(F.FD_TODAY_WHY, 'First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.');
  assert.doesNotMatch(F.fdTodayWhy(), AUDIENCE_TOKEN_RE);
  assert.doesNotMatch(F.fdTodayWhy(), /fd-due|fd-capture/i);
});

test('the lead-end marker is an HTML comment the shell can splice at', () => {
  assert.equal(F.FD_TODAY_LEAD_END, '<!--fd-lead-end-->');
});
```

- [ ] **Step 3: Run the new tests and confirm they fail for the right reason**

Run:
```bash
node --test tests/fd-today.test.mjs 2>&1 | tail -40
```
Expected: the harness throws `ReferenceError: fdContinue is not defined`-style errors from `new Function` (because the `return` names symbols that do not exist yet), so the whole file errors. That is the right red: the symbols are missing.

- [ ] **Step 4: Add the picker to `fd_today.js`**

Insert **after line 52** (the closing `}` of `fdTodayProgress`) and before the `/* Shared week-item row` comment:

```js
/* ---- One Thing First: the priority rule (2026-09-16) -------------------------------------
   Today shows exactly one primary action. fdTodayPrimary picks it as the first true row of
   FD_TODAY_PRIMARY_ORDER, top-down, from plain inputs the shell already derives (the question
   bank capsule, the live timed block, the SRS due count, this week's progress, the last opened
   item). Pure: no store, no clock -- the shell resolves every input, this file only ranks.

   The order is ONE array on purpose. Assumption A1 in the handoff -- "unfinished outranks
   reviews due" -- was approved on a preview, not answered directly; reversing it is a swap of
   two entries here plus the expected column of the picker table in tests/fd-today.test.mjs,
   and nothing else moves.

   Kinds: resume (a capsule with questions left), block (a live block with a next step), read
   (cw_last names an undone read in this week that is not already the Continue target), due
   (reviews due), week (Continue the week), ahead (week complete: look ahead), setup (no week).
   The first three are one row in the learner-facing rule ("Pick up where you left off"); they
   stay distinct here because each renders a different card. */
var FD_TODAY_PRIMARY_ORDER=['resume','block','read','due','week','ahead','setup'];

/* The shell splices the secondary section at this marker -- directly after the lead card
   (Continue or the setup CTA) -- so a Continue card that won stays first in the column and one
   that lost sits below the demoted device-store rows. An HTML comment is invisible to the
   learner and to every selector; fdTodayLive removes or replaces it. */
var FD_TODAY_LEAD_END='<!--fd-lead-end-->';

var FD_TODAY_WHY='First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.';

function fdTodayPrimaryHolds(kind, inp){
  var wp=inp.weekProgress||{};
  if(kind==='resume') return typeof inp.capsuleLeft==='number'&&inp.capsuleLeft>0;
  if(kind==='block') return !!inp.blockNext;
  if(kind==='read'){
    var lr=inp.lastRead;
    return !!lr&&lr.kind==='read'&&lr.done!==true&&lr.isContinueTarget!==true;
  }
  if(kind==='due') return typeof inp.dueTotal==='number'&&inp.dueTotal>0;
  if(kind==='week') return inp.hasWeek===true&&!!wp.next;
  if(kind==='ahead') return inp.hasWeek===true&&typeof wp.total==='number'&&wp.total>0&&wp.done===wp.total;
  if(kind==='setup') return inp.hasWeek!==true;
  return false;
}

function fdTodayPrimary(inputs){
  var inp=inputs||{};
  for(var i=0;i<FD_TODAY_PRIMARY_ORDER.length;i++){
    if(fdTodayPrimaryHolds(FD_TODAY_PRIMARY_ORDER[i], inp)) return {kind:FD_TODAY_PRIMARY_ORDER[i]};
  }
  /* A week with no items: nothing is next and nothing is complete. Continue is still the honest
     lead -- it previews the next week. */
  return {kind:'week'};
}

/* Resolves the last opened ref against THIS week's items. Null when it is not a week item (a
   library read, a tool from the rail, nothing opened yet): the row is about picking the week
   back up, not a general history. done and isContinueTarget ride along so the picker's "read"
   row and the shell's secondary list read one object. */
function fdTodayLastRead(ref, weekItems, progress, doneMap){
  if(typeof ref!=='string'||!ref) return null;
  var list=weekItems||[], d=doneMap||{}, it=null;
  for(var i=0;i<list.length;i++){ if(list[i]&&list[i].ref===ref){ it=list[i]; break; } }
  if(!it) return null;
  var target=(progress&&progress.next)?progress.next.ref:null;
  return {ref:it.ref, kind:it.kind, title:it.title, minutes:it.minutes,
    done:d[it.ref]===true, isContinueTarget:target===it.ref};
}

function fdTodayWhy(){
  return '<p class="fd-primary__why">'+FD_TODAY_WHY+'</p>';
}
```

- [ ] **Step 5: Run the file — the new picker tests pass; `fdContinue` export still needs nothing (it already exists)**

Run:
```bash
node --test tests/fd-today.test.mjs 2>&1 | tail -20
```
Expected: all tests pass (the harness now finds every exported symbol; `fdContinue` already existed). If the purity test at line 386 fails, a comment in the inserted block contains one of `localStorage.` / `document.` / `window.` / `Date.now()` — fix the comment, not the test.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js tests/fd-today.test.mjs
git commit -m "feat(today): pure priority picker, last-read resolver, explanation line

fdTodayPrimary ranks seven kinds from plain inputs; the order is one array so
assumption A1 (unfinished outranks reviews due) is a one-line reversal.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `fdContinue` primary/secondary, kind chip, fresh-set button; `fdToday` reads `primaryKind`

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js` — `fdContinue` (lines 123–157 as of `41184a4`; shifted down by Task 1's insertion) and the lead-card line in `fdToday` (`out+=hasWeek?fdContinue(idx,st, wk, progress):fdSetupCta();`)
- Test: `tests/fd-today.test.mjs`

**Interfaces:**
- Consumes: `FD_TODAY_LEAD_END` (Task 1).
- Produces: `fdContinue(index, state, wk, progress, primary)` — `primary===false` ⇒ class `fd-continue is-secondary`; undefined/true ⇒ `fd-continue` (unchanged) and, when the week is complete, a sibling `<button class="fd-btn fd-btn--ghost fd-freshset" data-fd-open="question-bank-practice.html">Practice a fresh set →</button>`. `fdToday` honours `state.primaryKind` and emits `FD_TODAY_LEAD_END` once, immediately after the lead card.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fd-today.test.mjs`:

```js
// ---- fdContinue: one lead card, demotable ------------------------------------------------

const WK1 = F.fdFindWeek(IDX, 1);
const PROG = (done) => F.fdTodayProgress(F.fdItemsForWeek(IDX, 1), done);

test('fdContinue: primary undefined renders exactly what primary=true renders, and opens with the pinned class', () => {
  const a = F.fdContinue(IDX, s({}), WK1, PROG({}));
  const b = F.fdContinue(IDX, s({}), WK1, PROG({}), true);
  assert.equal(a, b);
  assert.match(a, /^<button type="button" class="fd-continue" data-fd-open="a\.md">/);
  assert.doesNotMatch(a, /is-secondary|fd-freshset/);
});

test('fdContinue: primary=false adds is-secondary and changes nothing else', () => {
  const secondary = F.fdContinue(IDX, s({}), WK1, PROG({}), false);
  assert.match(secondary, /^<button type="button" class="fd-continue is-secondary" data-fd-open="a\.md">/);
  assert.equal(secondary.replace(' is-secondary', ''), F.fdContinue(IDX, s({}), WK1, PROG({})));
});

test('fdContinue names the kind of the next item with the same chip rule as the week rows', () => {
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({})),
    /<span class="fd-continue__title">Page A<span class="fd-chip">read<\/span> →<\/span>/);
  assert.match(F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true })),
    /<span class="fd-continue__title">Tool T<span class="fd-chip is-tool">tool<\/span> →<\/span>/);
  // A rights reference reads "reference", never "tool" (fd_data.js: rights is a presentation flag).
  const rights = JSON.parse(JSON.stringify(IDX));
  rights.weeks[0].items[1].rights = true;
  assert.match(F.fdContinue(rights, s({}), F.fdFindWeek(rights, 1),
    F.fdTodayProgress(F.fdItemsForWeek(rights, 1), { 'a.md': true })),
    /<span class="fd-chip is-tool">reference<\/span>/);
  // No chip on the look-ahead card — there is no next item to name.
  assert.doesNotMatch(F.fdContinue(IDX, s({}), WK1, PROG({ 'a.md': true, 't.html': true })), /fd-chip/);
});

test('a completed week, when primary, offers a fresh set beside the look-ahead card — as a sibling, never nested', () => {
  const done = { 'a.md': true, 't.html': true };
  const lead = F.fdContinue(IDX, s({ done }), WK1, PROG(done));
  assert.match(lead, /<\/button><button type="button" class="fd-btn fd-btn--ghost fd-freshset" data-fd-open="question-bank-practice\.html">Practice a fresh set →<\/button>$/);
  assert.equal((lead.match(/<button/g) || []).length, 2);
  assert.doesNotMatch(F.fdContinue(IDX, s({ done }), WK1, PROG(done), false), /fd-freshset/,
    'a demoted look-ahead card keeps its footprint small');
  assert.doesNotMatch(F.fdContinue(IDX, s({}), WK1, PROG({})), /fd-freshset/,
    'an unfinished week never offers the fresh set from this card');
});

test('fdToday demotes its own Continue card only when a device-store row won', () => {
  for (const kind of [undefined, 'week', 'ahead', 'setup']) {
    assert.match(F.fdToday(IDX, s({ primaryKind: kind })), /class="fd-continue" data-fd-open/, String(kind));
  }
  for (const kind of ['resume', 'block', 'due', 'read']) {
    assert.match(F.fdToday(IDX, s({ primaryKind: kind })), /class="fd-continue is-secondary" data-fd-open/, kind);
  }
});

test('fdToday emits the lead-end marker exactly once, directly after the lead card', () => {
  const html = F.fdToday(IDX, s({}));
  assert.equal(html.split(F.FD_TODAY_LEAD_END).length - 1, 1);
  const lead = html.indexOf('class="fd-continue"');
  const mark = html.indexOf(F.FD_TODAY_LEAD_END);
  const list = html.indexOf('<div class="fd-listhead">');
  assert.ok(lead > -1 && lead < mark && mark < list, `lead ${lead} mark ${mark} list ${list}`);
  const setup = F.fdToday(IDX, s({ week: null }));
  assert.equal(setup.split(F.FD_TODAY_LEAD_END).length - 1, 1);
  assert.ok(setup.indexOf('fd-setupcta') < setup.indexOf(F.FD_TODAY_LEAD_END));
  const complete = F.fdToday(IDX, s({ done: { 'a.md': true, 't.html': true } }));
  assert.ok(complete.indexOf('fd-freshset') < complete.indexOf(F.FD_TODAY_LEAD_END),
    'the fresh-set button belongs to the lead, above the marker');
});

test('the same primary kind renders the same lead treatment for both path ids', () => {
  for (const id of ['ms3-six-week', 'resident-four-week']) {
    const idx = Object.assign({}, IDX, { path: { id } });
    assert.match(F.fdToday(idx, s({ primaryKind: 'week' })), /class="fd-continue" data-fd-open/, id);
    assert.match(F.fdToday(idx, s({ primaryKind: 'resume' })), /class="fd-continue is-secondary" data-fd-open/, id);
  }
});

test('every new string is audience-neutral', () => {
  const done = { 'a.md': true, 't.html': true };
  const all = F.fdContinue(IDX, s({}), WK1, PROG({}), false)
    + F.fdContinue(IDX, s({ done }), WK1, PROG(done))
    + F.fdTodayWhy();
  assert.doesNotMatch(all, AUDIENCE_TOKEN_RE);
});
```

- [ ] **Step 2: Run and confirm red**

Run:
```bash
node --test tests/fd-today.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)" | head
```
Expected: the eight new tests fail (`is-secondary` absent, no chip, no `fd-freshset`, marker count 0); every pre-existing test still passes.

- [ ] **Step 3: Rewrite `fdContinue`**

Replace the whole `fdContinue` function (from `function fdContinue(index, state, wk, progress){` through its closing `}`) with:

```js
function fdContinue(index, state, wk, progress, primary){
  /* primary===false demotes the card (a device-store row won Today's one primary slot);
     undefined means primary, so every caller and test that predates the picker renders exactly
     as before. */
  var isPrimary=primary!==false;
  var isComplete=progress.total>0&&progress.done===progress.total;
  var suggested=index.path&&index.path.id==='ms3-six-week';
  var kickerCls=isComplete?'fd-continue__kicker is-complete':'fd-continue__kicker';
  var kickerText=isComplete?('Week '+fdEsc(state.week)+(suggested?' activities complete':' complete')):('Continue · Week '+fdEsc(state.week));
  var ringPct=(typeof state.ringPct==='number'&&!isNaN(state.ringPct))?state.ringPct:0;
  var titleText, openAttrs, chip='';
  if(progress.next){
    titleText=progress.next.title;
    openAttrs=' data-fd-open="'+fdEsc(progress.next.ref)+'"';
    /* Same chip rule as fdRow: a rights reference reads "reference", never "tool". */
    var nx=progress.next;
    chip='<span class="'+((nx.kind==='tool')?'fd-chip is-tool':'fd-chip')+'">'+
      (nx.rights?'reference':((nx.kind==='tool')?'tool':'read'))+'</span>';
  } else {
    var nextWeek=fdNextWeek(index,state.week);
    var target=nextWeek?nextWeek.n:state.week;
    titleText=(nextWeek?'Preview Week ':'Review Week ')+target;
    openAttrs=' data-fd-tab="path" data-fd-view-week="'+fdEsc(target)+'"';
  }
  var done=fdProgressForWeek(index,state,state.week), leftMin=0;
  for(var i=0;i<wk.items.length;i++){
    if(done[wk.items[i].ref]!==true&&typeof wk.items[i].minutes==='number') leftMin+=wk.items[i].minutes;
  }
  var leftLabel=leftMin>0?('~'+leftMin+' min left'):'';
  var out='<button type="button" class="'+(isPrimary?'fd-continue':'fd-continue is-secondary')+'"'+openAttrs+'>'+
    '<span class="fd-ring" style="--fd-ring-pct:'+ringPct+'%">'+
      '<span class="fd-ring__inner">'+ringPct+'%</span>'+
    '</span>'+
    '<span>'+
      '<span class="'+kickerCls+'">'+kickerText+'</span>'+
      '<span class="fd-continue__title">'+fdEsc(titleText)+chip+' →</span>'+
    '</span>'+
    '<span class="fd-continue__meta">'+
      '<span class="fd-continue__count">'+progress.done+' of '+progress.total+(suggested?' activities done':' done')+'</span>'+
      '<span class="fd-continue__left">'+leftLabel+'</span>'+
    '</span>'+
  '</button>';
  /* Week complete AND primary: the look-ahead card leads, and a learner with time left wants
     questions, not a preview. A sibling, never nested -- a button inside a button is invalid
     markup and the controller would see one click twice. */
  if(isComplete&&isPrimary){
    out+='<button type="button" class="fd-btn fd-btn--ghost fd-freshset" data-fd-open="question-bank-practice.html">Practice a fresh set →</button>';
  }
  return out;
}
```

- [ ] **Step 4: Make `fdToday` read `primaryKind` and emit the marker**

In `fdToday`, replace the single line

```js
  out+=hasWeek?fdContinue(idx,st, wk, progress):fdSetupCta();
```

with

```js
  /* One Thing First: state.primaryKind arrives from the shell's picker. The lead card is
     primary unless a device-store row won; undefined keeps the pre-picker render. The marker
     that follows is where the shell splices the secondary section (see FD_TODAY_LEAD_END). */
  var pk=st.primaryKind;
  var leadPrimary=(pk===undefined||pk==='week'||pk==='ahead'||pk==='setup');
  out+=hasWeek?fdContinue(idx,st, wk, progress, leadPrimary):fdSetupCta();
  out+=FD_TODAY_LEAD_END;
```

- [ ] **Step 5: Run the whole node suite (other files load `fd_today.js` too)**

Run:
```bash
node --test tests/*.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: `# fail 0`. Files that load `fd_today.js` and must stay green: `fd-path`, `fd-reader`, `fd-not-found`, `fd-progress-compat`, `fd-settings`, `fd-wire`, `phase-chip`, `retired-instrument-presentation`, `fd-shell-boot`. If `fd-path.test.mjs` fails, the chip markup leaked into `fdRow` — it must not; the chip is built inside `fdContinue` only.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js tests/fd-today.test.mjs
git commit -m "feat(today): Continue card is demotable, names its next item's kind, offers a fresh set when the week is done

fdToday reads state.primaryKind and emits FD_TODAY_LEAD_END after the lead card
for the shell to splice at. Undefined primaryKind renders as before.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `fd_due.js` — `fdCapsuleLeft`, primary due/resume rows, `fdLastReadRow`

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js` (lines 16–44)
- Test: `tests/fd-due.test.mjs`

**Interfaces:**
- Produces: `fdCapsuleLeft(capsule) → number` (0 for any malformed capsule; same shape rule `fdResumeCard` used); `fdDueRow(breakdown, primary)`; `fdResumeCard(capsule, primary)`; `fdLastReadRow(item, primary)` where `item` is the object `fdTodayLastRead` returns. `primary===true` adds `is-primary` and the kicker copy; anything else renders today's markup byte-for-byte.
- Consumed by Task 5.

**Source-scan traps for this file (see Global Constraints):** no `const `/`let ` anywhere including comments; no "une" letter sequence, "shelf", "student", "resident" in comments; no `localStorage`.

- [ ] **Step 1: Extend the harness and write the failing tests**

In `tests/fd-due.test.mjs`, change the `make` return (lines 10–14) to:

```js
const make = new Function(`${data}\n${due}\nreturn {
  fdDueRow: fdDueRow,
  fdResumeCard: fdResumeCard,
  fdCaptureTriage: fdCaptureTriage,
  fdCapsuleLeft: fdCapsuleLeft,
  fdLastReadRow: fdLastReadRow,
};`);
```

Append:

```js
// ---- One Thing First: primary variants of the device-store rows (handoff 2026-09-16) -------

const DUE_ONE = { daily: { due: 1 }, qb: { due: 0 }, fam: { due: 0 }, other: { due: 0 } };
const CAPSULE = { queueIds: ['a', 'b', 'c'], idx: 1 };

test('fdCapsuleLeft owns the capsule shape rule once: questions left, or 0 for anything malformed', () => {
  for (const invalid of [null, undefined, {}, { queueIds: 'bad', idx: 0 }, { queueIds: [], idx: 0 },
    { queueIds: ['a'], idx: -1 }, { queueIds: ['a'], idx: 2 }, { queueIds: ['a'], idx: '0' },
    { queueIds: ['a', 'b'], idx: 0.5 }]) {
    assert.equal(F.fdCapsuleLeft(invalid), 0, JSON.stringify(invalid));
  }
  assert.equal(F.fdCapsuleLeft(CAPSULE), 2);
  assert.equal(F.fdCapsuleLeft({ queueIds: ['a'], idx: 1 }), 0, 'a finished session has nothing to resume');
});

test('fdDueRow(b, true) is the primary: is-primary plus the kicker; false or undefined is today\'s markup', () => {
  const plain = F.fdDueRow(DUE_ONE);
  assert.equal(F.fdDueRow(DUE_ONE, false), plain);
  assert.equal(F.fdDueRow(DUE_ONE, undefined), plain);
  assert.doesNotMatch(plain, /is-primary|fd-due__kicker/);
  const primary = F.fdDueRow(DUE_ONE, true);
  assert.match(primary, /^<button type="button" class="fd-due is-primary" data-fd-open="review\.html"><span class="fd-due__kicker">Clear what’s due<\/span><span class="fd-due__label">1 review due<\/span>/);
  assert.equal(primary.replace(' is-primary', '').replace('<span class="fd-due__kicker">Clear what’s due</span>', ''), plain);
  assert.equal(F.fdDueRow({ daily: { due: 0 } }, true), '', 'nothing due renders nothing, primary or not');
});

test('fdResumeCard(c, true) is the primary: is-primary and the "Pick up" heading; the route is untouched', () => {
  const plain = F.fdResumeCard(CAPSULE);
  assert.equal(F.fdResumeCard(CAPSULE, false), plain);
  assert.match(plain, /<section class="fd-resume"><h2 class="fd-sectionhead">Continue where you left off<\/h2>/);
  const primary = F.fdResumeCard(CAPSULE, true);
  assert.match(primary, /^<section class="fd-resume is-primary"><h2 class="fd-sectionhead">Pick up where you left off<\/h2>/);
  assert.match(primary, /href="\?tool=question-bank-practice\.html&amp;resume=1"/);
  assert.match(primary, /2 left, ~2 min/);
  assert.equal(F.fdResumeCard({ queueIds: ['a'], idx: 1 }, true), '');
});

test('fdLastReadRow renders "You were reading" for an undone week read, escapes the title, never for a tool', () => {
  const read = { ref: 'a&b.md', kind: 'read', title: '<Page> & Co', minutes: 6, done: false, isContinueTarget: false };
  const plain = F.fdLastReadRow(read);
  assert.match(plain, /^<button type="button" class="fd-lastread" data-fd-open="a&amp;b\.md">/);
  assert.match(plain, /<span class="fd-lastread__title">You were reading: &lt;Page&gt; &amp; Co — 6 min<\/span>/);
  assert.match(plain, /<span class="fd-lastread__action">Open →<\/span><\/button>$/);
  assert.doesNotMatch(plain, /<Page>|fd-lastread__kicker|is-primary/);
  assert.equal(F.fdLastReadRow(read, false), plain);

  const primary = F.fdLastReadRow(read, true);
  assert.match(primary, /^<button type="button" class="fd-lastread is-primary" data-fd-open="a&amp;b\.md"><span class="fd-lastread__kicker">Pick up where you left off<\/span><span class="fd-lastread__title">You were reading: /);

  assert.equal(F.fdLastReadRow(Object.assign({}, read, { kind: 'tool' }), true), '', 'a tool is not reading');
  assert.equal(F.fdLastReadRow(null, true), '');
  assert.equal(F.fdLastReadRow({ ref: '', kind: 'read' }), '');
  assert.match(F.fdLastReadRow({ ref: 'x.md', kind: 'read', title: 'X', minutes: null }), /You were reading: X<\/span>/,
    'no minutes, no dash');
});

test('the primary variants are audience-neutral', () => {
  const all = F.fdDueRow(DUE_ONE, true) + F.fdResumeCard(CAPSULE, true)
    + F.fdLastReadRow({ ref: 'x.md', kind: 'read', title: 'X', minutes: 3 }, true);
  assert.doesNotMatch(all, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});
```

- [ ] **Step 2: Run and confirm red**

Run:
```bash
node --test tests/fd-due.test.mjs 2>&1 | tail -20
```
Expected: the harness throws because `fdCapsuleLeft`/`fdLastReadRow` are not defined. Right red.

- [ ] **Step 3: Edit `fd_due.js`**

Replace lines 16–44 (`fdDueRow` and `fdResumeCard`) with:

```js
/* primary===true marks the row as Today's one primary action: it gains is-primary and a
   kicker naming the move. Anything else renders the row exactly as before. */
function fdDueRow(breakdown, primary){
  var b=breakdown||{}, total=fdDueCount(b), parts=[], isPrimary=primary===true;
  if(!total) return '';
  if(b.daily&&b.daily.due) parts.push(b.daily.due+' daily');
  if(b.qb&&b.qb.due) parts.push(b.qb.due+' practice');
  if(b.fam&&b.fam.due) parts.push(b.fam.due+' family');
  if(b.comm&&b.comm.due) parts.push(b.comm.due+' communication');
  if(b.reason&&b.reason.due) parts.push(b.reason.due+' reasoning');
  if(b.other&&b.other.due) parts.push(b.other.due+' other');
  return '<button type="button" class="'+(isPrimary?'fd-due is-primary':'fd-due')+'" data-fd-open="review.html">'+
    (isPrimary?'<span class="fd-due__kicker">Clear what’s due</span>':'')+
    '<span class="fd-due__label">'+total+' review'+(total===1?'':'s')+' due</span>'+
    '<span class="fd-due__breakdown">'+fdEsc(parts.join(' · '))+'</span>'+
    '<span class="fd-due__action">Start review →</span>'+
  '</button>';
}

/* Questions left in a capsule, or 0 for anything malformed. The shape rule lives here once so
   the resume card and the Today picker (fd_today.js) agree on what "resumable" means. */
function fdCapsuleLeft(capsule){
  var c=capsule||{};
  if(!Array.isArray(c.queueIds)||typeof c.idx!=='number'||c.idx%1!==0||
      c.idx<0||c.idx>c.queueIds.length) return 0;
  return c.queueIds.length-c.idx;
}

function fdResumeCard(capsule, primary){
  var left=fdCapsuleLeft(capsule), isPrimary=primary===true;
  if(left<1) return '';
  var minutes=Math.max(1,Math.round(left*45/60));
  return '<section class="'+(isPrimary?'fd-resume is-primary':'fd-resume')+'">'+
    '<h2 class="fd-sectionhead">'+(isPrimary?'Pick up where you left off':'Continue where you left off')+'</h2>'+
    '<a class="fd-resume__link" href="?tool=question-bank-practice.html&amp;resume=1">'+
      '<span>Resume question bank — '+left+' left, ~'+minutes+' min</span>'+
      '<span>Resume →</span>'+
    '</a></section>';
}

/* "You were reading" -- the last opened item when it is an undone read from this week that is
   not already the Continue target (the shell resolves that through fdTodayLastRead). Tools
   never render here: a tool is not reading, and a live block or a capsule already covers the
   unfinished-practice case. */
function fdLastReadRow(item, primary){
  var it=item||{}, isPrimary=primary===true;
  if(typeof it.ref!=='string'||!it.ref||it.kind!=='read') return '';
  var min=(typeof it.minutes==='number')?(' — '+it.minutes+' min'):'';
  return '<button type="button" class="'+(isPrimary?'fd-lastread is-primary':'fd-lastread')+'" data-fd-open="'+fdEsc(it.ref)+'">'+
    (isPrimary?'<span class="fd-lastread__kicker">Pick up where you left off</span>':'')+
    '<span class="fd-lastread__title">You were reading: '+fdEsc(it.title||it.ref)+fdEsc(min)+'</span>'+
    '<span class="fd-lastread__action">Open →</span>'+
  '</button>';
}
```

- [ ] **Step 4: Run the file plus the other consumers of `fd_due.js`**

Run:
```bash
node --test tests/fd-due.test.mjs tests/resume-card.test.mjs tests/shell-copy.test.mjs tests/fd-shell-boot.test.mjs tests/ward-capture-store.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: `# fail 0`. If `fd-due.test.mjs`'s "stays ES5, audience-neutral" test fails, a comment in the file tripped one of the source scans — reword the comment.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js tests/fd-due.test.mjs
git commit -m "feat(today): due row and resume card take a primary flag; add the last-read row and fdCapsuleLeft

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `fd_block.js` — handoff label prefix, `opts.primary`, empty-state control, hint copy

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js` (lines 134–140 and 159–211)
- Test: `tests/fd-block.test.mjs`

**Interfaces:**
- Produces: `fdBlockHandoffLabel(handoff)` strings all begin `Mark done · `; `fdBlockCard(plan, minutes, block, doneMap, opts)` where `opts.primary===false` swaps `fd-btn--primary` for `fd-btn--accent` on Start and Continue, and the live kicker reads `Your block · N of M done` (the separate count span is then omitted, so the count is spoken once). Empty plan renders `<button type="button" class="fd-btn fd-btn--accent" data-fd-open="question-bank-practice.html">Practice a fresh set</button>`.
- Consumed by Task 5.

- [ ] **Step 1: Extend the harness and write the failing tests**

In `tests/fd-block.test.mjs` line 20, add `fdBlockHandoffLabel` to the returned object:

```js
  return { fdBlockPlan, fdBlockCard, fdBlockRouteForStep, fdBlockStatus, fdBlockBudget, fdBuildIndex, fdItemsForWeek, fdBlockDueTotal, FD_BLOCK_REVIEW_BUCKETS, fdBlockHandoffLabel };
```

Append:

```js
// ---- One Thing First (handoff 2026-09-16 §3b) -----------------------------------------------

test('an empty plan offers a fresh set through the controller, and the old sentence is gone', () => {
  const html = F.fdBlockCard({ steps: [], total: 0, minutes: 5 }, 5, null, {});
  assert.match(html, /<p class="fd-block__empty">Nothing is due and this week is read through\.<\/p>/);
  assert.match(html, /<button type="button" class="fd-btn fd-btn--accent" data-fd-open="question-bank-practice\.html">Practice a fresh set<\/button>/);
  assert.doesNotMatch(html, /Open the question bank for a fresh set/);
  assert.doesNotMatch(html, /data-block-start/);
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

test('the reader’s block handoff label says what the press does first: mark done, then continue', () => {
  assert.equal(F.fdBlockHandoffLabel(null), 'Mark done · Finish block →');
  assert.equal(F.fdBlockHandoffLabel({ next: null }), 'Mark done · Finish block →');
  assert.equal(F.fdBlockHandoffLabel({ next: { kind: 'qb', n: 2 } }), 'Mark done · Continue to your 2 questions →');
  assert.equal(F.fdBlockHandoffLabel({ next: { kind: 'qb', n: 1 } }), 'Mark done · Continue to your 1 question →');
  assert.equal(F.fdBlockHandoffLabel({ next: { kind: 'review', n: 3 } }), 'Mark done · Continue to your 3 reviews →');
  assert.equal(F.fdBlockHandoffLabel({ next: { kind: 'page', title: 'Alpha' } }), 'Mark done · Continue: Alpha →');
});

test('the planner hint says when each step is marked done', () => {
  const plan = F.fdBlockPlan(IDX, state(), 10, { due: due(8), weakest: WEAK });
  const html = F.fdBlockCard(plan, 10, null, {});
  assert.match(html, /<span class="fd-block__hint">Runs as one session\. Each step is marked done as you finish it — the page when you mark it, the questions by the receipt at the end\.<\/span>/);
  assert.doesNotMatch(html, /the receipt at the end marks the page done for you/);
});

test('opts.primary=false demotes the card: accent buttons, and the live kicker carries the count', () => {
  const plan = F.fdBlockPlan(IDX, state(), 10, { due: due(8), weakest: WEAK });
  const planner = F.fdBlockCard(plan, 10, null, {}, { primary: false });
  assert.match(planner, /<button type="button" class="fd-btn fd-btn--accent" data-block-start="10">Start the 10-minute block<\/button>/);
  assert.doesNotMatch(planner, /fd-btn--primary/);
  assert.equal(F.fdBlockCard(plan, 10, null, {}, {}), F.fdBlockCard(plan, 10, null, {}), 'empty opts is primary');
  assert.equal(F.fdBlockCard(plan, 10, null, {}, { primary: true }), F.fdBlockCard(plan, 10, null, {}));

  const block = { minutes: 10, steps: [
    { kind: 'review', title: '3 reviews that are due', min: 2, done: true },
    { kind: 'page', ref: 'a.md', title: 'Alpha', min: 5 },
    { kind: 'qb', title: '4 practice questions', min: 3 },
  ] };
  const live = F.fdBlockCard(null, 10, block, {}, { primary: false });
  assert.match(live, /<span class="fd-block__kicker" id="fdBlockTitle">Your block · 1 of 3 done<\/span><\/div>/,
    'the kicker carries the count and the separate count span is omitted, so it is spoken once');
  assert.doesNotMatch(live, /fd-block__count/);
  assert.match(live, /<button type="button" class="fd-btn fd-btn--accent" data-block-continue="1">Continue: Alpha →<\/button>/);
  assert.doesNotMatch(live, /fd-btn--primary/);
  assert.doesNotMatch(live, AUDIENCE_TOKEN_RE);

  const primaryLive = F.fdBlockCard(null, 10, block, {});
  assert.match(primaryLive, /Your 10-minute block<\/span><span class="fd-block__count">1 of 3 done<\/span>/);
  assert.match(primaryLive, /class="fd-btn fd-btn--primary" data-block-continue="1"/);

  const completeDemoted = F.fdBlockCard(null, 5, { minutes: 5, steps: [{ kind: 'qb', title: 'q', min: 3, done: true }] }, {}, { primary: false });
  assert.match(completeDemoted, /Block complete<\/span><span class="fd-block__count">1 of 1 done<\/span>/,
    'a finished block keeps its count span whichever slot it sits in');
});
```

- [ ] **Step 2: Run and confirm red**

Run:
```bash
node --test tests/fd-block.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: the four new tests fail; the existing ones pass.

- [ ] **Step 3: Edit `fdBlockHandoffLabel` (lines 134–140)**

```js
function fdBlockHandoffLabel(handoff){
  var next=handoff&&handoff.next;
  if(!next) return 'Mark done · Finish block →';
  if(next.kind==='qb') return 'Mark done · Continue to your '+next.n+' question'+(next.n===1?'':'s')+' →';
  if(next.kind==='review') return 'Mark done · Continue to your '+next.n+' review'+(next.n===1?'':'s')+' →';
  return 'Mark done · Continue: '+next.title+' →';
}
```

- [ ] **Step 4: Rewrite `fdBlockCard` (lines 159–211)**

```js
/* opts.primary===false renders the card as a secondary row (it did not win Today's one primary
   slot): the terracotta button becomes the accent one and the live kicker carries the count,
   so the one primary button on Today stays the one that won. Undefined means primary. */
function fdBlockCard(plan, minutes, block, doneMap, opts){
  var budget=fdBlockBudget(minutes), i, o=opts||{}, isPrimary=o.primary!==false;
  var actionCls=isPrimary?'fd-btn fd-btn--primary':'fd-btn fd-btn--accent';
  if(block&&block.steps&&block.steps.length){
    var status=fdBlockStatus(block, doneMap);
    /* The section is named by its kicker, so a screen reader hears "Your 10-minute block" (or
       "Block complete", or, demoted, "Your block · 1 of 3 done"), not the first step's title.
       Each step's done state is spoken through a visually-hidden prefix — the check glyph is
       decoration and the strike-through is CSS. */
    var kicker=status.complete?'Block complete':(isPrimary?('Your '+fdEsc(block.minutes)+'-minute block'):('Your block · '+status.done+' of '+status.total+' done'));
    var showCount=isPrimary||status.complete;
    var out='<section class="fd-block is-live" aria-labelledby="fdBlockTitle">';
    out+='<div class="fd-block__head"><span class="fd-block__kicker" id="fdBlockTitle">'+kicker+'</span>'+
      (showCount?'<span class="fd-block__count">'+status.done+' of '+status.total+' done</span>':'')+'</div>';
    out+='<div class="fd-block__steps">';
    for(i=0;i<status.steps.length;i++){
      var row=status.steps[i], s=row.step;
      out+='<div class="fd-block__step'+(row.done?' is-done':'')+'">'+
        '<span class="fd-block__check" aria-hidden="true">✓</span>'+
        '<span class="fd-block__title"><span class="fd-visually-hidden">'+(row.done?'Done: ':'Not yet: ')+'</span>'+fdEsc(s.title)+'</span>'+
        '<span class="fd-block__min">~'+fdEsc(s.min)+' min</span></div>';
    }
    out+='</div><div class="fd-block__actions">';
    if(status.next){
      out+='<button type="button" class="'+actionCls+'" data-block-continue="1">Continue: '+fdEsc(status.next.title)+' →</button>';
    }else{
      out+='<span class="fd-block__doneline">'+(status.total===1?'The one step is done.':'All '+status.total+' steps done.')+' Tomorrow’s block will be built from tomorrow’s dues.</span>';
    }
    out+='<button type="button" class="fd-btn fd-btn--ghost" data-block-end="1">'+(status.next?'End block':'Clear')+'</button>';
    out+='</div></section>';
    return out;
  }
  var p=plan||{steps:[],total:0,minutes:budget};
  var h='<section class="fd-block" aria-labelledby="fdBlockTitle">';
  h+='<div class="fd-block__head"><span class="fd-block__kicker" id="fdBlockTitle">I have…</span>';
  h+='<div class="fd-block__chips" role="group" aria-label="Minutes available">';
  for(i=0;i<FD_BLOCK_MINUTES.length;i++){
    var m=FD_BLOCK_MINUTES[i];
    h+='<button type="button" class="fd-block__chip'+(m===budget?' is-sel':'')+'" data-block-minutes="'+m+'" aria-pressed="'+(m===budget?'true':'false')+'">'+m+' min</button>';
  }
  h+='</div><span class="fd-block__hint">Between rounds? Today packs the window from what is due and what is next.</span></div>';
  if(!p.steps.length){
    /* The fresh-set control is an ordinary routed open, not a block action, so it lives in the
       controller's data-fd-* namespace on purpose; the block's own clicks stay data-block-*. */
    h+='<p class="fd-block__empty">Nothing is due and this week is read through.</p>';
    h+='<div class="fd-block__actions"><button type="button" class="fd-btn fd-btn--accent" data-fd-open="question-bank-practice.html">Practice a fresh set</button></div>';
  }else{
    h+='<div class="fd-block__steps">';
    for(i=0;i<p.steps.length;i++){
      var step=p.steps[i];
      h+='<div class="fd-block__step">'+fdBlockDot(step.kind)+'<span class="fd-block__title">'+fdEsc(step.title)+'</span><span class="fd-block__min">~'+fdEsc(step.min)+' min</span></div>';
    }
    h+='</div><div class="fd-block__actions">';
    h+='<button type="button" class="'+actionCls+'" data-block-start="'+budget+'">Start the '+budget+'-minute block</button>';
    h+='<span class="fd-block__hint">Runs as one session. Each step is marked done as you finish it — the page when you mark it, the questions by the receipt at the end.</span>';
    h+='</div>';
  }
  h+='</section>';
  return h;
}
```

- [ ] **Step 5: Run the file and the reader/wire consumers**

Run:
```bash
node --test tests/fd-block.test.mjs tests/fd-reader.test.mjs tests/fd-wire.test.mjs tests/block-wiring.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: `# fail 0`. `fd-reader.test.mjs:159/172` count substrings and stay green with the prefix.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js tests/fd-block.test.mjs
git commit -m "feat(block): card takes opts.primary; empty plan offers a fresh set; handoff label leads with 'Mark done'

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `fdTodayLive` composes one primary + "Also today"

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` lines 2069–2082 (`function fdTodayLive`)
- Modify: `tests/resume-card.test.mjs` line 38
- Test: `tests/block-wiring.test.mjs`

**Interfaces:**
- Consumes: `fdTodayPrimary`, `fdTodayLastRead`, `fdTodayWhy`, `FD_TODAY_LEAD_END` (Task 1); `fdToday` honouring `state.primaryKind` (Task 2); `fdCapsuleLeft`, `fdDueRow(b,primary)`, `fdResumeCard(c,primary)`, `fdLastReadRow(item,primary)` (Task 3); `fdBlockCard(...,opts)` (Task 4); existing shell helpers `fdLiveState`, `sessLoad`, `dueBreakdown`, `blockLoad`, `fdBlockStatus`, `fdBlockPlan`, `fdBlockInputs`, `fdBlockMinutes`, `fdCaptureRows`, `fdCaptureTriage`, `fdDueCount`, `LS`, `fdItemsForWeek`, `fdFindWeek`, `fdProgressForWeek`, `fdTodayProgress`, `facultyPreviewRequest`.
- Produces: the Today DOM order. Device-store primary: `.fd-today__main > .fd-primary > [card]`, then `p.fd-primary__why`, `h2.fd-sectionhead.fd-also`, demoted rows in the order block › due › resume › last-read › capture, then the demoted `.fd-continue.is-secondary` and the week list. Lead-card primary (`week|ahead|setup`): `.fd-continue`/`.fd-setupcta` first, then `p.fd-primary__why`, the heading, the rows, then the week list.

- [ ] **Step 1: Write the failing source pins**

Append to `tests/block-wiring.test.mjs`:

```js
test('the shell picks exactly one primary, names the secondary heading once, and splices at the lead marker', () => {
  const today = shell.slice(shell.indexOf('function fdTodayLive('), shell.indexOf('function fdRenderCapture('));
  assert.equal(today.split('fdTodayPrimary(').length - 1, 1, 'one picker call');
  assert.equal(today.split('Also today').length - 1, 1, 'one heading');
  assert.match(today, /live\.primaryKind=primary\.kind;/, 'the pure renderer is told who won before it renders');
  assert.match(today, /fdBlockCard\([^;]*\{primary:primary\.kind==='block'\}\)/, 'the block card is primary only when it won');
  assert.match(today, /fdDueRow\(due,primary\.kind==='due'\)/);
  assert.match(today, /fdResumeCard\(sess,primary\.kind==='resume'\)/);
  assert.match(today, /fdLastReadRow\(lastRead,primary\.kind==='read'\)/);
  assert.match(today, /'<div class="fd-primary">'/);
  assert.match(today, /FD_TODAY_LEAD_END/, 'the marker fd_today.js emits is the splice point');
  assert.match(today, /fdTodayWhy\(\)/);
});
```

In `tests/resume-card.test.mjs` line 38, change

```js
  assert.match(shell, /fdResumeCard\(sess\)/);
```
to
```js
  assert.match(shell, /fdResumeCard\(sess,/);
```

- [ ] **Step 2: Run and confirm red**

Run:
```bash
node --test tests/block-wiring.test.mjs tests/resume-card.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: the new block-wiring test and the edited resume-card test fail; line 50's test still passes.

- [ ] **Step 3: Replace `fdTodayLive`**

Replace lines 2069–2082 of `spa_index.html` (from `function fdTodayLive(state){` through its closing `}`) with:

```js
  function fdTodayLive(state){
    var live=fdLiveState(state), sess=null;
    try{ sess=(typeof sessLoad==='function')?sessLoad('qbank'):null; }catch(_){ sess=null; }
    var due=dueBreakdown();
    var weekN=(typeof live.week==='number'&&!isNaN(live.week))?live.week:null;
    var wItems=weekN===null?[]:fdItemsForWeek(FD_INDEX,weekN);
    var hasWeek=weekN!==null&&!!fdFindWeek(FD_INDEX,weekN);
    var weekDone=fdProgressForWeek(FD_INDEX,live,live.week);
    var progress=fdTodayProgress(wItems,weekDone);
    var lastRead=fdTodayLastRead(LS('cw_last'),wItems,progress,weekDone);
    /* The timed block sits with the other device-store rows. In a faculty preview there is no
       learner session to plan for, so the card is omitted with the capture launcher. */
    var liveBlock=null, blockStatus=null, blockHtml='', captureHtml='';
    if(!facultyPreviewRequest){
      var liveForBlock=live;
      liveBlock=blockLoad(liveForBlock.nowMs);
      blockStatus=liveBlock?fdBlockStatus(liveBlock,liveForBlock.done):null;
    }
    /* One Thing First: exactly one primary action, chosen by the pure picker in fd_today.js
       from inputs this function already had. The pure renderer is told who won so it can demote
       its own Continue card; the rows that did not win render below the secondary heading in a
       fixed order, then the week list, daily pick, progress card and quick tools as before. */
    var primary=fdTodayPrimary({
      capsuleLeft:fdCapsuleLeft(sess),
      blockNext:blockStatus?blockStatus.next:null,
      dueTotal:fdDueCount(due),
      weekProgress:progress,
      hasWeek:hasWeek,
      lastRead:lastRead
    });
    live.primaryKind=primary.kind;
    var html=fdToday(FD_INDEX,live);
    if(!facultyPreviewRequest){
      blockHtml=fdBlockCard(liveBlock?null:fdBlockPlan(FD_INDEX,liveForBlock,fdBlockMinutes,fdBlockInputs()),fdBlockMinutes,liveBlock,liveForBlock.done,{primary:primary.kind==='block'});
      captureHtml=fdCaptureTriage(fdCaptureRows());
    }
    var cards={
      block:blockHtml,
      due:fdDueRow(due,primary.kind==='due'),
      resume:fdResumeCard(sess,primary.kind==='resume'),
      read:fdLastReadRow(lastRead,primary.kind==='read')
    };
    var order=['block','due','resume','read'], lead='', also='';
    for(var i=0;i<order.length;i++){
      if(order[i]===primary.kind) lead='<div class="fd-primary">'+cards[order[i]]+'</div>';
      else also+=cards[order[i]];
    }
    also+=captureHtml;
    var rest=fdTodayWhy()+'<h2 class="fd-sectionhead fd-also">Also today</h2>'+also;
    if(lead) return html.replace(FD_TODAY_LEAD_END,'').replace('<div class="fd-today__main">','<div class="fd-today__main">'+lead+rest);
    return html.replace(FD_TODAY_LEAD_END,rest);
  }
```

Notes for the implementer:
- `var liveForBlock=live;` keeps the pinned statement shape (`if(!facultyPreviewRequest){` + whitespace + `var liveForBlock`) while dropping the second `fdLiveState` call the old code made.
- Do not write the literal `fdTodayPrimary(` or `Also today` anywhere else in this function (the source pin counts them). The comments above are worded to avoid both.
- Keep `fdRenderCapture` and `fdProgressMarkup` where they are, directly after this function.

- [ ] **Step 4: Run the full node suite**

Run:
```bash
node --test tests/*.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: `# fail 0`. Pins that watch this slice and must be green: `block-wiring` (both tests), `ward-capture-store` ("the capture mounts are removed entirely in a faculty preview"), `resume-card`, `fd-shell-boot`.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/block-wiring.test.mjs tests/resume-card.test.mjs
git commit -m "feat(today): the shell composes one primary and an 'Also today' section around the picker

resume-card.test.mjs:38 pin widened from fdResumeCard(sess) to fdResumeCard(sess, —
the card still composes the capsule row; it now also learns whether it won.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Styling (tokens only) and the class inventory

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css` lines 796, 801, 803 (add `.fd-lastread` to the shared runtime-row selector lists) and append a block at the end of the file
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` line 6 and §3 Today / State-class reference
- Test: `tests/fd-tokens.test.mjs` (existing; the selector-count pin drives the doc edit), `tests/fd-contrast.test.mjs`, `tests/fd-shell-boot.test.mjs`, `bin/check_design_drift.py`

- [ ] **Step 1: Run the drift gate before touching CSS, to know the baseline is green**

Run:
```bash
python3 bin/check_design_drift.py 2>&1 | tail -5
```
Expected: exit 0, no `R  frontdoor.css:` failure lines.

- [ ] **Step 2: Edit the three shared selector lists in place**

Line 796: `.fd-due,.fd-resume__link,.fd-progresscard{` → `.fd-due,.fd-resume__link,.fd-progresscard,.fd-lastread{`
Line 801: `.fd-due,.fd-progresscard{cursor:pointer}` → `.fd-due,.fd-progresscard,.fd-lastread{cursor:pointer}`
Line 803: `.fd-due:hover,.fd-resume__link:hover,.fd-progresscard:hover{` → `.fd-due:hover,.fd-resume__link:hover,.fd-progresscard:hover,.fd-lastread:hover{`

- [ ] **Step 3: Append the One Thing First block at the very end of `frontdoor.css`**

```css

/* ---- One Thing First (2026-09-16): one primary slot, demoted rows under "Also today" ----------
 * Appended after every base rule on purpose: tests/fd-tokens resolves a selector by FIRST textual
 * match, so an override placed above the rule it overrides would be read as the base.
 * Dimension properties (font-size / border-radius / gap / padding / margin) use the token layer
 * only — bin/check_design_drift.py ratchets the raw count and it may not rise. */
.fd-primary{margin:0 0 var(--fd-space-6)}
.fd-primary .fd-due,.fd-primary .fd-lastread,.fd-primary .fd-block,.fd-primary .fd-resume__link{border-top:3px solid var(--fd-terracotta);box-shadow:var(--fd-shadow-card)}
.fd-primary .fd-due,.fd-primary .fd-lastread,.fd-primary .fd-block,.fd-primary .fd-resume{margin:0}
.fd-primary .fd-resume .fd-sectionhead{color:var(--fd-terracotta-dark)}
.fd-due.is-primary,.fd-lastread.is-primary{flex-wrap:wrap}
.fd-due__kicker,.fd-lastread__kicker{flex-basis:100%;font-size:var(--fd-font-2xs);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--fd-terracotta-dark)}
.fd-lastread{margin:0 0 var(--fd-space-6)}
.fd-lastread__title{font-size:var(--fd-font-md);font-weight:700;min-width:0}
.fd-lastread__action{margin-left:auto;font-size:var(--fd-font-sm);font-weight:700;color:var(--fd-teal-deep);white-space:nowrap}
.fd-primary__why{margin:0 0 var(--fd-space-8);font-size:var(--fd-font-sm);line-height:1.5;color:var(--fd-text-mid)}
.fd-also{margin:var(--fd-space-8) 0 var(--fd-space-5)}
.fd-continue.is-secondary{background:var(--fd-surface);border-top:1px solid var(--fd-line);box-shadow:var(--fd-shadow-sm)}
.fd-continue.is-secondary .fd-continue__kicker{color:var(--fd-text-dim)}
.fd-continue__title .fd-chip{margin-left:var(--fd-space-4);vertical-align:middle}
.fd-freshset{margin:0 0 var(--fd-space-9)}
@media (max-width:640px){
  .fd-due,.fd-resume__link,.fd-lastread,.fd-freshset{min-height:44px}
}
```

- [ ] **Step 4: Run the CSS gates and read the new selector count**

Run:
```bash
python3 bin/check_design_drift.py 2>&1 | tail -8
node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs tests/fd-shell-boot.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)|expected|actual" | head
node -e "const fs=require('fs');const css=fs.readFileSync('13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');console.log('fd-* selector names:',new Set([...css.matchAll(/\.((?:fd-[A-Za-z0-9_-]+))/g)].map(m=>m[1])).size);console.log('is-* classes:',new Set([...css.matchAll(/\.(is-[A-Za-z0-9_-]+)/g)].map(m=>m[1])).size)"
```
Expected: drift gate exit 0 with no `rose` lines (if `raw_dimension_declarations rose`, a new declaration used a raw value — replace it with a token); `fd-contrast` green (no new ink/surface pair was introduced); `fd-shell-boot` green; `fd-tokens` **red on exactly one test** — "the class inventory documents the exact distinct front-door selector count" — reporting the new count. The node one-liner prints the numbers to put in the doc (expected 286 `fd-*` names = 277 + `fd-primary`, `fd-primary__why`, `fd-also`, `fd-freshset`, `fd-lastread`, `fd-lastread__kicker`, `fd-lastread__title`, `fd-lastread__action`, `fd-due__kicker`; and 22 `is-*` = 20 + `is-primary`, `is-secondary`). **The printed numbers win over these expectations.**

- [ ] **Step 5: Update `CLASS-INVENTORY.md`**

Line 6: replace `(277 distinct \`fd-*\` selector names, 20 \`is-*\` state classes)` with the printed numbers.

Under `## 3. Today`, after the `.fd-block` row (line 221), add these table rows:

```markdown
| `.fd-primary` | Wrapper the shell puts around the ONE device-store row that won Today's primary slot (`fdTodayPrimary`, `frontdoor/fd_today.js`; composed by `fdTodayLive`). Gives the card inside a terracotta top bar and the card shadow. Absent when the lead card (`.fd-continue` / `.fd-setupcta`) is itself the primary — that card then carries no `.is-secondary`. |
| `.fd-primary__why` | One-paragraph explanation of the rule, directly under the primary. Rendered by `fdTodayWhy`. |
| `.fd-also` | Modifier on the `.fd-sectionhead` `<h2>` that reads "Also today"; everything that did not win renders below it in a fixed order (block › due › resume › last-read › capture), then the week list. |
| `.fd-lastread` | "You were reading" row (`fdLastReadRow`, `frontdoor/fd_due.js`): the last opened item when it is an undone read from this week and not already the Continue target. Shares the runtime-row rule with `.fd-due`. Contains `.fd-lastread__kicker` (primary only), `.fd-lastread__title`, `.fd-lastread__action`. |
| `.fd-due__kicker` | "Clear what's due" line, present only when the due row is the primary (`.fd-due.is-primary`). |
| `.fd-freshset` | Ghost `.fd-btn` sibling of a completed-week `.fd-continue` that is primary: "Practice a fresh set →", opens the question bank. |
```

Under `## State-class reference`, add:

```markdown
| `.is-primary` | `.fd-due`, `.fd-resume`, `.fd-lastread` | this row is Today's primary action (kicker copy changes; the visual treatment comes from the `.fd-primary` wrapper) |
| `.is-secondary` | `.fd-continue` | a device-store row won the primary slot; the Continue card drops its gradient and top accent |
```

- [ ] **Step 6: Re-run the three CSS-adjacent tests**

Run:
```bash
node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs tests/fd-shell-boot.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md
git commit -m "style(today): primary slot, demoted Continue, last-read row, 'Also today' heading — tokens only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Local gates — node suite, verify.sh, both builds

**Files:** none modified (unless a gate is red).

- [ ] **Step 1: Node suite**

Run:
```bash
node --test tests/*.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 2: The full local gate, backgrounded to a log**

Run:
```bash
mkdir -p /private/tmp/claude-501/otf && bash bin/verify.sh > /private/tmp/claude-501/otf/verify.log 2>&1; echo "exit=$?" >> /private/tmp/claude-501/otf/verify.log
```
then
```bash
grep -E "FAIL|exit=|PASS.*(design|drift|front door|coverage|vacuity)" /private/tmp/claude-501/otf/verify.log | tail -20
```
Expected: `exit=0`, zero `FAIL` lines. Read the `design system drift`, `unit — front door catalog` and `gate coverage vs ci.yml` lines specifically. A red gate here with CI green later is usually bash 3.2 — see AGENTS.md; never `--no-verify`.

- [ ] **Step 3: Build both sites through the publish gate**

Run:
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 2>&1 | tail -6
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res 2>&1 | tail -6
```
Expected: both end in the gate's success line; `_build/ms3/index.html` and `_build/res/index.html` contain `fd-primary__why` once each:
```bash
grep -c 'fd-primary__why' _build/ms3/index.html _build/res/index.html
```
Expected: `1` for each (the string literal inside the injected `fd_today.js`).

- [ ] **Step 4: Nothing to commit unless a gate forced a fix; if it did, commit that fix on its own with a message naming the gate.**

---

### Task 8: Smoke — A-series, D-series, E-series in `tests/smoke/front-door.spec.js`

**Files:**
- Modify: `tests/smoke/front-door.spec.js` (append)
- Uses existing helpers in that file: `FROZEN_NOW`, `PHONE`, `audience(testInfo)`, `seedApp(page, testInfo, {state, storage})`, `expectHealthy(page)`, `freezeTime(page)`.

B- and C-series are Phases 2 and 3 — **do not add them here**.

- [ ] **Step 1: Append the checks**

```js
// ---- One Thing First (2026-09-16): exactly one primary action on Today ----------------------
//
// Seeds go through seedApp's `storage` so every store exists before the shell boots. Time is
// frozen at FROZEN_NOW: a block created an hour earlier is live (12 h TTL) and an SRS card due
// an hour earlier counts as due. deck# ids land in the daily bucket and are not TOPIC# cards, so
// srsDropPhantomTopics leaves them alone once topic_meta loads. Both audience projects run every
// test here with the same seed, which is A4 (same primary kind for the same seed) by construction.
const OTF_NOW = FROZEN_NOW.getTime();
const OTF_HOUR = 60 * 60 * 1000;
const OTF = {
  capsule: { v: 1, sessions: { qbank: { expiresAt: OTF_NOW + 24 * OTF_HOUR, queueIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], idx: 2 } } },
  block: { v: 1, minutes: 10, createdAt: OTF_NOW - OTF_HOUR, steps: [
    { kind: 'review', ref: 'review.html', title: '2 reviews that are due', min: 1, n: 2, done: true },
    { kind: 'qb', ref: 'question-bank-practice.html', title: '4 practice questions', min: 3, n: 4, cat: null },
  ] },
  srs: { v: 1, cards: {
    'deck#otf-1': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: OTF_NOW - OTF_HOUR, last: OTF_NOW - 25 * OTF_HOUR },
    'deck#otf-2': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: OTF_NOW - OTF_HOUR, last: OTF_NOW - 25 * OTF_HOUR },
  }, day: { lastDay: '', newToday: 0 }, stats: { streak: 0, lastStudy: '', totalReviews: 0, correct: 0, seen: 0 }, settings: { newPerDay: 12 } },
  capture: { v: 1, items: [{ id: 'otf-c1', text: 'Why hold the lithium tonight?', at: OTF_NOW - 10 * 60 * 1000, ctx: null, triaged: false }] },
};
const OTF_WHY = 'First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.';
// The primary: a wrapped device-store row, or the lead card itself when nothing outranked it.
const OTF_PRIMARY = '.fd-primary, .fd-continue:not(.is-secondary), .fd-setupcta';
// Its control: the first focusable inside the wrapper, or the lead card (a button).
const OTF_PRIMARY_CONTROL = '.fd-primary button, .fd-primary a, .fd-continue:not(.is-secondary), .fd-setupcta';

async function otfExpectOnePrimary(page) {
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  await expect(page.locator('.fd-primary__why')).toHaveText(OTF_WHY);
  await expect(page.locator('h2.fd-also')).toHaveCount(1);
  await expect(page.locator('h2.fd-also')).toHaveText('Also today');
}

// D1: the first focusable inside the main column IS the primary's control.
async function otfExpectPrimaryIsFirstFocusable(page) {
  const firstIsPrimary = await page.evaluate((sel) => {
    const main = document.querySelector('.fd-today__main');
    const first = main.querySelector('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
    return first === main.querySelector(sel);
  }, OTF_PRIMARY_CONTROL);
  expect(firstIsPrimary).toBe(true);
}

// A6 + D2 + D3: clicking the primary writes nothing to cw_progress_v1; Enter routes the same way;
// after Back the focus is on the primary's control or Today's h1, never <body>.
async function otfExerciseVisitAndBack(page) {
  const before = await page.evaluate(() => localStorage.getItem('cw_progress_v1'));
  const control = page.locator(OTF_PRIMARY_CONTROL).first();
  await control.click();
  await expect(page).not.toHaveURL(/\/$/);
  const viaClick = new URL(page.url()).search;
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  const focused = await page.evaluate((sel) => {
    const el = document.activeElement;
    return { tag: el.tagName, isPrimary: el === document.querySelector(sel), isH1: el.matches('h1.fd-today__h1') };
  }, OTF_PRIMARY_CONTROL);
  expect(focused.tag).not.toBe('BODY');
  expect(focused.isPrimary || focused.isH1).toBe(true);
  await page.locator(OTF_PRIMARY_CONTROL).first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(viaClick.replace(/[.?+*()[\]]/g, '\\$&') + '$'));
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
}

test('One Thing First A1: everything pending — exactly one primary, and it is Resume', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_sess_v1: OTF.capsule, cw_block_v1: OTF.block, cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-resume.is-primary .fd-sectionhead')).toHaveText('Pick up where you left off');
  await expect(page.locator('.fd-primary .fd-resume__link')).toContainText('Resume question bank — 4 left');
  // A3 (presence + order): every demoted card is still there, below the heading, in the fixed order.
  const order = await page.evaluate(() => [...document.querySelector('.fd-today__main')
    .querySelectorAll('.fd-primary, .fd-also, .fd-block, .fd-due, .fd-resume, .fd-lastread, .fd-capture, .fd-continue, .fd-listhead')]
    .map(el => el.className.split(' ')[0]));
  expect(order).toEqual(['fd-primary', 'fd-resume', 'fd-also', 'fd-block', 'fd-due', 'fd-capture', 'fd-continue', 'fd-listhead']);
  await expect(page.locator('.fd-continue')).toHaveClass(/is-secondary/);
  await expect(page.locator('.fd-block.is-live .fd-block__kicker')).toHaveText('Your block · 1 of 2 done');
  await expect(page.locator('.fd-block.is-live [data-block-continue]')).toHaveClass(/fd-btn--accent/);
  await expect(page.locator('.fd-due:not(.is-primary)')).toHaveCount(1);
  await otfExpectPrimaryIsFirstFocusable(page);
  // A3 (behaviour): a demoted row still routes as before.
  await page.locator('.fd-due').click();
  await expect(page).toHaveURL(/tool=review\.html/);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First A2: remove the capsule and the live block wins', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_block_v1: OTF.block, cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-block.is-live .fd-block__kicker')).toHaveText('Your 10-minute block');
  await expect(page.locator('.fd-primary [data-block-continue]')).toHaveClass(/fd-btn--primary/);
  await expect(page.locator('.fd-resume')).toHaveCount(0);
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expect(page.locator('.fd-primary .fd-block.is-live')).toHaveCount(1);
  await expectHealthy(page);
});

test('One Thing First A2: remove the block and the dues win', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-due.is-primary .fd-due__kicker')).toHaveText('Clear what’s due');
  await expect(page.locator('.fd-primary .fd-due__label')).toHaveText('2 reviews due');
  await expect(page.locator('.fd-block:not(.is-live)')).toHaveCount(1, 'the planner face is demoted');
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First A2: clear the dues and Continue leads, with the rows below it', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary')).toHaveCount(0);
  await expect(page.locator('.fd-continue:not(.is-secondary)')).toHaveCount(1);
  const order = await page.evaluate(() => [...document.querySelectorAll('.fd-today__main > *')].slice(0, 5).map(el => el.className.split(' ')[0]));
  expect(order).toEqual(['fd-continue', 'fd-primary__why', 'fd-sectionhead', 'fd-block', 'fd-capture']);
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First A2: a completed week looks ahead and offers a fresh set', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: {} });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  const refs = await page.locator('.fd-list [data-fd-toggle]').evaluateAll(els => els.map(el => el.getAttribute('data-fd-toggle')));
  expect(refs.length).toBeGreaterThan(0);
  await page.evaluate((list) => {
    sessionStorage.setItem('__fd_test_preserve_seed', '1');
    const progress = {};
    for (const ref of list) progress[ref] = { done: true, at: '2026-08-17' };
    localStorage.setItem('cw_progress_v1', JSON.stringify(progress));
  }, refs);
  await page.reload();
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-continue:not(.is-secondary) .fd-continue__title')).toHaveText(/^Preview Week \d+ →$/);
  await expect(page.locator('.fd-freshset[data-fd-open="question-bank-practice.html"]')).toHaveCount(1);
  await otfExpectPrimaryIsFirstFocusable(page);
  const before = await page.evaluate(() => localStorage.getItem('cw_progress_v1'));
  await page.locator('.fd-freshset').click();
  await expect(page).toHaveURL(/tool=question-bank-practice\.html/);
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before);
  await page.goBack();
  await expect(page.locator('.fd-continue:not(.is-secondary)')).toHaveCount(1);
  await expectHealthy(page);
});

test('One Thing First A2: no rotation week — the setup CTA leads', async ({ page }, testInfo) => {
  const role = audience(testInfo).role;
  await freezeTime(page);
  await page.addInitScript((browseRole) => {
    if (sessionStorage.getItem('__fd_test_preserve_seed') === '1') return;
    localStorage.removeItem('cw_rotation_start');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ screen: 'app', role: browseRole, tab: 'today', viewWeek: 1, browsing: true }));
  }, role);
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-setupcta')).toHaveCount(1);
  await expect(page.locator('.fd-primary, .fd-continue')).toHaveCount(0);
  await otfExpectPrimaryIsFirstFocusable(page);
  await expectHealthy(page);
});

test('One Thing First A2: cw_last names an undone week read that is not the Continue target — "You were reading" leads', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: {} });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  const candidate = await page.evaluate(() => {
    const target = document.querySelector('.fd-continue[data-fd-open]')?.getAttribute('data-fd-open');
    const rows = [...document.querySelectorAll('.fd-list .fd-row')];
    for (const row of rows) {
      const ref = row.querySelector('.fd-row__open')?.getAttribute('data-fd-open');
      const chip = row.querySelector('.fd-chip')?.textContent;
      const done = row.querySelector('.fd-check')?.classList.contains('is-done');
      if (ref && ref !== target && chip === 'read' && !done) return ref;
    }
    return null;
  });
  test.skip(!candidate, 'this audience’s week 1 has only one undone read, so the row can never lead here');
  await page.evaluate((ref) => {
    sessionStorage.setItem('__fd_test_preserve_seed', '1');
    localStorage.setItem('cw_last', ref);
  }, candidate);
  await page.reload();
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-lastread.is-primary')).toHaveAttribute('data-fd-open', candidate);
  await expect(page.locator('.fd-primary .fd-lastread__kicker')).toHaveText('Pick up where you left off');
  await expect(page.locator('.fd-primary .fd-lastread__title')).toHaveText(/^You were reading: /);
  await expect(page.locator('.fd-continue')).toHaveClass(/is-secondary/);
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First D2: the Today shortcuts are unchanged with a primary present', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_srs_v1: OTF.srs } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await page.keyboard.press('2');
  await expect(page.locator('[data-fd-tab="path"]')).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('1');
  await expect(page.locator('[data-fd-tab="today"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  await page.keyboard.press('/');
  await expect(page.locator('.fd-search input, .fd-search [role="combobox"]').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expectHealthy(page);
});

test('One Thing First E: 390x844, reduced motion — the primary is above the fold, no overflow, 44px controls', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedApp(page, testInfo, { storage: { cw_sess_v1: OTF.capsule, cw_block_v1: OTF.block, cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  const geometry = await page.evaluate((sel) => {
    const lead = document.querySelector(sel).getBoundingClientRect();
    const measure = (q) => [...document.querySelectorAll(q)].map(el => ({ q, h: Math.round(el.getBoundingClientRect().height), text: el.textContent.trim().slice(0, 30) }));
    return {
      bottom: lead.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      newControls: measure('.fd-primary button, .fd-primary a, .fd-due, .fd-resume__link, .fd-lastread, .fd-block button, .fd-freshset'),
      captureControls: measure('.fd-capture button'),
    };
  }, OTF_PRIMARY);
  expect(geometry.bottom).toBeLessThanOrEqual(844);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  for (const c of geometry.newControls) expect(c.h, `${c.q} "${c.text}"`).toBeGreaterThanOrEqual(44);
  // The capture triage predates this work. It is measured here for the first time; a miss is a
  // pre-existing finding to report in the PR, not something to fix in this change.
  for (const c of geometry.captureControls) expect.soft(c.h, `capture control "${c.text}" (pre-existing surface)`).toBeGreaterThanOrEqual(44);
  await expectHealthy(page);
});
```

Implementer notes:
- The `/` shortcut assertion in D2 assumes the search overlay's input is focusable under `.fd-search`; if the existing test "command-K and slash search restore focus on dismissal" (line 211) uses a different locator, copy that locator instead of guessing.
- In `otfExerciseVisitAndBack`, D3 (focus after Back) is measured for the first time. If it fails with `BODY`, that is a real finding: record it in the PR body under Known unknowns with the observed `activeElement`, and downgrade only that one assertion to `expect.soft` with a comment naming the finding — do not delete it.

- [ ] **Step 2: Build both sites (Task 7 already did; rebuild only if source changed since) and run the new checks locally per audience**

Run:
```bash
cd tests/smoke && npm ci >/dev/null 2>&1; bash run-local-playwright.sh front-door.spec.js --project=nav-ms3 --project=nav-res -g "One Thing First" 2>&1 | tail -40
```
Expected: every "One Thing First" test passes on both projects (the `cw_last` test may `skip` on an audience whose week 1 has a single undone read — a skip with that reason is acceptable; a failure is not).

- [ ] **Step 3: Run the whole front-door spec, both audiences, to prove nothing pre-existing regressed**

Run:
```bash
cd tests/smoke && bash run-local-playwright.sh front-door.spec.js frontdoor-runtime.spec.js --project=nav-ms3 --project=nav-res 2>&1 | tail -15
```
Expected: all green. `frontdoor-runtime.spec.js:516` locates `.fd-continue` and asserts document order against the edition card — still satisfied (the class is present whether or not `is-secondary` is).

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/front-door.spec.js
git commit -m "test(smoke): One Thing First A/D/E acceptance checks, both audiences

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Push and open the PR

- [ ] **Step 1: Push (the pre-push hook runs `bin/verify.sh` — it must pass on its own)**

```bash
git push -u origin claude/today-priority-rule-p1
```

- [ ] **Step 2: Open the PR with this body (fill the bracketed numbers from your runs)**

```bash
gh pr create --base main --title "feat(today): One Thing First — one primary action, the rest under \"Also today\" (Phase 1)" --body "$(cat <<'EOF'
## The rule

Today now shows exactly one primary action. `fdTodayPrimary` (pure, in `frontdoor/fd_today.js`) picks the first true row, top-down: **pick up where you left off** (a question-bank capsule with questions left › a live timed block with a next step › the last opened resource when it is an undone read from this week and not already the Continue target) › **clear what's due** › **continue the week** › **look ahead** when the week is complete (plus "Practice a fresh set →") › **set your rotation week**. Everything that did not win stays, under an "Also today" heading, in a fixed order (block › due › resume › last-read › capture), then the week list, daily pick, progress card and quick tools exactly as before. Under the primary: *"First things first: anything you left unfinished, then reviews due, then this week. The rest is just below."*

## Assumption A1

"Unfinished" outranks "reviews due." Josh approved the preview built on this ordering but has not answered the question directly. The order is a single array (`FD_TODAY_PRIMARY_ORDER`); reversing it is a swap of two entries plus the expected column of the picker table in `tests/fd-today.test.mjs`.

## Invariants kept

- `fd_today.js` stays pure (no DOM, storage or clock; pinned by `tests/fd-today.test.mjs:386`). The shell derives every picker input from stores it already read.
- No localStorage key added. `cw_progress_v1` is written only by `data-fd-toggle` and the session receipt — the A6 smoke checks click every primary and assert the store is byte-identical.
- `frontdoor/*.js` stays ES5; every new string passes the audience-token scan; CSS is tokens only and the design-drift ratchet did not move.
- `tests/block-wiring.test.mjs:50` satisfied, not rewritten. One pin widened: `tests/resume-card.test.mjs:38` (`fdResumeCard(sess)` → `fdResumeCard(sess,`), because the card now learns whether it won.

## Tests added

- `tests/fd-today.test.mjs`: picker order + table (5 rules, ties, fall-throughs), `fdTodayLastRead`, `fdTodayWhy`, `fdContinue` primary/secondary byte-parity, kind chip incl. rights → "reference", fresh-set sibling, `fdToday` honours `primaryKind`, lead-end marker position, both path ids, copy scan.
- `tests/fd-due.test.mjs`: `fdCapsuleLeft`, primary variants of the due row and resume card (default markup byte-identical), `fdLastReadRow` (escaping, never for a tool), copy scan.
- `tests/fd-block.test.mjs`: empty-plan fresh-set control, `fdBlockHandoffLabel` prefix, hint copy, `opts.primary=false` (accent buttons, kicker carries the count).
- `tests/block-wiring.test.mjs`: one picker call, one heading, the four rows receive the winner, the marker is the splice point.
- `tests/smoke/front-door.spec.js`: A1, A2 (six states), A3, A6, D1, D2, D3, E1–E3, both audiences.

## Gates run locally

`node --test tests/*.test.mjs` [N pass / 0 fail] · `bin/verify.sh` exit 0 · `build_and_check.sh ms3` + `res` green · `check_design_drift.py` green · Playwright `front-door.spec.js` + `frontdoor-runtime.spec.js` on nav-ms3 and nav-res green.

## Expected red

The two Today visual baselines (`front-door-today-desktop.png`, `front-door-today-mobile.png`) will fail — the page changed on purpose. **Visual baselines are to be refreshed via the "Refresh visual baselines" workflow_dispatch after approval**, not in this PR.

## Known unknowns (handoff §9)

- Tab-stop counts and above-the-fold claims were DOM-order inferences until now; D1/D3/E1 measure them for the first time. [Report anything D3 or E3 surfaced here, with numbers.]
- Line anchors in the handoff were from `3cdec90`; `origin/main` was `41184a4` at branch time and none of the seven intervening commits touched these files.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI through the desktop PR pane (do not poll `gh` in a loop). Expect green on `build-test-validate`; expect `smoke` red only on the two Today visual baselines. Anything else red is a finding — fix on the branch, never with `--no-verify`.**

---

## Self-review against the spec

**Spec coverage (handoff §3a/§3b/§3c/§3d → tasks):** §3a `fd-today` picker table + ties → Task 1; `fdContinue` secondary/byte-identity, chips, fresh set, copy scan → Task 2; `fd-block` three items → Task 4; `fd-due` three items → Task 3; `block-wiring` keep-:50 + two new counts → Task 5. §3b every file → Tasks 1–6 (`frontdoor.css` `.fd-primary`, `.fd-primary__why`, `.fd-continue.is-secondary`, `.fd-also` → Task 6). §3c gates → Task 7; A-series + D/E → Task 8; visual-baseline expectation → Task 9 body. §3d PR body → Task 9. §2 invariants → A6 in Task 8, purity pins in Tasks 1–2, no-key rule everywhere.

**Two deliberate deviations from the handoff's letter, both stated in the PR body:** (1) "primary undefined keeps today's markup byte-identical" is implemented as *undefined ≡ true*: a completed week's default Continue card now also carries the fresh-set sibling, because a lead card that is primary is exactly the case the button is for; every pre-existing test stays green (verified in Task 2 Step 5). (2) `resume-card.test.mjs:38` is widened; there is no way to pass the winner to `fdResumeCard` without touching that regex.

**Placeholder scan:** every step carries its code or its exact command; the only bracketed fields are run-output numbers in the PR body.

**Type consistency:** `fdTodayPrimary(inputs)` keys `capsuleLeft|blockNext|dueTotal|weekProgress|hasWeek|lastRead` are identical in Task 1 (definition + tests) and Task 5 (call). `fdTodayLastRead(ref, weekItems, progress, doneMap)` returns `{ref,kind,title,minutes,done,isContinueTarget}` — consumed by `fdLastReadRow(item, primary)` (Task 3) which reads `ref|kind|title|minutes`. `fdBlockCard(plan, minutes, block, doneMap, opts)` with `opts.primary` — Task 4 definition, Task 5 call `{primary:primary.kind==='block'}`, Task 5 source pin regex. `FD_TODAY_LEAD_END` — Task 1 definition, Task 2 emission, Task 5 splice, Task 5 pin. Class names — Task 2/3/4 markup, Task 6 CSS + inventory, Task 8 locators: `fd-primary`, `fd-primary__why`, `fd-also`, `fd-freshset`, `fd-lastread(__kicker|__title|__action)`, `fd-due__kicker`, `is-primary`, `is-secondary`.
