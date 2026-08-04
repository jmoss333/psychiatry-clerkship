# Learning Loop (WS3) Implementation Plan — Honest Daily Loop, Canonical SM-2, Practice→Mastery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily learning loop honest (every "due" count is servable somewhere the button actually goes), single-source the SM-2 grader with real behavioral tests, and close the practice→mastery loop so all practice sims feed the home adaptive engine.

**Architecture:** All learner state lives in namespaced localStorage (`cw_srs_v1` scheduling, new `cw_practice_events_v1` ledger) written by single-file HTML tools and read by the SPA shell (`spa_index.html`). Shared learner logic (the SM-2 grader, the practice-event writer) becomes build-injected snippets in `13_Faculty_Resources/_automation/site_build/`, expanded by `common.py` at build time (the crisis-block precedent), so three-way copy drift becomes impossible. Every behavior change lands with an extract-and-eval node test following the `tests/qbank-draft-visibility.test.mjs` pattern (slice the real function out of the shipped source and execute it).

**Tech Stack:** Vanilla JS single-file HTML tools (some React 18 UMD), Python 3 build pipeline (`build_deploy.py` / `resident_section.py` / `common.py`), `node:test` root suites, Playwright smoke (CI-only), GitHub PR flow.

## Global Constraints

- main is branch-protected (GH006 on direct push): every change lands via feature branch + `gh pr create`; required checks: build-test-validate + smoke.
- localStorage keys MUST be `cw_*` (shared) or `rp_*` (resident) — the QA gate hard-fails others.
- Build gate: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` must pass (this IS the Netlify build command). Root tests: `node --test tests/*.test.mjs`.
- Since #264, shared build logic lives in `13_Faculty_Resources/_automation/site_build/common.py` (`apply_full_page_pass`, `build_search_index`, `assert_page_contract`) — put new shared transforms THERE, not in both callers.
- Playwright hangs locally on this macOS — verify smoke via CI, not locally.
- Visual baselines regenerate ONLY via the "Refresh visual baselines" workflow_dispatch (Ubuntu/Chromium) — never on macOS. (Tasks below that add always-visible UI to a tool may require this once.)
- Any edit to `_prototypes/sp-interview/sp-interview.html` requires `node _prototypes/sp-interview/generate-preview.mjs --write` (byte-reproducibility test gates it). We do NOT edit the pack in this plan.
- Crisis contacts only via `crisis_resources.json` + markers — none of the files touched here may gain a hard-coded crisis number.
- No PHI anywhere; the practice-event ledger stores tool id, case id, category slugs, page slugs, a 0–3 quality, and a timestamp — never free text.
- Dose literals banned in `rp-*`/`*-trainer` tools (not touched here, but injected snippets ship into all tools — keep snippets dose-free).
- **Sequencing:** PR #284 rewrites `question-bank-practice.html` — Tasks 4–7 are written against its post-merge shape and MUST NOT start until #284 merges. Draft PR #263 touches `spa_index.html` and `one-patient-six-weeks.html`; our PRs land first and #263 rebases (it is draft with a failing test) — do not block on it.

Line numbers below are verified against origin/main tip `817ef90` (2026-08-01), or against the #284 head (`origin/fix/qbank-serve-drafts-labeled`) where noted.

---

## Batch 1 — Honest home counters + phantom-card fix

### Task 1: Bucketed due counts + seedSRS quiz guard + phantom migration in the SPA shell

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` — `seedSRS` (:555), topic_meta fetch `.then` (:471), `srsState`/`dueCount` (:1124–1125), `renderHome` (:1382, :1386, :1394), CSS after `.hm-empty` (:364)
- Test: `tests/srs-home-counters.test.mjs` (create)

**Interfaces:**
- Produces `srsBucket(id)` → `'daily' | 'qb' | 'fam' | 'other'` (prefix classification: `deck#`/`TOPIC#` → daily, `QB#` → qb, `FAM#` → fam, anything else → other — future `REAS#` cards are honest for free).
- Produces `dueBreakdown()` → `{daily:{due,overdue}, qb:{...}, fam:{...}, other:{...}}`; `dueCount()` keeps its `{due, overdue}` signature but now reports **daily-servable only** (Task 5 and later tasks rely on `dueBreakdown`).
- Produces `topicHasQuiz(file)` and `srsDropPhantomTopics()` (idempotent, safe to call on every topic_meta load).
- Structural comments `/* ---- end srs seed + phantom migration ---- */` and `/* ---- end due breakdown ---- */` are load-bearing test anchors — keep them.

**Steps:**

- [ ] Create branch: `git checkout -b fix/srs-honest-due-counts origin/main`
- [ ] Write the failing test `tests/srs-home-counters.test.mjs`:

```js
// Behavioural tests for the home SRS counters and the phantom-TOPIC# guard.
// Pattern follows tests/qbank-draft-visibility.test.mjs: slice the real functions
// out of the shipped single-file source and execute them — text-only assertions
// are exactly how "Due today counts cards nothing can serve" survived.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');
const lpSource = readFileSync(new URL(
  '../01_Six_Week_Curriculum/learning-path.html',
  import.meta.url,
), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const seedCode = slice(source, 'function topicHasQuiz(', '/* ---- end srs seed + phantom migration ----');
const dueCode = slice(source, 'function srsState(', '/* ---- end due breakdown ----');

// eslint-disable-next-line no-new-func
const makeSrs = new Function('localStorage', 'TOPIC_META', 'document', `
  var window = {};
  ${seedCode}
  ${dueCode}
  return { topicHasQuiz: topicHasQuiz, seedSRS: seedSRS,
    srsDropPhantomTopics: srsDropPhantomTopics, srsBucket: srsBucket,
    dueBreakdown: dueBreakdown, dueCount: dueCount };
`);

const docStub = { getElementById: () => null };
const QUIZ_META = { 'mse.md': { quiz: { q: 'Q?', o: [{ t: 'A', c: true }] } }, 'week1.md': {} };

test('seedSRS refuses to seed a TOPIC# card for a page with no servable quiz', () => {
  const ls = memStorage();
  const srs = makeSrs(ls, QUIZ_META, docStub);
  srs.seedSRS('week1.md');
  assert.equal(ls.getItem('cw_srs_v1'), null, 'quizless page must not create a card');
  srs.seedSRS('mse.md');
  const s = JSON.parse(ls.getItem('cw_srs_v1'));
  assert.ok(s.cards['TOPIC#mse.md'], 'quiz-backed page seeds normally');
});

test('srsDropPhantomTopics removes only never-graded quizless TOPIC# cards', () => {
  const ls = memStorage();
  const now = Date.now();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'TOPIC#week1.md': { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: now, last: 0 },
    'TOPIC#mse.md': { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: now, last: 0 },
    'TOPIC#gone.md': { ease: 2.5, ivl: 3, reps: 2, lapses: 0, due: now, last: 0 },
    'QB#qb_moo_001': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: now, last: 0 },
  } }));
  const srs = makeSrs(ls, QUIZ_META, docStub);
  srs.srsDropPhantomTopics();
  const s = JSON.parse(ls.getItem('cw_srs_v1'));
  assert.equal(s.cards['TOPIC#week1.md'], undefined, 'phantom (reps 0, no quiz) dropped');
  assert.ok(s.cards['TOPIC#mse.md'], 'quiz-backed card kept');
  assert.ok(s.cards['TOPIC#gone.md'], 'graded card kept even without a quiz');
  assert.ok(s.cards['QB#qb_moo_001'], 'non-TOPIC cards untouched');
});

test('empty TOPIC_META (fetch failed) never triggers the migration', () => {
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'TOPIC#week1.md': { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: 1, last: 0 },
  } }));
  const srs = makeSrs(ls, {}, docStub);
  srs.srsDropPhantomTopics();
  assert.ok(JSON.parse(ls.getItem('cw_srs_v1')).cards['TOPIC#week1.md'],
    'no metadata means no evidence a card is phantom — leave the store alone');
});

test('dueBreakdown buckets by prefix; dueCount reports Daily-Review-servable only', () => {
  const ls = memStorage();
  const past = Date.now() - 60000;
  const twoDaysAgo = Date.now() - 86400000 * 2;
  const future = Date.now() + 86400000;
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'deck#0#1': { due: past },
    'TOPIC#mse.md': { due: twoDaysAgo },
    'QB#qb_moo_001': { due: past },
    'QB#qb_moo_002': { due: future },
    'FAM#collateral_baseline_safety_001#opening': { due: past },
    'REAS#case#step': { due: past },
  } }));
  const srs = makeSrs(ls, QUIZ_META, docStub);
  const b = srs.dueBreakdown();
  assert.equal(b.daily.due, 2);
  assert.equal(b.daily.overdue, 1);
  assert.equal(b.qb.due, 1);
  assert.equal(b.fam.due, 1);
  assert.equal(b.other.due, 1);
  assert.deepEqual(srs.dueCount(), { due: 2, overdue: 1 });
});

test('learning-path srsDue counts only Daily-Review-servable prefixes', () => {
  const lpCode = slice(lpSource, 'function srsDue(', 'function srsLabel(');
  // eslint-disable-next-line no-new-func
  const srsDue = new Function('localStorage', `${lpCode} return srsDue();`);
  const ls = memStorage();
  ls.setItem('cw_srs_v1', JSON.stringify({ v: 1, cards: {
    'deck#0#1': { due: Date.now() - 1000 },
    'QB#qb_moo_001': { due: Date.now() - 1000 },
    'FAM#x#y': { due: Date.now() - 1000 },
  } }));
  assert.deepEqual(srsDue(ls), { due: 1, started: true });
});
```

- [ ] Run it and confirm the expected failure: `node --test tests/srs-home-counters.test.mjs` → fails with `could not locate function topicHasQuiz( ...` (the functions don't exist yet).
- [ ] In `13_Faculty_Resources/_automation/site_build/spa_index.html`, replace the whole `seedSRS` line (:555) with the guarded version plus migration (single Edit; old_string is the current one-line `function seedSRS(file){ try{ var s=JSON.parse(localStorage.getItem('cw_srs_v1')||'null'); ... }catch(_){ } }` exactly as at :555):

```js
  function topicHasQuiz(file){ var m=(typeof TOPIC_META!=='undefined'&&TOPIC_META)?TOPIC_META[file]:null; return !!(m&&m.quiz&&m.quiz.q&&m.quiz.o&&m.quiz.o.length); }
  function seedSRS(file){ try{ if(!topicHasQuiz(file))return; var s=JSON.parse(localStorage.getItem('cw_srs_v1')||'null'); if(!s||s.v!==1){ s={v:1,cards:{},day:{lastDay:'',newToday:0},stats:{streak:0,lastStudy:'',totalReviews:0,correct:0,seen:0},settings:{newPerDay:12}}; } var id='TOPIC#'+file; if(!s.cards[id]){ s.cards[id]={ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0}; localStorage.setItem('cw_srs_v1',JSON.stringify(s)); } }catch(_){ } }
  /* One-time self-healing migration: drop never-graded TOPIC# cards whose topic has no
     servable quiz — they were seeded by the unguarded seedSRS, can never be graded in
     Daily Review, and inflate "Due today" forever. Runs whenever topic_meta loads;
     idempotent; deliberately refuses to run on an empty TOPIC_META (failed fetch). */
  function srsDropPhantomTopics(){ try{ if(typeof TOPIC_META==='undefined'||!TOPIC_META||!Object.keys(TOPIC_META).length)return; var s=JSON.parse(localStorage.getItem('cw_srs_v1')||'null'); if(!s||s.v!==1||!s.cards)return; var changed=false; for(var id in s.cards){ if(id.indexOf('TOPIC#')!==0)continue; var c=s.cards[id]; if(c&&!c.reps&&!topicHasQuiz(id.slice(6))){ delete s.cards[id]; changed=true; } } if(changed){ localStorage.setItem('cw_srs_v1',JSON.stringify(s)); if(document.getElementById('hmRoot')&&window.renderHome)renderHome(); } }catch(_){ } }
  /* ---- end srs seed + phantom migration ---- */
```

- [ ] Hook the migration into the topic_meta fetch (:471). Edit — old: `.then(function(d){ TOPIC_META=d||{}; try{` → new: `.then(function(d){ TOPIC_META=d||{}; srsDropPhantomTopics(); try{`
- [ ] Replace `dueCount` (:1125) with the bucketed version (old_string is the current one-line `function dueCount(){ ... }` at :1125; `srsState` at :1124 stays as-is above it):

```js
  function srsBucket(id){ if(id.indexOf('QB#')===0)return 'qb'; if(id.indexOf('FAM#')===0)return 'fam'; if(id.indexOf('deck#')===0||id.indexOf('TOPIC#')===0)return 'daily'; return 'other'; }
  function dueBreakdown(){ var s=srsState(),b={daily:{due:0,overdue:0},qb:{due:0,overdue:0},fam:{due:0,overdue:0},other:{due:0,overdue:0}}; if(s&&s.cards){ var now=Date.now(),sod=new Date();sod.setHours(0,0,0,0); for(var id in s.cards){ var c=s.cards[id]; if(c&&c.due<=now){ var k=srsBucket(id); b[k].due++; if(c.due<sod.getTime())b[k].overdue++; } } } return b; }
  function dueCount(){ var b=dueBreakdown(); return {due:b.daily.due,overdue:b.daily.overdue}; }
  /* ---- end due breakdown ---- */
  function dueSubstatHtml(bd){ var parts=[]; if(bd.qb.due)parts.push(bd.qb.due+' in the question bank'); if(bd.fam.due)parts.push(bd.fam.due+' in family practice'); if(bd.other.due)parts.push(bd.other.due+' in other practice tools'); return parts.length?'<div class="hm-substat">Also scheduled: '+parts.join(' · ')+'</div>':''; }
```

- [ ] Update `renderHome`. Three edits:
  - :1382 old: `var pct=tot?Math.round(rev/tot*100):0; var dc=dueCount(); var s=srsState();` → new: `var pct=tot?Math.round(rev/tot*100):0; var bd=dueBreakdown(); var dc=dueCount(); var s=srsState();`
  - :1386 old: `var fresh=(rev===0 && dc.due===0 && !last);` → new: `var fresh=(rev===0 && bd.daily.due+bd.qb.due+bd.fam.due+bd.other.due===0 && !last);`
  - :1394 old (the full `Due today` card line) → new:

```js
    h+='<div class="hm-card"><div class="k">Due today</div><div class="v">'+bd.daily.due+(bd.daily.overdue?'<small> · '+bd.daily.overdue+' overdue</small>':'')+'</div>'+(bd.daily.due?'<button class="hm-btn" data-act="review">Start review</button>':'<span class="hm-empty">Nothing due — nice.</span>')+dueSubstatHtml(bd)+'</div>';
```

- [ ] Add the substat style. Edit after :364 — old: `.hm-empty{color:var(--text-mid);font-size:.94rem}` → new: `.hm-empty{color:var(--text-mid);font-size:.94rem}\n  .hm-substat{font-size:.72rem;color:var(--text-mid);margin-top:6px}`
- [ ] In `01_Six_Week_Curriculum/learning-path.html` replace `srsDue` (:205) — old is the current one-liner; new:

```js
function srsDue(){ try{ var s=JSON.parse(localStorage.getItem("cw_srs_v1")); if(!s||!s.cards) return null; var now=Date.now(),n=0,seen=0; for(var k in s.cards){ if(k.indexOf("deck#")!==0&&k.indexOf("TOPIC#")!==0) continue; seen++; if(s.cards[k].due<=now)n++; } return {due:n,started:seen>0}; }catch(_){ return null; } }
```

- [ ] Run to pass: `node --test tests/srs-home-counters.test.mjs` → `# pass 5`.
- [ ] Run the full root suite + build gate: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → all green (`page contract: ... verified`, QA gate PASS ×2).
- [ ] Commit: `git add 13_Faculty_Resources/_automation/site_build/spa_index.html 01_Six_Week_Curriculum/learning-path.html tests/srs-home-counters.test.mjs && git commit -m "fix(srs): honest Due-today counters + guard/migrate phantom TOPIC# cards"`

**PR boundary:** branch `fix/srs-honest-due-counts`, PR title **"Honest 'Due today': bucket unservable QB#/FAM# cards, stop seeding phantom TOPIC# cards"** — `gh pr create --base main`. CI checks that must be green: build-test-validate + smoke. (Home tile renders identically for a fresh browser, so visual baselines are unaffected.) PR body must note: fixes audit findings "Home 'Due today' counts QB#/FAM# cards no surface can serve" (short-term half) and "seedSRS creates permanently-due phantom cards"; the FAM line is honest today because family-systems Practice mode already re-serves due FAM# cards in-tool.

---

## Batch 2 — Canonical SM-2 grader, single-sourced with behavioral tests

*Prerequisite: PR #284 merged (Task 2 rewrites `question-bank-practice.html` against its post-merge shape: `var DAY = 86400000;` + `function applyGrade(card, grade){...}` directly above `function srsUpdate(`).*

### Task 2: Extract the canonical grader into a build-injected snippet

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` — add `SNIPPET_MARKERS` + `inject_shared_snippets()`; call it in `apply_full_page_pass` (:445–454); add marker check in `page_contract_failures` (:462–497)
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py` (unittest style, run via `python3 13_Faculty_Resources/_automation/site_build/test_common.py`)
- Test: `tests/sm2-behavior.test.mjs` (create)

**Interfaces:**
- Produces snippet file exporting (into enclosing script scope) `function applyGrade(card, grade)` — grade strings `'Again'|'Hard'|'Good'|'Easy'`; requires `var DAY = 86400000` in scope; header documents the **cw_srs_v1 stats contract** (qbank `srsUpdate` and review.html `grade()` may write `stats.seen/correct` — ground-truth correctness; family and all sims never do).
- Produces `common.SNIPPET_MARKERS` (`{'/*__SM2_APPLY_GRADE__*/': 'sm2_apply_grade.js'}` — Task 8 adds a second entry) and `common.inject_shared_snippets(path) -> bool`.

**Steps:**

- [ ] Create branch: `git checkout -b refactor/sm2-canonical-grader origin/main`
- [ ] Write the failing behavioral test `tests/sm2-behavior.test.mjs`:

```js
// Behavioural contract for the canonical SM-2 grader. Evaluates the real function,
// not its text — a scheduling change turns these red even when every consumer
// stays byte-identical (the gap the old textual parity test left open).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js',
  import.meta.url,
), 'utf8');

const DAY = 86400000;
// eslint-disable-next-line no-new-func
const applyGrade = new Function('card', 'grade',
  `var DAY=${DAY}; ${snippet}; return applyGrade(card, grade);`);

const fresh = () => ({ ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: Date.now(), last: 0 });
const days = (ms) => Math.round(ms / DAY);

test('first encounter: Again requeues now / Hard 1d / Good 1d / Easy 4d', () => {
  const now = Date.now();
  const again = applyGrade(fresh(), 'Again');
  assert.equal(again.ivl, 1);
  assert.equal(again.lapses, 1);
  assert.ok(again.due <= Date.now(), 'Again re-dues the card immediately');
  const hard = applyGrade(fresh(), 'Hard');
  assert.equal(hard.ivl, 1);
  assert.equal(days(hard.due - now), 1);
  const good = applyGrade(fresh(), 'Good');
  assert.equal(good.ivl, 1);
  assert.equal(days(good.due - now), 1);
  const easy = applyGrade(fresh(), 'Easy');
  assert.equal(easy.ivl, 4);
  assert.equal(days(easy.due - now), 4);
});

test('ease floor 1.3 holds under repeated failure', () => {
  let c = { ease: 1.35, ivl: 10, reps: 5, lapses: 0, due: 0, last: 0 };
  c = applyGrade(c, 'Again');
  assert.equal(c.ease, 1.3);
  c = applyGrade(c, 'Hard');
  assert.equal(c.ease, 1.3);
});

test('Easy ease is capped at 4.0', () => {
  const c = applyGrade({ ease: 3.95, ivl: 10, reps: 3, lapses: 0, due: 0, last: 0 }, 'Easy');
  assert.equal(c.ease, 4);
});

test('interval capped at 365 d on Good/Easy; Hard due date capped at 365 d out', () => {
  const now = Date.now();
  const good = applyGrade({ ease: 2.5, ivl: 300, reps: 9, lapses: 0, due: 0, last: 0 }, 'Good');
  assert.equal(good.ivl, 365);
  const easy = applyGrade({ ease: 2.5, ivl: 300, reps: 9, lapses: 0, due: 0, last: 0 }, 'Easy');
  assert.equal(easy.ivl, 365);
  const hard = applyGrade({ ease: 2.5, ivl: 350, reps: 9, lapses: 0, due: 0, last: 0 }, 'Hard');
  assert.equal(days(hard.due - now), 365);
});

test('lapse halves the interval (min 1), ease -0.2, re-dues now, counts the lapse', () => {
  const c = applyGrade({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 }, 'Again');
  assert.equal(c.ivl, 5);
  assert.equal(c.ease, 2.3);
  assert.equal(c.lapses, 1);
  assert.ok(c.due <= Date.now());
});

test('reps increment and last is stamped on every grade', () => {
  const before = Date.now();
  const c = applyGrade(fresh(), 'Good');
  assert.equal(c.reps, 1);
  assert.ok(c.last >= before);
});
```

- [ ] Run: `node --test tests/sm2-behavior.test.mjs` → fails (`ENOENT ... sm2_apply_grade.js`).
- [ ] Create `13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js` — the function body is the #284 variant, verbatim (do not write the literal marker token inside this file — the page contract greps for it):

```js
/* ==== Canonical SM-2 grader (build-injected — do not edit inside consumer files) ====
   Source of truth: 13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js.
   Consumers carry a SM2_APPLY_GRADE marker comment that common.py's
   inject_shared_snippets() expands at build time (same mechanism as crisis blocks).
   Grades are the strings 'Again' | 'Hard' | 'Good' | 'Easy'. Semantics: ease floor
   1.3, Easy ease ceiling 4.0, interval cap 365 d, lapse halves the interval (min
   1 d) and re-dues the card immediately. Requires `var DAY = 86400000` in scope.
   Behaviour is pinned by tests/sm2-behavior.test.mjs; consumer wiring is pinned by
   tests/family-srs-parity.test.mjs.

   cw_srs_v1 STATS CONTRACT — who may write stats.seen / stats.correct:
   - question-bank-practice.html srsUpdate(): YES (ground-truth correctness).
   - review.html grade(): YES (ground-truth correctness).
   - family-systems-practice.html srsGradeFamily(): NO — cards only. A self-rating
     has no ground truth, and review.html renders Retention as correct/seen.
   - Practice sims write cw_practice_events_v1 instead — never cw_srs_v1.stats. */
function applyGrade(card, grade){
  /* SM-2 variant: ease floor 1.3, interval cap 365 d */
  var c = Object.assign({}, card);
  c.reps = (c.reps||0) + 1;
  if(c.ivl===0){
    /* first encounter */
    if(grade==='Again'){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); }
    else if(grade==='Hard'){ c.ivl=1; c.due=Date.now()+DAY; }
    else if(grade==='Good'){ c.ivl=1; c.due=Date.now()+DAY; }
    else { c.ivl=4; c.due=Date.now()+4*DAY; }  /* Easy */
  } else {
    if(grade==='Again'){
      c.lapses=(c.lapses||0)+1;
      c.ease=Math.max(1.3, (c.ease||2.5)-0.2);
      c.ivl=Math.max(1, Math.round(c.ivl*0.5));
      c.due=Date.now();
    } else if(grade==='Hard'){
      c.ease=Math.max(1.3, (c.ease||2.5)-0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*1.2));
      c.due=Date.now()+Math.min(365,c.ivl)*DAY;
    } else if(grade==='Good'){
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5)));
      c.ivl=Math.min(365,c.ivl);
      c.due=Date.now()+c.ivl*DAY;
    } else {  /* Easy */
      c.ease=Math.min(4, (c.ease||2.5)+0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3));
      c.ivl=Math.min(365,c.ivl);
      c.due=Date.now()+c.ivl*DAY;
    }
  }
  c.last=Date.now();
  return c;
}
```

- [ ] Run to pass: `node --test tests/sm2-behavior.test.mjs` → `# pass 6`.
- [ ] Add the injector to `common.py`. Insert immediately above `def apply_full_page_pass(` (:437):

```python
# ---------------------------------------------------------------------------
# Shared learner-logic snippets — single-sourced, build-injected.
# ---------------------------------------------------------------------------
# The SM-2 grader is learner-facing scheduling logic shared by three tools
# (question bank, family systems, daily review). Hand-synced copies drifted
# (2026-08 audit: review.html carried a third divergent variant). The canonical
# body lives in one .js file per marker; each consumer carries only the marker.
# tests/sm2-behavior.test.mjs pins the behaviour; tests/family-srs-parity.test.mjs
# pins consumer wiring; page_contract_failures() below turns a skipped injection
# into a hard build failure.
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
}


def inject_shared_snippets(path):
    """Replace shared-snippet markers with their canonical bodies. Idempotent."""
    t = open(path, encoding="utf-8").read()
    out = t
    for marker, fname in SNIPPET_MARKERS.items():
        if marker in out:
            snip = open(
                os.path.join(os.path.dirname(os.path.abspath(__file__)), fname),
                encoding="utf-8",
            ).read()
            out = out.replace(marker, snip)
    if out != t:
        open(path, "w", encoding="utf-8").write(out)
        return True
    return False
```

- [ ] Wire it into the pass. In `apply_full_page_pass`, edit the loop — old:

```python
    for p in pages:
        is_index = os.path.abspath(p) == os.path.abspath(index)
        apply_page_chrome(p, is_index=is_index)
        apply_dark_mode(p, is_index=is_index, cache_bust=cache_bust)
```

  new:

```python
    for p in pages:
        is_index = os.path.abspath(p) == os.path.abspath(index)
        inject_shared_snippets(p)
        apply_page_chrome(p, is_index=is_index)
        apply_dark_mode(p, is_index=is_index, cache_bust=cache_bust)
```

- [ ] Add the contract check. In `page_contract_failures`, after the `<!--ifn-->` check — old:

```python
        if not is_index and "<!--ifn-->" not in t:
            missing.append("in-iframe link interceptor")
```

  new:

```python
        if not is_index and "<!--ifn-->" not in t:
            missing.append("in-iframe link interceptor")
        for marker in SNIPPET_MARKERS:
            if marker in t:
                missing.append("unexpanded shared-snippet marker %s" % marker)
```

- [ ] Add unit tests to `test_common.py` (append before the `if __name__` runner, matching its unittest style):

```python
class TestSharedSnippets(unittest.TestCase):
    MARKER = "/*__SM2_APPLY_GRADE__*/"

    def _page(self, body):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        p = os.path.join(d, "t.html")
        open(p, "w", encoding="utf-8").write(body)
        return p

    def test_marker_is_replaced_with_snippet_body(self):
        p = self._page("<script>var DAY=86400000;\n" + self.MARKER + "\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function applyGrade(card, grade)", t)
        self.assertNotIn(self.MARKER, t)

    def test_injection_is_idempotent(self):
        p = self._page("<script>var DAY=86400000;\n" + self.MARKER + "\n</script>")
        common.inject_shared_snippets(p)
        first = open(p, encoding="utf-8").read()
        self.assertFalse(common.inject_shared_snippets(p))
        self.assertEqual(open(p, encoding="utf-8").read(), first)

    def test_unexpanded_marker_fails_the_page_contract(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        os.makedirs(os.path.join(d, "tools"))
        page = (
            '<a class="skip-link">s</a><div id="root"></div><script>cw_theme'
            + self.MARKER
            + '</script><style>[data-theme="dark"]{}</style>'
            + '<link rel="icon"><!--ifn-->'
        )
        open(os.path.join(d, "tools", "t.html"), "w", encoding="utf-8").write(page)
        failures = common.page_contract_failures(d)
        self.assertTrue(
            any("unexpanded shared-snippet marker" in m for _, ms in failures for m in ms)
        )
```

- [ ] Run: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → `OK`.
- [ ] Commit: `git add 13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/test_common.py tests/sm2-behavior.test.mjs && git commit -m "refactor(srs): canonical SM-2 grader as build-injected snippet with behavioral tests"`

### Task 3: Point all three consumers at the snippet; migrate review.html off variant A

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` — post-#284 shape: `var DAY = 86400000;` + `function applyGrade(card, grade){...}` block directly above `function srsUpdate(`
- Modify: `06_Family_and_Relational/family-systems-practice.html` — header comment (:134–138) + `applyGrade` (:145–177)
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html` — `applyGrade` (:111–120), `maturity` (:121), `grade()` call site (:179)
- Test: `tests/family-srs-parity.test.mjs` (rewrite in place)

**Interfaces:** Consumers carry `/*__SM2_APPLY_GRADE__*/` where the function used to be, plus `var DAY = 86400000` above it (all three already define DAY). review.html maps its numeric 0–3 grade buttons through `GRADE_NAMES = ['Again','Hard','Good','Easy']`.

**Steps:**

- [ ] Rewrite `tests/family-srs-parity.test.mjs` (keep the filename — it is referenced from memory notes and CI globs):

```js
// The canonical SM-2 grader is build-injected (common.py inject_shared_snippets)
// from site_build/sm2_apply_grade.js. Consumers must carry the marker and must
// NOT reintroduce a local applyGrade — hand-synced copies are exactly the drift
// this replaced (review.html had silently diverged into a third variant).
// Behaviour is asserted separately in tests/sm2-behavior.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '/*__SM2_APPLY_GRADE__*/';
const CONSUMERS = [
  '13_Faculty_Resources/_automation/site_build/question-bank-practice.html',
  '06_Family_and_Relational/family-systems-practice.html',
  '07_Evidence_and_Reading/Landmark_Trials/review.html',
];

for (const file of CONSUMERS) {
  test(`${file} uses the injected canonical grader`, () => {
    const src = fs.readFileSync(path.join(repo, file), 'utf8');
    assert.ok(src.includes(MARKER), `missing SM-2 snippet marker in ${file}`);
    assert.ok(!/function applyGrade\(/.test(src),
      `${file} defines a local applyGrade — the canonical body lives in sm2_apply_grade.js`);
    assert.ok(/var DAY ?= ?86400000/.test(src),
      `${file} must define DAY before the injected snippet`);
  });
}
```

- [ ] Run: `node --test tests/family-srs-parity.test.mjs` → 3 failures (`missing SM-2 snippet marker`).
- [ ] `question-bank-practice.html`: replace the entire `function applyGrade(card, grade){ ... }` block (everything from `function applyGrade(card, grade){` through its closing `}` before `function srsUpdate(`) with exactly: `/*__SM2_APPLY_GRADE__*/` (keep the `var DAY = 86400000;` line above it).
- [ ] `family-systems-practice.html`: (a) replace the same function block (:145–177) with `/*__SM2_APPLY_GRADE__*/`; (b) update the header comment — old (:136–138): `(QB#/TOPIC# already exist). applyGrade is copied verbatim from` / `question-bank-practice.html so intervals match; tests/family-srs-parity.test.mjs` / `guards the copy against drift. */` → new: `(QB#/TOPIC# already exist). applyGrade is build-injected from` / `site_build/sm2_apply_grade.js; tests/family-srs-parity.test.mjs guards the` / `marker wiring and tests/sm2-behavior.test.mjs pins the behaviour. */`
- [ ] `review.html`: replace `function applyGrade(st,g){ ... }` (:111–120, the 10-line variant-A block ending `return {ease:ease,...};\n}`) with:

```js
var GRADE_NAMES=["Again","Hard","Good","Easy"]; // grade buttons stay 0-3; mapped onto the canonical string grades
/*__SM2_APPLY_GRADE__*/
```

- [ ] `review.html` `maturity` (:121) — old: `if(st.lapses&&st.ivl<1)return "learning";` → new: `if(st.lapses&&st.ivl<=1)return "learning";` (canonical Again keeps ivl ≥ 1; `<=1` preserves the "learning" chip for freshly-lapsed cards).
- [ ] `review.html` `grade()` call site (:179) — old: `    var was=st.cards[card.id]; st.cards[card.id]=applyGrade(was,g);` → new:

```js
    var was=st.cards[card.id]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0};
    st.cards[card.id]=applyGrade(was,GRADE_NAMES[g]);
```

  (The same-session requeue `if(g===0){ q.push(card); }` at :188 is untouched — canonical Again also re-dues immediately. Scheduling deltas for existing review.html cards — no reps-reset on lapse, first-Good 1 d instead of the 1→3 ladder, first-Easy 4 d instead of 3 d — are deliberate and documented in the PR body; see master decision D7 (`review-schedule-migration` in this plan's draft metadata).)
- [ ] Run: `node --test tests/family-srs-parity.test.mjs tests/sm2-behavior.test.mjs tests/qbank-draft-visibility.test.mjs` → all pass (the #284 draft-visibility test slices `activeItems`/`renderSetup`/`renderMeta`, none of which changed).
- [ ] Full gate: `node --test tests/*.test.mjs && python3 13_Faculty_Resources/_automation/site_build/test_common.py && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green; then spot-check the injection landed: `grep -c "function applyGrade(card, grade)" _build/ms3/tools/question-bank-practice.html _build/ms3/tools/family-systems.html _build/ms3/tools/review.html` → `1` each, and `grep -L "__SM2_APPLY_GRADE__" _build/ms3/tools/review.html` → prints the path (marker fully consumed).
- [ ] Commit: `git add -A && git commit -m "refactor(srs): all three cw_srs_v1 graders consume the injected canonical SM-2 snippet"`

**PR boundary:** branch `refactor/sm2-canonical-grader`, PR title **"Single-source the SM-2 grader (build-injected) + behavioral test suite; migrate review.html off its divergent variant"**. CI: build-test-validate + smoke. Depends on **#284 being merged first**. PR body records the review.html scheduling deltas and the stats contract.

---

## Batch 3 — Question bank "Review due" session mode (closes the QB# serving gap)

### Task 4: Due-driven session mode in question-bank-practice.html

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (post-#284 + Task 3 shape; anchors, not line numbers: `function buildQueue(`, `/* Items eligible to serve`, `function renderSetup(`, `function bindSetup(`, `function startSession(`, the `cw_qb_focus` handoff block)
- Test: `tests/qbank-due-mode.test.mjs` (create)

**Interfaces:**
- Produces `buildDueQueue(items)` → active (non-retired, drafts included per #284 policy) items with a `QB#<id>` card in `cw_srs_v1` due now, sorted by due date ascending. Consumed by `renderSetup` (count), `startDueSession()`, and the `cw_qb_mode` handoff.
- Consumes `localStorage cw_qb_mode === 'due'` (set by the home tile in Task 5; removed on read — mirrors the existing `cw_qb_focus` handoff).

**Steps:**

- [ ] Branch: `git checkout -b feat/qbank-review-due-mode origin/main`
- [ ] Write failing test `tests/qbank-due-mode.test.mjs`:

```js
// The medium-term fix for "Due today counts QB# cards no surface can serve":
// the bank itself re-serves scheduled cards, earliest-due first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/question-bank-practice.html',
  import.meta.url,
), 'utf8');

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return source.slice(a, b);
}

function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const buildDueQueue = new Function('localStorage', 'items', `
  var lsGet=function(k){try{return JSON.parse(localStorage.getItem(k));}catch(_){return null;}};
  ${slice('function srsLoad(', 'function srsSave(')}
  ${slice('function buildDueQueue(', '/* Items eligible to serve')}
  return buildDueQueue(items);
`);

test('buildDueQueue serves due QB# cards earliest-first, ignoring everything else', () => {
  const past1 = Date.now() - 3 * 86400000;
  const past2 = Date.now() - 1 * 86400000;
  const future = Date.now() + 86400000;
  const ls = memStorage({
    cw_srs_v1: JSON.stringify({ v: 1, cards: {
      'QB#qb_moo_001': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: past2, last: 0 },
      'QB#qb_pha_001': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: past1, last: 0 },
      'QB#qb_moo_002': { ease: 2.5, ivl: 4, reps: 1, lapses: 0, due: future, last: 0 },
      'QB#qb_gone_999': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: past1, last: 0 },
      'FAM#scenario#opening': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: past1, last: 0 },
    } }),
  });
  const items = [{ id: 'qb_moo_001' }, { id: 'qb_moo_002' }, { id: 'qb_pha_001' }];
  const q = buildDueQueue(ls, items);
  assert.deepEqual(q.map((it) => it.id), ['qb_pha_001', 'qb_moo_001'],
    'earliest due first; future, missing-from-bank, and non-QB cards excluded');
});

test('buildDueQueue is empty when nothing is scheduled', () => {
  assert.deepEqual(buildDueQueue(memStorage(), [{ id: 'qb_moo_001' }]), []);
});
```

- [ ] Run: `node --test tests/qbank-due-mode.test.mjs` → fails (`could not locate function buildDueQueue(`).
- [ ] In `question-bank-practice.html`, insert directly above the `/* Items eligible to serve` comment:

```js
/* Due-driven serving: the scheduled half of the daily loop. Cards are written by
   srsUpdate() on every answer; this re-serves them earliest-due first. Drafts stay
   in (labelled — #284 policy); retired items never appear because callers pass
   activeItems(). */
function buildDueQueue(items){
  var s = srsLoad(), now = Date.now(), byId = {};
  items.forEach(function(it){ byId['QB#'+it.id] = it; });
  var due = [];
  Object.keys(s.cards||{}).forEach(function(cid){
    if(cid.indexOf('QB#')!==0) return;
    var c = s.cards[cid];
    if(c && c.due<=now && byId[cid]) due.push({item:byId[cid], due:c.due});
  });
  due.sort(function(a,b){ return a.due-b.due; });
  return due.map(function(d){ return d.item; });
}
```

- [ ] Run to pass: `node --test tests/qbank-due-mode.test.mjs` → `# pass 2`.
- [ ] Add the setup-screen button. In `renderSetup`, after the `var draftCount = ...` line add `var dueN = (typeof buildDueQueue==='function') ? buildDueQueue(items).length : 0;` (the `typeof` guard keeps `tests/qbank-draft-visibility.test.mjs`'s sliced-`renderSetup` harness working), and edit the setup-foot — old:

```js
    +'<div class="setup-foot">'
    +'<button class="btn btn-primary" id="startBtn">Start practice</button>'
    +'<span class="item-count" id="itemCount">'+total+' questions match</span>'
    +'</div>'
```

  new:

```js
    +'<div class="setup-foot">'
    +'<button class="btn btn-primary" id="startBtn">Start practice</button>'
    +(dueN?'<button class="btn" id="dueBtn">Review due ('+dueN+')</button>':'')
    +'<span class="item-count" id="itemCount">'+total+' questions match</span>'
    +'</div>'
```

- [ ] Add `startDueSession` directly below `startSession` (mirror its SESSION shape exactly):

```js
function startDueSession(){
  var queue = buildDueQueue(activeItems());
  if(!queue.length){
    setRoot('<div class="err-box">Nothing due right now — your scheduled questions are caught up.</div>');
    return;
  }
  SESSION = {
    queue: queue,
    idx: 0,
    responses: [],
    confidence: null,
    tier1Key: null,
    displayOrder: [],
    tier2DisplayOrder: [],
    state: 'conf',
    dueMode: true
  };
  showQuestion();
}
```

- [ ] Wire the button in `bindSetup` — after the `if(startBtn) startBtn.addEventListener('click', ...)` block add:

```js
  var dueBtn=document.getElementById('dueBtn');
  if(dueBtn) dueBtn.addEventListener('click',function(){ startDueSession(); });
```

- [ ] Add the home handoff. Directly after the existing `cw_qb_focus` handoff block (`try{ var _focus=localStorage.getItem('cw_qb_focus'); ... }catch(_){ }`) add:

```js
      /* due-review handoff: home sets cw_qb_mode='due' so "Review due" starts
         immediately (mirrors the cw_qb_focus adaptive-engine handoff above). */
      try{ var _mode=localStorage.getItem('cw_qb_mode'); if(_mode){ localStorage.removeItem('cw_qb_mode');
        if(_mode==='due' && buildDueQueue(activeItems()).length) startDueSession(); } }catch(_){ }
```

- [ ] Full check: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green.
- [ ] Commit: `git add 13_Faculty_Resources/_automation/site_build/question-bank-practice.html tests/qbank-due-mode.test.mjs && git commit -m "feat(qbank): due-driven 'Review due' session mode serving QB# cards earliest-first"`

### Task 5: Home tile routes bank-due cards to the new mode

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` — `dueSubstatHtml` (added in Task 1), `[data-act]` handler (:1489 pre-Task-1; anchor `if(a==='review')navClick('review.html');`), CSS after `.hm-substat`

**Interfaces:** Produces home action `data-act="qbdue"` → sets `cw_qb_mode='due'` → `navClick('question-bank-practice.html')`. Consumes Task 4's handoff.

**Steps:**

- [ ] Upgrade `dueSubstatHtml` — old (from Task 1): `if(bd.qb.due)parts.push(bd.qb.due+' in the question bank');` → new: `if(bd.qb.due)parts.push('<button class="hm-linklike" data-act="qbdue">'+bd.qb.due+' in the question bank →</button>');`
- [ ] Extend the card-level `[data-act]` handler — old: `var b=e.target.closest?e.target.closest('[data-act]'):null; if(b){ var a=b.getAttribute('data-act'); if(a==='review')navClick('review.html'); }` → new:

```js
        var b=e.target.closest?e.target.closest('[data-act]'):null; if(b){ var a=b.getAttribute('data-act'); if(a==='review')navClick('review.html'); else if(a==='qbdue'){ try{localStorage.setItem('cw_qb_mode','due');}catch(_){ } navClick('question-bank-practice.html'); } }
```

- [ ] Add CSS after `.hm-substat` (Task 1): `.hm-linklike{background:none;border:none;padding:0;color:var(--accent-dark);text-decoration:underline;cursor:pointer;font:inherit}`
- [ ] Verify + commit: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res && git add 13_Faculty_Resources/_automation/site_build/spa_index.html && git commit -m "feat(home): route scheduled question-bank cards to the Review-due session"`

**PR boundary:** branch `feat/qbank-review-due-mode`, PR title **"Question bank: 'Review due' session mode + home routing (QB# cards now servable)"**. CI: build-test-validate + smoke (fresh-browser visuals unchanged — the due button only renders when cards exist). Depends on **#284 merged** and **Batches 1–2 merged** (rebase over them; Task 4 assumes the marker-form applyGrade and Task 5 assumes `dueBreakdown`).

---

## Batch 4 — Family practice serves due cards first

### Task 6: Due-first prompt ordering + "Due first" scenario sort in family-systems-practice

**Files:**
- Modify: `06_Family_and_Relational/family-systems-practice.html` — `state` init (:132), insert `dueFirst` before `function revealBodyHtml(` (:270), `practiceHtml` first line (:286), `sideHtml`/`filtersHtml` (:245–246), click handler (:313 block)
- Test: `tests/family-due-first.test.mjs` (create)

**Interfaces:** Produces `dueFirst(scenarioId, prompts)` (due → never-started → scheduled-future, stable within rank) and a sidebar `data-sort` toggle ordering scenarios by due count. Consumed only in-tool.

**Steps:**

- [ ] Branch: `git checkout -b feat/family-due-first origin/main`
- [ ] Failing test `tests/family-due-first.test.mjs`:

```js
// Family practice re-serves FAM# cards; due-first ordering makes a returning
// learner hit what is actually due before new material.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../06_Family_and_Relational/family-systems-practice.html',
  import.meta.url,
), 'utf8');

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return source.slice(a, b);
}

// eslint-disable-next-line no-new-func
const dueFirst = new Function('localStorage', 'scenarioId', 'prompts', `
  ${slice('var SRS_KEY=', '/*__SM2_APPLY_GRADE__*/')}
  ${slice('function dueFirst(', 'function revealBodyHtml(')}
  return dueFirst(scenarioId, prompts);
`);

function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('due cards first, then never-started, then scheduled-future; stable within rank', () => {
  const ls = memStorage({
    cw_srs_v1: JSON.stringify({ v: 1, cards: {
      'FAM#sc1#opening': { due: Date.now() + 86400000 },
      'FAM#sc1#avoid': { due: Date.now() - 1000 },
    } }),
  });
  const prompts = [{ id: 'opening' }, { id: 'ask' }, { id: 'avoid' }];
  assert.deepEqual(
    dueFirst(ls, 'sc1', prompts).map((p) => p.id),
    ['avoid', 'ask', 'opening'],
  );
});
```

  Note: the first slice (`var SRS_KEY=` … `function applyGrade`) pulls in `srsFresh`/`srsLoadStore`/`famCardId` and ends at the injected-marker region — after Batch 2, `function applyGrade` no longer appears in this source, so the end anchor must be `/*__SM2_APPLY_GRADE__*/` instead. Use: `slice('var SRS_KEY=', '/*__SM2_APPLY_GRADE__*/')`.
- [ ] Run: `node --test tests/family-due-first.test.mjs` → fails (`could not locate function dueFirst(`).
- [ ] Insert `dueFirst` directly above `function revealBodyHtml(`:

```js
function dueFirst(scenarioId,prompts){
  var s=srsLoadStore(), now=Date.now();
  function rank(rp){ var c=s.cards[famCardId(scenarioId,rp.id)]; if(c&&c.due<=now)return 0; if(!c)return 1; return 2; }
  return prompts.map(function(rp,i){ return {rp:rp,i:i,r:rank(rp)}; })
    .sort(function(a,b){ return a.r-b.r||a.i-b.i; })
    .map(function(x){ return x.rp; });
}
```

- [ ] `practiceHtml` (:286) — old: `var prompts=retrievalFor(it), d=srsDueForScenario(it.id,prompts);` → new: `var prompts=dueFirst(it.id,retrievalFor(it)), d=srsDueForScenario(it.id,prompts);`
- [ ] Sidebar sort. (a) `state` init (:132) — old: `mode:'reference',revealed:{},graded:{}};` → new: `mode:'reference',sort:'default',revealed:{},graded:{}};` (b) insert above `function sideHtml(`:

```js
function scenarioDue(it){ return srsDueForScenario(it.id,retrievalFor(it)).due; }
function orderedItems(list){ if(state.sort!=='due')return list; return list.slice().sort(function(a,b){ return scenarioDue(b)-scenarioDue(a); }); }
function sortToggleHtml(){ var on=state.sort==='due'; return '<div class="sorttoggle"><button type="button" class="filter'+(on?' on':'')+'" data-sort="'+(on?'default':'due')+'" aria-pressed="'+String(on)+'">Due first</button></div>'; }
```

  (c) `sideHtml` — old: `var p=overall(), list=filteredItems();` → new: `var p=overall(), list=orderedItems(filteredItems());` and old: `+filtersHtml()+'<div class="scenario-list">'` → new: `+filtersHtml()+sortToggleHtml()+'<div class="scenario-list">'`
- [ ] Click handler — after the `[data-rate]` branch add:

```js
    var so=ev.target.closest&&ev.target.closest('[data-sort]');
    if(so){state.sort=so.getAttribute('data-sort')==='due'?'due':'default';render();return;}
```

- [ ] Minimal CSS near the `.filters` rules: `.sorttoggle{margin:4px 0 8px}`
- [ ] Verify: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green.
- [ ] Commit: `git add 06_Family_and_Relational/family-systems-practice.html tests/family-due-first.test.mjs && git commit -m "feat(family): due-first retrieval ordering + Due-first scenario sort"`

**PR boundary:** branch `feat/family-due-first`, PR title **"Family practice: serve due FAM# cards first"**. CI: build-test-validate + smoke. The sort toggle is always visible — if the visual-regression spec covers this page and diffs beyond 0.20, trigger the "Refresh visual baselines" workflow_dispatch once after merge (never regenerate on macOS). Rebase over Batch 2 (marker anchor noted in the test step).

---

## Batch 5 — Practice-event ledger: contract + first adapter + engine fold-in

### Task 7: `cw_practice_events_v1` snippet + injection registration

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/practice_events.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` — add entry to `SNIPPET_MARKERS`
- Test: `tests/practice-events.test.mjs` (create; grows in Tasks 8–9)

**Interfaces:**
- Produces `recordPracticeEvent({tool, caseId, cats, pages, q})` writing `cw_practice_events_v1` = `{v:1, events:[{tool, caseId, cats:[shelfBlueprint slugs], pages:[hub page files], q:0-3|null, ts}]}`, append-only, capped at 500 events FIFO. `q`: 3 strong / 2 partial / 1 weak / 0 harmful-or-missed / null ungraded. No free text — PHI-safe by construction.
- Marker: `/*__PRACTICE_EVENTS__*/` (build-injected exactly like the SM-2 snippet).

**Steps:**

- [ ] Branch: `git checkout -b feat/practice-events-ledger origin/main`
- [ ] Start `tests/practice-events.test.mjs` with the snippet contract:

```js
// The shared practice-event ledger: every sim's dead-end data becomes engine food.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/practice_events.js',
  import.meta.url,
), 'utf8');

function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const record = new Function('localStorage', 'ev',
  `${snippet}; recordPracticeEvent(ev); return JSON.parse(localStorage.getItem('cw_practice_events_v1'));`);

test('appends a normalized event', () => {
  const ls = memStorage();
  const s = record(ls, { tool: 'diagnostic-reasoning', caseId: 'c1', pages: ['ddx.md'], q: 3 });
  assert.equal(s.v, 1);
  assert.equal(s.events.length, 1);
  const ev = s.events[0];
  assert.equal(ev.tool, 'diagnostic-reasoning');
  assert.deepEqual(ev.pages, ['ddx.md']);
  assert.deepEqual(ev.cats, []);
  assert.equal(ev.q, 3);
  assert.ok(ev.ts > 0);
});

test('non-numeric q normalizes to null; malformed store resets', () => {
  const ls = memStorage({ cw_practice_events_v1: '{"bogus":true}' });
  const s = record(ls, { tool: 't', caseId: 'c' });
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].q, null);
});

test('caps at 500 events FIFO', () => {
  const ls = memStorage();
  // eslint-disable-next-line no-new-func
  const recordMany = new Function('localStorage',
    `${snippet}; for(var i=0;i<505;i++)recordPracticeEvent({tool:'t',caseId:'c'+i,q:1});
     return JSON.parse(localStorage.getItem('cw_practice_events_v1'));`);
  const s = recordMany(ls);
  assert.equal(s.events.length, 500);
  assert.equal(s.events[0].caseId, 'c5', 'oldest events evicted first');
});
```

- [ ] Run: `node --test tests/practice-events.test.mjs` → fails (`ENOENT ... practice_events.js`).
- [ ] Create `13_Faculty_Resources/_automation/site_build/practice_events.js`:

```js
/* ==== Shared practice-event ledger — cw_practice_events_v1 (build-injected) ====
   Source of truth: 13_Faculty_Resources/_automation/site_build/practice_events.js;
   consumers carry a PRACTICE_EVENTS marker that common.py expands at build time.
   Contract: {v:1, events:[{tool, caseId, cats, pages, q, ts}]} — append-only,
   newest last, capped at 500 events FIFO. q is 0-3 (3 strong / 2 partial /
   1 weak / 0 harmful-or-missed) or null when the surface has no graded outcome.
   cats are shelfBlueprint slugs; pages are hub page files — the home engine folds
   pages through blueprintOf(). Readers: spa_index.html masteryByBlueprint() and
   weakTopics(). Writers: one small adapter per practice tool. Never write
   cw_srs_v1.stats from a sim (see sm2_apply_grade.js stats contract). No free
   text, ever — ids, slugs, a 0-3 integer, and a timestamp only. */
var PRACTICE_EVENTS_KEY='cw_practice_events_v1';
var PRACTICE_EVENTS_CAP=500;
function recordPracticeEvent(ev){
  try{
    var s=JSON.parse(localStorage.getItem(PRACTICE_EVENTS_KEY)||'null');
    if(!s||s.v!==1||!Array.isArray(s.events)) s={v:1,events:[]};
    s.events.push({
      tool:String(ev.tool||''),
      caseId:String(ev.caseId||''),
      cats:Array.isArray(ev.cats)?ev.cats:[],
      pages:Array.isArray(ev.pages)?ev.pages:[],
      q:(typeof ev.q==='number'?ev.q:null),
      ts:Date.now()
    });
    if(s.events.length>PRACTICE_EVENTS_CAP) s.events=s.events.slice(s.events.length-PRACTICE_EVENTS_CAP);
    localStorage.setItem(PRACTICE_EVENTS_KEY,JSON.stringify(s));
  }catch(_){}
}
```

- [ ] Register the marker in `common.py` — old:

```python
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
}
```

  new:

```python
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
    "/*__PRACTICE_EVENTS__*/": "practice_events.js",
}
```

- [ ] Run to pass: `node --test tests/practice-events.test.mjs` → `# pass 3`; `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → `OK`.
- [ ] Commit: `git add 13_Faculty_Resources/_automation/site_build/practice_events.js 13_Faculty_Resources/_automation/site_build/common.py tests/practice-events.test.mjs && git commit -m "feat(mastery): shared cw_practice_events_v1 ledger snippet (append-only, 500-cap)"`

### Task 8: Diagnostic-reasoning adapter (first sim feeds the loop)

**Files:**
- Modify: `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html` — insert marker + grade map above `function loadAttempts(` (:122); rewrite `saveAttempt` (:123)
- Test: extend `tests/practice-events.test.mjs`

**Interfaces:** Consumes `recordPracticeEvent`; produces events `{tool:'diagnostic-reasoning', caseId, pages: case.linkedPages, q: best→3 partial→2 missed→1 harmful→0}` on every step choice. `QUALITY_GRADE` map is shared verbatim by Task 9's communication adapter.

**Steps:**

- [ ] Add failing test to `tests/practice-events.test.mjs`:

```js
const drSource = readFileSync(new URL(
  '../02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html',
  import.meta.url,
), 'utf8');

function drSlice(startMarker, endMarker) {
  const a = drSource.indexOf(startMarker);
  const b = drSource.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return drSource.slice(a, b);
}

test('diagnostic-reasoning saveAttempt records a graded practice event with linked pages', () => {
  const captured = [];
  const ls = memStorage();
  const state = {
    attempts: {},
    cases: [{ id: 'c1', linkedPages: ['ddx.md', 't_mood.md'] }],
  };
  // eslint-disable-next-line no-new-func
  const saveAttempt = new Function('state', 'localStorage', 'recordPracticeEvent',
    'caseId', 'stepId', 'choice', `
    var QUALITY_GRADE={best:3,partial:2,missed:1,harmful:0};
    ${drSlice('function saveAttempt(', 'function bestCount(')}
    saveAttempt(caseId, stepId, choice);`);
  saveAttempt(state, ls, (ev) => captured.push(ev), 'c1', 's1', { id: 'ch1', quality: 'harmful' });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].q, 0);
  assert.deepEqual(captured[0].pages, ['ddx.md', 't_mood.md']);
  assert.ok(JSON.parse(ls.getItem('cw_reason_v1')).c1.steps.s1, 'cw_reason_v1 write preserved');
});
```

- [ ] Run: `node --test tests/practice-events.test.mjs` → new test fails (`recordPracticeEvent is not defined` inside `saveAttempt` — the adapter call is missing).
- [ ] In `diagnostic-reasoning.html`, insert directly above `function loadAttempts(` (:122):

```js
/*__PRACTICE_EVENTS__*/
var QUALITY_GRADE={best:3,partial:2,missed:1,harmful:0};
```

- [ ] Rewrite `saveAttempt` (:123) — old is the current one-liner; new:

```js
function saveAttempt(caseId,stepId,choice){try{var rec=state.attempts[caseId]||{steps:{}};rec.steps=rec.steps||{};rec.steps[stepId]={choiceId:choice.id,quality:choice.quality,at:new Date().toISOString().slice(0,10)};rec.updatedAt=new Date().toISOString().slice(0,10);state.attempts[caseId]=rec;localStorage.setItem('cw_reason_v1',JSON.stringify(state.attempts));var cs=(state.cases||[]).filter(function(c){return c.id===caseId;})[0];recordPracticeEvent({tool:'diagnostic-reasoning',caseId:caseId,cats:[],pages:(cs&&cs.linkedPages)||[],q:QUALITY_GRADE[choice.quality]});}catch(_){}}
```

- [ ] Run to pass: `node --test tests/practice-events.test.mjs` → all pass.
- [ ] Commit: `git add 02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html tests/practice-events.test.mjs && git commit -m "feat(mastery): diagnostic-reasoning writes graded practice events"`

### Task 9: Home engine folds practice events into mastery + weak spots

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` — `weakTopics` (:1334–1345), `masteryByBlueprint` (:1351–1358)
- Test: extend `tests/practice-events.test.mjs`

**Interfaces:** Produces `practiceStrugglePages()` (pure helper: pages from events with `q < 2`) consumed by `weakTopics`; `masteryByBlueprint` gains a fourth source folding events via `cats ∪ pages→blueprintOf`. `q>=2` counts as a correct observation, `q<2` incorrect, `q===null` skipped.

**Steps:**

- [ ] Add failing tests to `tests/practice-events.test.mjs`:

```js
const spaSource = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');

function spaSlice(startMarker, endMarker) {
  const a = spaSource.indexOf(startMarker);
  const b = spaSource.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return spaSource.slice(a, b);
}

test('masteryByBlueprint folds graded events through cats and pages', () => {
  const ls = memStorage({
    cw_practice_events_v1: JSON.stringify({ v: 1, events: [
      { tool: 't', caseId: 'a', cats: ['mood'], pages: [], q: 3, ts: 1 },
      { tool: 't', caseId: 'b', cats: [], pages: ['ddx.md'], q: 0, ts: 2 },
      { tool: 't', caseId: 'c', cats: ['mood'], pages: [], q: null, ts: 3 },
    ] }),
  });
  // eslint-disable-next-line no-new-func
  const mastery = new Function('localStorage', 'SHELF_ORDER', 'SHELF_LABEL', 'blueprintOf', 'srsState',
    `${spaSlice('function masteryByBlueprint(', '/* confidence calibration')} return masteryByBlueprint();`);
  const rows = mastery(ls, ['mood', 'otherdx'], { mood: 'Mood', otherdx: 'Other' },
    (f) => (f === 'ddx.md' ? ['otherdx'] : []), () => null);
  const mood = rows.filter((r) => r.c === 'mood')[0];
  const other = rows.filter((r) => r.c === 'otherdx')[0];
  assert.equal(mood.n, 1, 'q=3 event counted; q=null skipped');
  assert.equal(other.n, 1, 'page folded through blueprintOf');
  assert.ok(mood.score > other.score, 'strong beats harmful');
});

test('practiceStrugglePages surfaces pages from low-quality events only', () => {
  const ls = memStorage({
    cw_practice_events_v1: JSON.stringify({ v: 1, events: [
      { tool: 't', caseId: 'a', cats: [], pages: ['ddx.md'], q: 1, ts: 1 },
      { tool: 't', caseId: 'b', cats: [], pages: ['t_mood.md'], q: 3, ts: 2 },
      { tool: 't', caseId: 'c', cats: [], pages: ['week1.md'], q: null, ts: 3 },
    ] }),
  });
  // eslint-disable-next-line no-new-func
  const struggle = new Function('localStorage',
    `${spaSlice('function practiceStrugglePages(', 'function weakTopics(')} return practiceStrugglePages();`);
  assert.deepEqual(struggle(ls), ['ddx.md']);
});
```

- [ ] Run: `node --test tests/practice-events.test.mjs` → the two new tests fail.
- [ ] In `spa_index.html`, insert directly above `function weakTopics(` (:1334):

```js
  function practiceStrugglePages(){ var out=[]; try{ var pe=JSON.parse(localStorage.getItem('cw_practice_events_v1')||'null'); if(pe&&pe.v===1&&Array.isArray(pe.events)){ pe.events.forEach(function(ev){ if(ev==null||typeof ev.q!=='number'||ev.q>=2)return; (ev.pages||[]).forEach(function(f){ out.push(f); }); }); } }catch(_){ } return out; }
```

- [ ] In `weakTopics`, after the `cw_qb_v1` try-block (:1341) add:

```js
    practiceStrugglePages().forEach(function(f){ add(f,'struggled in a practice sim'); });
```

- [ ] In `masteryByBlueprint`, after the `cw_quiz_v1` try-block add:

```js
    try{ var pe=JSON.parse(localStorage.getItem('cw_practice_events_v1')||'null'); if(pe&&pe.v===1&&Array.isArray(pe.events)){ pe.events.forEach(function(ev){ if(ev==null||typeof ev.q!=='number')return; var seen={}; (ev.cats||[]).forEach(function(c){ seen[c]=1; }); (ev.pages||[]).forEach(function(f){ blueprintOf(f).forEach(function(c){ seen[c]=1; }); }); addObs(Object.keys(seen), ev.q>=2); }); } }catch(_){ }
```

- [ ] Run to pass: `node --test tests/practice-events.test.mjs` → all pass. Full gate: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green; confirm injection: `grep -c "function recordPracticeEvent" _build/ms3/tools/diagnostic-reasoning.html` → `1`.
- [ ] Commit: `git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/practice-events.test.mjs && git commit -m "feat(mastery): fold practice events into masteryByBlueprint and weak-spot engine"`

**PR boundary:** branch `feat/practice-events-ledger`, PR title **"Close the practice→mastery loop (1/3): shared event ledger + diagnostic-reasoning adapter + engine fold-in"**. CI: build-test-validate + smoke. Depends on **Batch 2** (injection machinery). References and supersedes item 3 of `docs/superpowers/specs/2026-07-15-sim-and-content-improvements-future-work.md` — say so in the PR body.

---

## Batch 6 — Remaining sim adapters

### Task 10: communication-practice + shelf-mode adapters

**Files:**
- Modify: `02_Clinical_Skills/Communication_Practice/communication-practice.html` — marker + map above `function loadAttempts(` (:147); rewrite `saveAttempt` (:148)
- Modify: `07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html` — marker + pure `attemptEvents` helper near `var LS="cw_shelf_v1"` (:100); hook in the persist effect (:254–259)
- Test: extend `tests/practice-events.test.mjs`

**Interfaces:** communication events mirror Task 8 (`tool:'communication-practice'`, same `QUALITY_GRADE`, pages from `c.linkedPages`). Shelf emits one aggregate event per finished attempt (`q` from pct: ≥80→3, ≥65→2, >0→1, else 0; pages = all item `ref`s) plus one `q:1` event per missed `ref` so weak spots localize.

**Steps:**

- [ ] Branch: `git checkout -b feat/practice-events-comm-shelf origin/main`
- [ ] Failing tests (append to `tests/practice-events.test.mjs`):

```js
const commSource = readFileSync(new URL(
  '../02_Clinical_Skills/Communication_Practice/communication-practice.html',
  import.meta.url,
), 'utf8');
const shelfSource = readFileSync(new URL(
  '../07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html',
  import.meta.url,
), 'utf8');

function srcSlice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

test('communication-practice saveAttempt records a graded event', () => {
  const captured = [];
  const ls = memStorage();
  const state = { attempts: {}, cases: [{ id: 'c1', linkedPages: ['t_mood.md'] }] };
  // eslint-disable-next-line no-new-func
  const saveAttempt = new Function('state', 'localStorage', 'recordPracticeEvent', 'caseId', 'choice', `
    var QUALITY_GRADE={best:3,partial:2,missed:1,harmful:0};
    ${srcSlice(commSource, 'function saveAttempt(', 'function resetHistory(')}
    saveAttempt(caseId, choice);`);
  saveAttempt(state, ls, (ev) => captured.push(ev), 'c1', { id: 'ch', quality: 'best' });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].q, 3);
  assert.deepEqual(captured[0].pages, ['t_mood.md']);
});

test('shelf-mode attemptEvents: one aggregate + one per missed ref', () => {
  // eslint-disable-next-line no-new-func
  const attemptEvents = new Function('items', 'picks', 'result',
    `${srcSlice(shelfSource, 'function attemptEvents(', '/* ---- end attempt events ----')} return attemptEvents(items, picks, result);`);
  const items = [
    { ref: 't_mood.md', o: [{ t: 'a', c: true }, { t: 'b', c: false }] },
    { ref: 'delirium.md', o: [{ t: 'a', c: true }, { t: 'b', c: false }] },
  ];
  const evs = attemptEvents(items, [0, 1], { pct: 50 });
  assert.equal(evs.length, 2);
  assert.equal(evs[0].tool, 'shelf-mode');
  assert.equal(evs[0].q, 1, '50% maps to weak');
  assert.deepEqual(evs[0].pages.sort(), ['delirium.md', 't_mood.md']);
  assert.deepEqual(evs[1], { tool: 'shelf-mode', caseId: 'missed', cats: [], pages: ['delirium.md'], q: 1 });
});
```

- [ ] Run: `node --test tests/practice-events.test.mjs` → the two new tests fail.
- [ ] `communication-practice.html`: insert above `function loadAttempts(` (:147): `/*__PRACTICE_EVENTS__*/` newline `var QUALITY_GRADE={best:3,partial:2,missed:1,harmful:0};` — then rewrite `saveAttempt` (:148) — old is the current one-liner; new:

```js
function saveAttempt(caseId,choice){try{state.attempts[caseId]={choiceId:choice.id,quality:choice.quality,at:new Date().toISOString().slice(0,10)};localStorage.setItem('cw_comm_v1',JSON.stringify(state.attempts));var cs=(state.cases||[]).filter(function(c){return c.id===caseId;})[0];recordPracticeEvent({tool:'communication-practice',caseId:caseId,cats:[],pages:(cs&&cs.linkedPages)||[],q:QUALITY_GRADE[choice.quality]});}catch(_){}}
```

- [ ] `shelf-mode.html`: insert directly below `var LS="cw_shelf_v1";` (:100):

```js
/*__PRACTICE_EVENTS__*/
function attemptEvents(items,picks,result){
  var missed={}, all={};
  (items||[]).forEach(function(it,i){ var ref=it.ref; if(ref)all[ref]=1; var p=picks[i]; var ok=!!(it.o&&it.o[p]&&it.o[p].c); if(!ok&&ref)missed[ref]=1; });
  var q=result.pct>=80?3:(result.pct>=65?2:(result.pct>0?1:0));
  var evs=[{tool:'shelf-mode',caseId:'attempt',cats:[],pages:Object.keys(all),q:q}];
  Object.keys(missed).forEach(function(ref){ evs.push({tool:'shelf-mode',caseId:'missed',cats:[],pages:[ref],q:1}); });
  return evs;
}
/* ---- end attempt events ---- */
```

- [ ] Hook the persist effect (:254–259) — old: `        L.attempts=L.attempts.slice(0,20); localStorage.setItem(LS,JSON.stringify(L));}catch(_){}` → new: `        L.attempts=L.attempts.slice(0,20); localStorage.setItem(LS,JSON.stringify(L));
        attemptEvents(st.items,st.picks,st.result).forEach(recordPracticeEvent);}catch(_){}`
- [ ] Run to pass: `node --test tests/practice-events.test.mjs`; full gate `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green.
- [ ] Commit: `git add 02_Clinical_Skills/Communication_Practice/communication-practice.html 07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html tests/practice-events.test.mjs && git commit -m "feat(mastery): communication-practice and shelf-mode feed the practice-event ledger"`

**PR boundary:** branch `feat/practice-events-comm-shelf`, PR title **"Close the practice→mastery loop (2/3): communication + shelf adapters"**. CI: build-test-validate + smoke. Depends on Batch 5.

### Task 11: One-patient self-rating on reveals + adapter

*Coordination note: draft PR #263 also touches `one-patient-six-weeks.html`. Land this first; #263 rebases — this is the master plan's Phase 3 rule (#263 lands last), not a separate decision gate.*

**Files:**
- Modify: `08_Cases_and_Simulation/one-patient-six-weeks.html` — marker + helpers above `function checklist(` (:131); `checklist()` example branch (:139); click handler (:143 block); CSS
- Test: extend `tests/practice-events.test.mjs`

**Interfaces:** Checking an item still reveals "One way to say it"; a new rate row (Again/Hard/Good/Easy → q 0–3, one-shot per item) writes `{tool:'one-patient-six-weeks', caseId: week.id, pages: pagesFor(week), q}` and persists the rating under `cw_longitudinal_v1 ... rates`. This implements finding 5's "add self-rating to one-patient's reveals" as ledger-only (no new SRS namespace — the story is linear, rescheduling it makes no sense).

**Steps:**

- [ ] Branch: `git checkout -b feat/one-patient-self-rating origin/main`
- [ ] Failing test (append to `tests/practice-events.test.mjs`):

```js
const onepSource = readFileSync(new URL(
  '../08_Cases_and_Simulation/one-patient-six-weeks.html',
  import.meta.url,
), 'utf8');

test('one-patient pagesFor extracts page-kind link targets; rateRowHtml one-shots', () => {
  // eslint-disable-next-line no-new-func
  const helpers = new Function('esc',
    `${srcSlice(onepSource, 'function pagesFor(', '/* ---- end self-rating helpers ----')}
     return { pagesFor: pagesFor, rateRowHtml: rateRowHtml };`);
  const h = helpers((s) => s);
  const w = { id: 'w1', links: [
    { kind: 'page', target: 't_mood.md' }, { kind: 'tool', target: 'review.html' },
  ] };
  assert.deepEqual(h.pagesFor(w), ['t_mood.md']);
  assert.ok(/data-ratekey="c0"/.test(h.rateRowHtml(w, 'c0', { checks: {} })), 'unrated shows buttons');
  assert.ok(!/data-ratekey/.test(h.rateRowHtml(w, 'c0', { checks: {}, rates: { c0: 2 } })), 'rated is one-shot');
});
```

- [ ] Run: fails (`could not locate function pagesFor(`).
- [ ] Insert above `function checklist(` (:131):

```js
  /*__PRACTICE_EVENTS__*/
  function pagesFor(w){ return (w.links||[]).filter(function(l){return l.kind==='page';}).map(function(l){return l.target;}); }
  function rateRowHtml(w,key,r){ if(r.rates&&r.rates[key]!=null)return '<div class="ratedone">Rated — this feeds your weak-spot engine on the home page.</div>'; return '<div class="raterow" role="group" aria-label="How close was your version to the example?">'+['Again','Hard','Good','Easy'].map(function(g,i){return '<button type="button" class="ratebtn" data-rate="'+i+'" data-ratekey="'+esc(key)+'">'+g+'</button>';}).join('')+'</div>'; }
  /* ---- end self-rating helpers ---- */
```

- [ ] `checklist()` (:139) — old: `+(on?'<div class="example" id="'+exampleId+'"><span class="example-label">One way to say it</span><p>'+esc(item.example)+'</p></div>':'')` → new: `+(on?'<div class="example" id="'+exampleId+'"><span class="example-label">One way to say it</span><p>'+esc(item.example)+'</p></div>'+rateRowHtml(w,key,r):'')`
- [ ] Click handler — in the `app.addEventListener('click', ...)` line (:143), insert before the `[data-reset]` branch:

```js
if(ev.target.closest&&ev.target.closest('[data-ratekey]')){var rb=ev.target.closest('[data-ratekey]');var w2=week(),r2=record(w2.id);r2.rates=r2.rates||{};var key2=rb.getAttribute('data-ratekey');if(r2.rates[key2]==null){var q2=parseInt(rb.getAttribute('data-rate'),10);r2.rates[key2]=isNaN(q2)?0:q2;state.progress.completed[w2.id]=r2;saveProgress();recordPracticeEvent({tool:'one-patient-six-weeks',caseId:w2.id,cats:[],pages:pagesFor(w2),q:r2.rates[key2]});render();}return;}
```

- [ ] CSS (append near `.example` rules): `.raterow{display:flex;gap:6px;margin:6px 0 0}.ratebtn{font:inherit;font-size:.78rem;border:1px solid var(--border);background:var(--surface);border-radius:8px;padding:4px 10px;cursor:pointer}.ratebtn:hover{border-color:var(--accent)}.ratedone{font-size:.75rem;color:var(--text-mid);margin-top:6px}`
- [ ] Run to pass + full gate; commit: `git add 08_Cases_and_Simulation/one-patient-six-weeks.html tests/practice-events.test.mjs && git commit -m "feat(one-patient): self-rate reveals; ratings feed the practice-event ledger"`

**PR boundary:** branch `feat/one-patient-self-rating`, PR title **"Close the practice→mastery loop (3a): one-patient self-rating on reveals"**. CI: build-test-validate + smoke. Depends on Batch 5. PR body flags the #263 overlap for the rebase.

### Task 12: Interview Room minimal debrief summary write

**Files:**
- Modify: `_prototypes/sp-interview/sp-interview.html` — inline adapter near `var STATUS_WORD` (:470); hook in `toDebrief()` (:803)
- Regenerate: `_prototypes/sp-interview/sp-interview.preview.html` (via the generator — never by hand)

**Interfaces:** One event per encounter at debrief entry: `{tool:'sp-interview', caseId, cats: CASE_BLUEPRINT[caseId]||[], pages:[], q}` where `q` maps the deterministic coverage (`observed`/`partial`/`missed`, `na` excluded) — ≥80% observed→3, ≥50%→2, >0→1, else 0. **Inline copy, not the marker:** sp-interview must stay byte-identical between source and the generator's canonical transform, and the mock provider must work offline from source — a build-time-only injection would leave the source (and generated preview) without the function. The inline copy carries a header pointing at the canonical contract file.

**Steps:**

- [ ] Branch: `git checkout -b feat/sp-interview-debrief-event origin/main`
- [ ] Insert below `var STATUS_WORD={...};` (:470):

```js
/* Practice-event write (inline copy of site_build/practice_events.js — this file is
   the generator's canonical source and must run offline unmodified, so it cannot
   use the build-injected marker; keep field semantics in sync with that file). */
var PRACTICE_EVENTS_KEY='cw_practice_events_v1';
var PRACTICE_EVENTS_CAP=500;
function recordPracticeEvent(ev){
  try{
    var s=JSON.parse(localStorage.getItem(PRACTICE_EVENTS_KEY)||'null');
    if(!s||s.v!==1||!Array.isArray(s.events)) s={v:1,events:[]};
    s.events.push({tool:String(ev.tool||''),caseId:String(ev.caseId||''),cats:Array.isArray(ev.cats)?ev.cats:[],pages:Array.isArray(ev.pages)?ev.pages:[],q:(typeof ev.q==='number'?ev.q:null),ts:Date.now()});
    if(s.events.length>PRACTICE_EVENTS_CAP) s.events=s.events.slice(s.events.length-PRACTICE_EVENTS_CAP);
    localStorage.setItem(PRACTICE_EVENTS_KEY,JSON.stringify(s));
  }catch(_){}
}
var CASE_BLUEPRINT={sp_depression_gated_si_001:['mood','safety'],sp_mania_redirect_001:['mood'],sp_psychosis_paranoid_001:['psychosis']};
function debriefQuality(session){
  var cov=computeCoverage(session).filter(function(c){return c.status!=='na';});
  if(!cov.length)return 0;
  var got=cov.filter(function(c){return c.status==='observed';}).length;
  var p=got/cov.length;
  return p>=0.8?3:(p>=0.5?2:(p>0?1:0));
}
var _lastLoggedEncounter=null;
```

- [ ] Hook `toDebrief()` (:803) — old: `    setS(Object.assign({},S,{screen:'debrief'}));` → new:

```js
    setS(Object.assign({},S,{screen:'debrief'}));
    try{ if(_lastLoggedEncounter!==E.encounterId){ _lastLoggedEncounter=E.encounterId; recordPracticeEvent({tool:'sp-interview',caseId:E.caseDef.id,cats:CASE_BLUEPRINT[E.caseDef.id]||[],pages:[],q:debriefQuality(E.session)}); } }catch(_){ }
```

- [ ] Regenerate the preview (mandatory): `node _prototypes/sp-interview/generate-preview.mjs --write`
- [ ] Run the SP suites + root tests: `node --test _prototypes/sp-interview/tests/ && node --test tests/*.test.mjs` → all pass (no pack edit → the review-filter synthetic-pack negative test and byte-reproducibility test must both stay green; if the reproducibility test fails, the preview was not regenerated).
- [ ] Full gate: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green.
- [ ] Commit: `git add _prototypes/sp-interview/sp-interview.html _prototypes/sp-interview/sp-interview.preview.html && git commit -m "feat(sp-interview): minimal debrief summary write to the practice-event ledger"`

**PR boundary:** branch `feat/sp-interview-debrief-event`, PR title **"Close the practice→mastery loop (3b): Interview Room debrief event"**. CI: build-test-validate + smoke (interview-room specs use the structural caseCard()/supportedButton() helpers and are unaffected — no persona/pack change here). Depends on Batch 5.

---

## Batch 7 — Spread the retrieval pattern

### Task 13: Diagnostic-reasoning Practice mode (REAS# namespace)

*Sequenced explicitly AFTER Batch 1 (home counters are honest — new REAS# cards land in the `other` bucket, never inflating "Due today") and Batch 2 (canonical grader marker available).*

**Files:**
- Modify: `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html` — SRS adapter + mode toggle + practice renderer + handlers; add `var DAY = 86400000;` + `/*__SM2_APPLY_GRADE__*/`
- Modify: `tests/family-srs-parity.test.mjs` — add the 4th consumer
- Test: extend `tests/practice-events.test.mjs` (adapter unit)

**Interfaces:** Cards `REAS#<caseId>#<stepId>` in `cw_srs_v1` (cards only — never stats). Practice mode per case: generate aloud → reveal the step's `best` choice + feedback → self-rate Again/Hard/Good/Easy → canonical `applyGrade` schedules; each rating also writes a practice event (`q` = 0–3 by button index).

**Steps:**

- [ ] Branch: `git checkout -b feat/diagnostic-reasoning-practice-mode origin/main`
- [ ] Failing parity extension: in `tests/family-srs-parity.test.mjs` add `'02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html',` to `CONSUMERS`. Run `node --test tests/family-srs-parity.test.mjs` → 1 failure (missing marker).
- [ ] Failing adapter test (append to `tests/practice-events.test.mjs`):

```js
test('diagnostic-reasoning REAS# grading writes cards only — never stats', () => {
  const ls = memStorage();
  // eslint-disable-next-line no-new-func
  const gradeReas = new Function('localStorage', `
    var DAY=86400000;
    function applyGrade(card,grade){ var c=Object.assign({},card); c.reps=(c.reps||0)+1; c.ivl=1; c.due=Date.now()+DAY; c.last=Date.now(); return c; }
    ${srcSlice(drSourceCurrent(), 'var REAS_SRS_KEY=', '/* ---- end reas srs adapter ----')}
    srsGradeReas('c1','s1','Good');
    return JSON.parse(localStorage.getItem('cw_srs_v1'));`);
  const s = gradeReas(ls);
  assert.ok(s.cards['REAS#c1#s1']);
  assert.equal(s.stats.totalReviews, 0, 'sims never write cw_srs_v1.stats');
});
```

  (Add `const drSourceCurrent = () => readFileSync(new URL('../02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html', import.meta.url), 'utf8');` beside the other loaders so the test re-reads the edited file rather than the module-load snapshot.)
- [ ] Implement in `diagnostic-reasoning.html`. (a) Below the Task 8 `QUALITY_GRADE` line insert:

```js
var DAY = 86400000;
/*__SM2_APPLY_GRADE__*/
var REAS_SRS_KEY='cw_srs_v1';
function reasFresh(){return {v:1,cards:{},day:{lastDay:'',newToday:0},stats:{streak:0,lastStudy:'',totalReviews:0,correct:0,seen:0},settings:{newPerDay:12}};}
function reasLoadStore(){try{var s=JSON.parse(localStorage.getItem(REAS_SRS_KEY)||'null');if(s&&s.v===1){s.cards=s.cards||{};s.stats=s.stats||reasFresh().stats;return s;}}catch(_){}return reasFresh();}
function reasSaveStore(s){try{localStorage.setItem(REAS_SRS_KEY,JSON.stringify(s));}catch(_){}}
function reasCardId(caseId,stepId){return 'REAS#'+caseId+'#'+stepId;}
function srsGradeReas(caseId,stepId,grade){
  var s=reasLoadStore(), id=reasCardId(caseId,stepId);
  var card=s.cards[id]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0};
  s.cards[id]=applyGrade(card,grade);
  /* cards only — never stats: see the injected snippet's stats contract */
  reasSaveStore(s);
  return s.cards[id];
}
function srsDueForReasCase(caseId,steps){
  var s=reasLoadStore(), now=Date.now(), out={due:0,started:0,total:(steps||[]).length};
  (steps||[]).forEach(function(st){var c=s.cards[reasCardId(caseId,st.id)];if(c){out.started++;if(c.due<=now)out.due++;}});
  return out;
}
function bestChoice(st){ return (st.choices||[]).filter(function(ch){return ch.quality==='best';})[0]||null; }
/* ---- end reas srs adapter ---- */
```

  (b) Add `mode:'cases'`, `pRevealed:{}`, `pGraded:{}` to the tool's `state` initializer; reset both maps when the case changes. (c) Add a mode toggle + practice renderer modeled byte-for-byte on family's `modeToggleHtml`/`practiceHtml` (labels `Cases` / `Practice`), where each step card's prompt is `st.prompt` with the instruction "Say your approach out loud, then compare", the reveal body is `bestChoice(st).text` + `bestChoice(st).feedback`, cards are ordered due-first via `srsDueForReasCase`, and the rate handler is:

```js
    var rt=ev.target.closest&&ev.target.closest('[data-rate]');
    if(rt){var c2=currentCase(),sid=rt.getAttribute('data-prompt'),g=rt.getAttribute('data-rate');state.pGraded[sid]=srsGradeReas(c2.id,sid,g);recordPracticeEvent({tool:'diagnostic-reasoning',caseId:c2.id,cats:[],pages:c2.linkedPages||[],q:['Again','Hard','Good','Easy'].indexOf(g)});render();return;}
```

- [ ] Run to pass: `node --test tests/family-srs-parity.test.mjs tests/practice-events.test.mjs` → all pass.
- [ ] Full gate + built-page check: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res && grep -c "function applyGrade(card, grade)" _build/ms3/tools/diagnostic-reasoning.html` → gates green, grep prints `1`.
- [ ] Commit: `git add 02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html tests/family-srs-parity.test.mjs tests/practice-events.test.mjs && git commit -m "feat(reasoning): generate-reveal-rate Practice mode feeding cw_srs_v1 (REAS#)"`

**PR boundary:** branch `feat/diagnostic-reasoning-practice-mode`, PR title **"Diagnostic Reasoning: active-retrieval Practice mode (REAS# cards)"**. CI: build-test-validate + smoke; the always-visible mode toggle may move the visual baseline for this page — if the visual spec diffs, run "Refresh visual baselines" workflow_dispatch after merge. Depends on Batches 1, 2, 5. Supersedes future-work §1 bullet 1 (the `RSN#` name there is superseded by `REAS#` per the audit).

### Task 14: **[JOSH]** Scenario-specific family retrieval prompts (content)

**Files:**
- Modify: `family_systems_scenarios.json` — add a `retrieval` array to each of the 8 scenarios (schema already supports it; today 0 of 8 use it)

**Interfaces:** Prompt shape `{id, prompt, revealFrom}` (reveal pulled from the scenario's own attested sections — no new clinical claims). Reusing ids `opening`/`ask`/`avoid` where the reveal source matches the defaults preserves learners' existing FAM# schedules; new ids (`say`, `safety`, `handoff`, `prepare`) create new cards.

**Steps:**

- [ ] Branch: `git checkout -b content/family-scenario-retrieval origin/main`
- [ ] Agent drafts the 8 `retrieval` arrays (verified: every scenario has all six non-empty sections, so every `revealFrom` below resolves):

```json
"collateral_baseline_safety_001": [
  {"id": "opening", "prompt": "You have the mother on the phone. Say your first two sentences — including who you are and what you can and cannot share.", "revealFrom": "opening"},
  {"id": "ask", "prompt": "Name the three baseline questions you most need from this caller — function before the episode, not just symptoms.", "revealFrom": "ask"},
  {"id": "safety", "prompt": "Say exactly how you would ask this family about firearms in the home — plainly, without a euphemism.", "revealFrom": "safety"}
],
"family_meeting_opening_001": [
  {"id": "opening", "prompt": "The family is seated and tense. Say your opening frame: who you are, what this meeting is for, and how long you have.", "revealFrom": "opening"},
  {"id": "say", "prompt": "Say one sentence that names the family's work so far before you deliver any clinical update.", "revealFrom": "say"},
  {"id": "avoid", "prompt": "Name the opening move that derails this meeting — what will you deliberately not do first?", "revealFrom": "avoid"}
],
"discharge_barrier_map_001": [
  {"id": "ask", "prompt": "List aloud the concrete barrier questions you would ask before proposing any discharge date.", "revealFrom": "ask"},
  {"id": "say", "prompt": "Say how you would present the discharge plan so the family hears a plan, not an eviction.", "revealFrom": "say"},
  {"id": "handoff", "prompt": "Give the one-sentence barrier summary you would hand to the outpatient team.", "revealFrom": "handoff"}
],
"high_expressed_emotion_001": [
  {"id": "say", "prompt": "The father says 'If he just tried harder this wouldn't happen.' Say your reframe out loud — criticism into concern, without shaming him.", "revealFrom": "say"},
  {"id": "avoid", "prompt": "Name the responses that escalate a high-EE room — what will you not say back?", "revealFrom": "avoid"},
  {"id": "prepare", "prompt": "Before entering, say what you will watch for in yourself when the criticism starts.", "revealFrom": "prepare"}
],
"psychosis_family_psychoeducation_001": [
  {"id": "say", "prompt": "Explain what psychosis is to this family in three sentences — no jargon, no prognosis promises.", "revealFrom": "say"},
  {"id": "ask", "prompt": "Name the questions that tell you what this family already believes about the illness.", "revealFrom": "ask"},
  {"id": "avoid", "prompt": "Name the explanation traps — what framings would you deliberately avoid?", "revealFrom": "avoid"}
],
"family_involvement_boundaries_001": [
  {"id": "safety", "prompt": "Say how you would explain the limits of what you can share when involvement may be harming the patient.", "revealFrom": "safety"},
  {"id": "say", "prompt": "Say the sentence that holds the boundary while keeping the door open for the family.", "revealFrom": "say"},
  {"id": "avoid", "prompt": "Name what you must not promise this family — and what you must not promise the patient.", "revealFrom": "avoid"}
],
"caregiver_baseline_adaptations_001": [
  {"id": "ask", "prompt": "Say the questions that establish this patient's real baseline from the caregiver — routines, supports, what changed.", "revealFrom": "ask"},
  {"id": "say", "prompt": "Say how you would ask about caregiver strain without making the caregiver defend themselves.", "revealFrom": "say"},
  {"id": "handoff", "prompt": "Give the adaptation summary you would write for the team taking over.", "revealFrom": "handoff"}
],
"culture_interpreter_family_001": [
  {"id": "prepare", "prompt": "Before the interpreted meeting: say the pre-brief you would give the interpreter.", "revealFrom": "prepare"},
  {"id": "say", "prompt": "Say your first sentences to the family through the interpreter — addressed to the family, not the interpreter.", "revealFrom": "say"},
  {"id": "avoid", "prompt": "Name the interpreter-meeting mistakes you will deliberately avoid.", "revealFrom": "avoid"}
]
```

- [ ] Validate: `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py && python3 -c "
import json
d=json.load(open('family_systems_scenarios.json'))
for sc in d['scenarios']:
    for rp in sc.get('retrieval', []):
        src = sc.get('opening') if rp['revealFrom']=='opening' else (sc.get('sections') or {}).get(rp['revealFrom'])
        assert src, (sc['id'], rp['id'])
print('all retrieval reveals resolve')"` → both pass.
- [ ] Full gate: `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → green.
- [ ] Commit + PR: `git add family_systems_scenarios.json && git commit -m "content(family): scenario-specific retrieval prompts for all 8 scenarios" && gh pr create --base main --title "[NEEDS FACULTY REVIEW] Family systems: scenario-specific retrieval prompts" --body "All reveals are existing scenario sections — no new clinical claims. Dr. Moss: review the 24 prompt wordings in the diff before merge."`
- [ ] **[JOSH]** Review the 24 prompt wordings in the PR diff (`https://github.com/jmoss333/psychiatry-clerkship/pulls` → this PR → Files changed). Edit any wording directly on the branch or comment; then approve/merge. No separate attestation surface is created — reveals are pre-existing scenario content tracked by the scenarios' own `facultyReview` blocks.

**PR boundary:** branch `content/family-scenario-retrieval`, PR title as above. CI: build-test-validate + smoke. Supersedes future-work §2 "scenario-specific prompts" bullet and the "per-scenario capability 100% unused" audit note.

---

## Explicitly deferred (register, do not do here)

- Teaching review.html a "family deck" card type (full Daily-Review unification — future-work §2 bullet 3): superseded in the near term by Batches 3–4, which make every bucket servable *somewhere honest*; revisit only if the split-tile UX proves confusing.
- Communication-practice multi-turn branching, one-patient branching arcs, resident reasoning-bank toggle (future-work §1): out of WS3 scope.
- `rp_*` resident store isolation: unchanged by design (separate audience contract).
