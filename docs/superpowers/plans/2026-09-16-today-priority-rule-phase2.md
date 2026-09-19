# "One Thing First" — Phase 2 (interrupted practice, F3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A question set started from a timed block and interrupted resumes as the block's own step: the capsule remembers it came from a block, Today's Resume card and the block card both route to `?resume=1&block=1&n=…[&cat=…]`, and finishing the resumed set marks the block's question step through the existing receipt.

**Architecture:** Additive capsule fields (`fromBlock`, `n`, `cat`) written by `checkpointSession` and read back by `tryResumeSession`; one pure helper `fdBlockResumeSearch(step, capsule)` in `fd_block.js` that both the shell's `fdBlockContinue` and `fd_due.js`'s `fdResumeCard` use, so the resume route is built in exactly one place; the receipt already matches `block`/`n`/`cat` from the URL and ignores `resume`, so no receipt change. `init` already tries resume before block.

**Tech Stack:** as Phase 1 (ES5 `frontdoor/*.js`, `node:test`, Playwright, Python build gate).

**Spec:** `docs/superpowers/plans/2026-09-16-today-priority-rule-handoff.md` §4 and §7 B1–B4. Phase 1 is PR #662.

## Global Constraints

Everything in the Phase 1 plan's Global Constraints, plus:

- `tests/block-wiring.test.mjs:34–40` pins in `question-bank-practice.html`: `sp.get('block')!=='1'`, `startSession(_blockCat, 'all', String(BLOCK_REQUEST.n))`, `blockKind:(SESSION&&SESSION.fromBlock)?'qb':null`, `SESSION.fromBlock = true`, `ref:'question-bank-practice.html'`. Keep every one byte-exact.
- `tests/sess-capsule.test.mjs:53` pins `sessLoad` as the snippet's first function line under 60 chars — the snippet (`sess_capsule.js`) is **not** edited in this phase; the capsule fields are written by the question bank, and readers guard shape.
- `tests/resume-card.test.mjs:32` and `tests/fd-due.test.mjs:46` pin the plain resume href `?tool=question-bank-practice.html&amp;resume=1` for a capsule **without** `fromBlock`; that stays byte-identical.
- `cwReceiptMatchesBlock` (session_receipt.js:79) requires exactly one `block=1`, exactly one `n` equal to the step's `n`, and `cat` present iff the step has one. The resume route must satisfy that with `resume=1` as the only extra parameter.
- No new storage key; `cw_sess_v1` gains optional fields only.

## Ground truth (2026-09-16, on the branch that merged #662's tree)

`question-bank-practice.html`: `BLOCK_REQUEST` 174, `RESUME_REQUESTED` 168, `startSession` 783 (SESSION shape 813–822, no category field today), `checkpointSession` 846, `tryResumeSession` 876 (SESSION rebuilt at ~896), `advance` 1083, `showSummary` 1092 (`sessClear('qbank')` on completion), receipt call 660–669 (`context` uses `SESSION.catLabel`), `init` 1109 (resume-before-block at 1127–1131). `spa_index.html`: `fdOpenBlockStep` 1959, `fdBlockContinue` 1970. `session_receipt.js`: block line at 221 renders `Block · D of T done` / `Block complete · T of T done`. Counter: `progLabel.textContent = 'Question '+(idx+1)+' of '+total` (715). Re-anchor with `grep -n` before quoting in commit messages.

---

### Task 1: The capsule remembers its block (question bank)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` — `checkpointSession` (~846), `tryResumeSession` (~896 SESSION literal), `init` block branch (~1131)
- Test: `tests/block-wiring.test.mjs` (source pins), `tests/session-receipt.test.mjs`

**Interfaces:**
- Produces capsule fields: `fromBlock:boolean`, `n:number` (queue length), `cat:string|null`. `SESSION.cat` (block category or null) alongside the existing `SESSION.catLabel`.

- [ ] **Step 1: Write the failing pins**

Append to `tests/block-wiring.test.mjs`:

```js
test('an interrupted block session checkpoints its block identity and resumes as a block session', () => {
  const checkpoint = qbank.slice(qbank.indexOf('function checkpointSession('), qbank.indexOf('function tryResumeSession('));
  assert.match(checkpoint, /fromBlock: SESSION\.fromBlock===true/);
  assert.match(checkpoint, /n: SESSION\.queue\.length/);
  assert.match(checkpoint, /cat: SESSION\.cat\|\|null/);
  const resume = qbank.slice(qbank.indexOf('function tryResumeSession('), qbank.indexOf('function showQuestion('));
  assert.match(resume, /SESSION\.fromBlock = cap\.fromBlock===true;/);
  assert.match(resume, /SESSION\.cat = \(typeof cap\.cat==='string'&&CAT_LABELS\[cap\.cat\]\)\?cap\.cat:null;/);
  assert.match(qbank, /SESSION\.cat = _blockCat==='all' \? null : _blockCat;/, 'a block start records its category on the session');
  assert.ok(qbank.indexOf('RESUME_REQUESTED && tryResumeSession()') < qbank.indexOf('if(BLOCK_REQUEST){'),
    'resume is tried before a fresh block start, so ?resume=1&block=1 restores rather than restarts');
});
```

Append to `tests/session-receipt.test.mjs`:

```js
test('a resumed block session (?resume=1&block=1&n) still marks the block step — resume is the only extra parameter', () => {
  const ls = memStorage(); const F = withStore(ls, '?resume=1&block=1&n=4');
  F.blockSave({ v: 1, minutes: 10, createdAt: NOW - 60000, steps: [
    { kind: 'page', ref: 't_psychosis.md', min: 5, title: 'Psychosis', done: undefined },
    { kind: 'qb', ref: 'question-bank-practice.html', n: 4, min: 3, title: '4 practice questions' },
  ] });
  ls.setItem('cw_progress_v1', JSON.stringify({ 't_psychosis.md': { done: true, at: '2026-09-01' } }));
  const r = F.cwReceipt(base());
  assert.equal(F.blockLoad(NOW).steps[1].done, true, 'the qb step is marked on a resumed session');
  assert.match(r.html, /Block complete · 2 of 2 done/);
  assert.equal(F.blockLoad(NOW), null, 'the finished block is cleared');
});
```

- [ ] **Step 2: Run, confirm red**

```bash
node --test tests/block-wiring.test.mjs tests/session-receipt.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: the block-wiring pin fails (fields absent); the receipt test passes already if `cwReceiptMatchesBlock` ignores `resume` (it does — then it is a regression guard, keep it).

- [ ] **Step 3: Edit `checkpointSession`**

```js
function checkpointSession(){
  if(!SESSION || SESSION.reviewOnly) return;
  var now = Date.now();
  sessSave('qbank', {
    at: now,
    expiresAt: now + DAY,
    queueIds: SESSION.queue.map(function(it){ return it.id; }),
    idx: SESSION.idx,
    responses: SESSION.responses.map(function(r){
      return { id: r.item.id, correct: r.correct, confidence: r.confidence };
    }),
    /* Block identity (2026-09-16): a set the timed block opened resumes AS that block's step
       (?resume=1&block=1&n[&cat]), so the receipt at the end can still mark it. Additive —
       every reader guards the shape; a capsule without these is an ordinary resume. */
    fromBlock: SESSION.fromBlock===true,
    n: SESSION.queue.length,
    cat: SESSION.cat||null
  });
}
```

- [ ] **Step 4: Edit `tryResumeSession` — after the `SESSION = {…};` literal and before `showQuestion();`**

```js
  SESSION.fromBlock = cap.fromBlock===true;
  if(SESSION.fromBlock){
    SESSION.cat = (typeof cap.cat==='string'&&CAT_LABELS[cap.cat])?cap.cat:null;
    SESSION.catLabel = SESSION.cat?(CAT_LABELS[SESSION.cat]||''):'';
  }
```

- [ ] **Step 5: Edit the block-start branch in `init`**

Replace
```js
        if(SESSION){ SESSION.catLabel = _blockCat==='all' ? '' : (CAT_LABELS[_blockCat]||''); SESSION.fromBlock = true; }
```
with
```js
        if(SESSION){ SESSION.catLabel = _blockCat==='all' ? '' : (CAT_LABELS[_blockCat]||''); SESSION.fromBlock = true; SESSION.cat = _blockCat==='all' ? null : _blockCat; }
```
(`SESSION.fromBlock = true` stays byte-exact for the existing pin.)

- [ ] **Step 6: Run the suite, commit**

```bash
node --test tests/*.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
git add 13_Faculty_Resources/_automation/site_build/question-bank-practice.html tests/block-wiring.test.mjs tests/session-receipt.test.mjs
git commit -m "feat(qbank): the session capsule remembers the block it came from

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: One resume route, built in one place (`fd_block.js`), used by the shell

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_block.js` (add `fdBlockResumeSearch` after `fdBlockRouteForStep`; `fdBlockCard` honours `opts.resume`)
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` `fdBlockContinue`
- Test: `tests/fd-block.test.mjs`, `tests/block-wiring.test.mjs`

**Interfaces:**
- Produces: `fdBlockResumeSearch(step, capsule) → string|null` — `'?tool=question-bank-practice.html&resume=1&block=1&n=<step.n>[&cat=<step.cat>]'` when `step.kind==='qb'`, `capsule.fromBlock===true` and `fdCapsuleLeft(capsule)>=1`; otherwise `null`. `fdBlockCard(..., {resume:{left,n}})` renders the live Continue as `Resume: <left> of <n> questions left →`.

- [ ] **Step 1: Failing tests**

Append to `tests/fd-block.test.mjs` (harness already loads `fd_due.js`, so `fdCapsuleLeft` is in scope; add `fdBlockResumeSearch` to the returned object on line 20):

```js
test('an interrupted block question step resumes its own capsule, with the block parameters the receipt reads', () => {
  const step = { kind: 'qb', ref: 'question-bank-practice.html', n: 6, cat: 'mood' };
  const capsule = { queueIds: ['a', 'b', 'c', 'd', 'e', 'f'], idx: 2, fromBlock: true, n: 6, cat: 'mood' };
  assert.equal(F.fdBlockResumeSearch(step, capsule), '?tool=question-bank-practice.html&resume=1&block=1&n=6&cat=mood');
  assert.equal(F.fdBlockResumeSearch({ kind: 'qb', n: 4, cat: null }, capsule), '?tool=question-bank-practice.html&resume=1&block=1&n=4');
  assert.equal(F.fdBlockResumeSearch(step, Object.assign({}, capsule, { fromBlock: false })), null, 'a set the learner started on their own is not the block\'s');
  assert.equal(F.fdBlockResumeSearch(step, Object.assign({}, capsule, { idx: 6 })), null, 'nothing left to resume');
  assert.equal(F.fdBlockResumeSearch({ kind: 'page', ref: 'a.md' }, capsule), null);
  assert.equal(F.fdBlockResumeSearch(step, null), null);
});

test('the live card offers Resume with the remaining count when the shell passes opts.resume', () => {
  const block = { minutes: 10, steps: [
    { kind: 'page', ref: 'a.md', title: 'Alpha', min: 5 },
    { kind: 'qb', title: '6 practice questions', min: 5, n: 6 },
  ] };
  const html = F.fdBlockCard(null, 10, block, { 'a.md': true }, { primary: false, resume: { left: 4, n: 6 } });
  assert.match(html, /<button type="button" class="fd-btn fd-btn--accent" data-block-continue="1">Resume: 4 of 6 questions left →<\/button>/);
  assert.match(F.fdBlockCard(null, 10, block, { 'a.md': true }, { resume: { left: 1, n: 6 } }), /Resume: 1 of 6 questions left →/);
  assert.match(F.fdBlockCard(null, 10, block, { 'a.md': true }), /Continue: 6 practice questions →/, 'no capsule, no resume wording');
});
```

Append to `tests/block-wiring.test.mjs`:

```js
test('Continue on a live block resumes an interrupted question set instead of starting a fresh one', () => {
  const cont = shell.slice(shell.indexOf('function fdBlockContinue('), shell.indexOf('function fdLiveState('));
  assert.match(cont, /fdBlockResumeSearch\(status\.next, *sess\)/);
  assert.match(cont, /fdOpenRef\(status\.next\.ref, *resume\)/);
  assert.match(cont, /fdOpenBlockStep\(status\.next\)/, 'the fresh-start route remains the fallback');
});
```

- [ ] **Step 2: Run, confirm red** — `node --test tests/fd-block.test.mjs tests/block-wiring.test.mjs`.

- [ ] **Step 3: `fd_block.js` — add after `fdBlockRouteForStep`**

```js
/* An interrupted block question step resumes its own capsule instead of starting a fresh set.
   ?resume=1 restores the queue; block=1&n[&cat] stay exactly as the receipt matches them, so
   finishing the resumed set still marks the step. Null means "no capsule to resume": the
   caller falls back to fdBlockRouteForStep. */
function fdBlockResumeSearch(step, capsule){
  var s=step||{}, c=capsule||{};
  if(s.kind!=='qb'||c.fromBlock!==true||fdCapsuleLeft(c)<1) return null;
  return '?tool=question-bank-practice.html&resume=1&block=1&n='+encodeURIComponent(String(s.n||5))+(s.cat?'&cat='+encodeURIComponent(String(s.cat)):'');
}
```

In `fdBlockCard`, replace the live Continue line
```js
      out+='<button type="button" class="'+actionCls+'" data-block-continue="1">Continue: '+fdEsc(status.next.title)+' →</button>';
```
with
```js
      var resume=o.resume&&typeof o.resume.left==='number'&&typeof o.resume.n==='number'?o.resume:null;
      out+='<button type="button" class="'+actionCls+'" data-block-continue="1">'+
        (resume?('Resume: '+resume.left+' of '+resume.n+' questions left →'):('Continue: '+fdEsc(status.next.title)+' →'))+'</button>';
```

- [ ] **Step 4: `spa_index.html` — replace `fdBlockContinue`**

```js
  function fdBlockContinue(){
    var live=fdLiveState(fdController?fdController.getState():{});
    var block=blockLoad(live.nowMs);
    if(!block) return;
    var status=fdBlockStatus(block, live.done);
    if(!status.next){ blockClear(); specialRefresh(); return; }
    var sess=null;
    try{ sess=(typeof sessLoad==='function')?sessLoad('qbank'):null; }catch(_){ sess=null; }
    /* An interrupted question set resumes as the block's step; anything else starts fresh. */
    var resume=fdBlockResumeSearch(status.next, sess);
    if(resume) fdOpenRef(status.next.ref, resume);
    else fdOpenBlockStep(status.next);
  }
```

Also in `fdTodayLive`, pass the resume hint to the demoted block card. Replace
```js
      blockHtml=fdBlockCard(liveBlock?null:fdBlockPlan(FD_INDEX,liveForBlock,fdBlockMinutes,fdBlockInputs()),fdBlockMinutes,liveBlock,liveForBlock.done,{primary:primary.kind==='block'});
```
with
```js
      var blockResume=(blockStatus&&sess&&fdBlockResumeSearch(blockStatus.next,sess))?{left:fdCapsuleLeft(sess),n:blockStatus.next.n}:null;
      blockHtml=fdBlockCard(liveBlock?null:fdBlockPlan(FD_INDEX,liveForBlock,fdBlockMinutes,fdBlockInputs()),fdBlockMinutes,liveBlock,liveForBlock.done,{primary:primary.kind==='block',resume:blockResume});
```
(The Phase 1 pin `fdBlockCard\([^;]*\{primary:primary\.kind==='block'\}\)` must be widened to `\{primary:primary\.kind==='block',resume:blockResume\}` in `tests/block-wiring.test.mjs` — say so in the commit.)

- [ ] **Step 5: Run, commit** — `node --test tests/*.test.mjs`; commit `feat(block): Continue resumes an interrupted question set as the block's own step`.

---

### Task 3: The Resume card carries the block route and its progress line (`fd_due.js`)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js` `fdResumeCard`
- Modify: `spa_index.html` `fdTodayLive` resume call
- Test: `tests/fd-due.test.mjs`, `tests/block-wiring.test.mjs`

**Interfaces:**
- `fdResumeCard(capsule, primary, block)` — `block` is `{done,total,next}` (an `fdBlockStatus` result) or null. When `capsule.fromBlock===true` and `block&&block.next&&block.next.kind==='qb'`: href is `fdBlockResumeSearch(block.next, capsule)` with `&` escaped as `&amp;`, plus `<span class="fd-resume__block">Block · <done> of <total> done</span>` inside the link. Otherwise byte-identical to today.

Note `fd_due.js` loads BEFORE `fd_block.js` on the page and in the fd-due test harness, so `fdResumeCard` may not call `fdBlockResumeSearch` directly at parse time — it is only called at render time, when both are defined on the page. In `tests/fd-due.test.mjs` the harness must add `fd_block.js` (and `fd_today.js`, `fd_state.js`, `phase_policy.js`, `fd_edition_student.js` before it, in injection order) to the `new Function` body for the block-aware cases.

- [ ] **Step 1: Failing tests** (append to `tests/fd-due.test.mjs`; extend its harness as noted)

```js
test('a capsule from a block resumes with the block parameters and shows the block progress line', () => {
  const capsule = { queueIds: ['a', 'b', 'c', 'd', 'e', 'f'], idx: 2, fromBlock: true, n: 6, cat: null };
  const block = { done: 1, total: 2, next: { kind: 'qb', ref: 'question-bank-practice.html', n: 6, cat: null } };
  const out = F.fdResumeCard(capsule, true, block);
  assert.match(out, /href="\?tool=question-bank-practice\.html&amp;resume=1&amp;block=1&amp;n=6"/);
  assert.match(out, /<span class="fd-resume__block">Block · 1 of 2 done<\/span>/);
  assert.match(out, /4 left, ~3 min/);
  // Not from a block, or the block's next step is not the question set: today's markup.
  assert.equal(F.fdResumeCard(Object.assign({}, capsule, { fromBlock: false }), false, block), F.fdResumeCard(Object.assign({}, capsule, { fromBlock: false })));
  assert.equal(F.fdResumeCard(capsule, false, { done: 0, total: 2, next: { kind: 'page', ref: 'a.md' } }), F.fdResumeCard(capsule));
  assert.doesNotMatch(F.fdResumeCard(capsule), /block=1|fd-resume__block/, 'no block status passed, no block route');
});
```

Append to `tests/block-wiring.test.mjs`: `assert.match(today, /fdResumeCard\(sess,primary\.kind==='resume',blockStatus\)/);` inside the existing "picks exactly one primary" test (replace the current `fdResumeCard\(sess,primary\.kind==='resume'\)` line).

- [ ] **Step 2: Run, confirm red.**

- [ ] **Step 3: Edit `fdResumeCard`**

```js
function fdResumeCard(capsule, primary, block){
  var left=fdCapsuleLeft(capsule), isPrimary=primary===true, c=capsule||{}, b=block||null;
  if(left<1) return '';
  var minutes=Math.max(1,Math.round(left*45/60));
  /* A set the timed block opened resumes AS the block's step: the route carries block=1&n[&cat]
     so the receipt can mark it, and the card says where the block stands. Built by
     fdBlockResumeSearch (fd_block.js) so the shell's Continue and this link cannot drift. */
  var resumeSearch=(c.fromBlock===true&&b&&b.next&&b.next.kind==='qb'&&typeof fdBlockResumeSearch==='function')?fdBlockResumeSearch(b.next,c):null;
  var href=resumeSearch?resumeSearch.replace(/&/g,'&amp;'):'?tool=question-bank-practice.html&amp;resume=1';
  var blockLine=resumeSearch?'<span class="fd-resume__block">Block · '+b.done+' of '+b.total+' done</span>':'';
  return '<section class="'+(isPrimary?'fd-resume is-primary':'fd-resume')+'">'+
    '<h2 class="fd-sectionhead">'+(isPrimary?'Pick up where you left off':'Continue where you left off')+'</h2>'+
    '<a class="fd-resume__link" href="'+href+'">'+
      '<span>Resume question bank — '+left+' left, ~'+minutes+' min'+blockLine+'</span>'+
      '<span>Resume →</span>'+
    '</a></section>';
}
```
(Comment wording: no "let ", "const ", no "une" sequence — "resumes", "route", "block" are fine.)

- [ ] **Step 4: `spa_index.html` `fdTodayLive`** — change `resume:fdResumeCard(sess,primary.kind==='resume'),` to `resume:fdResumeCard(sess,primary.kind==='resume',blockStatus),`.

- [ ] **Step 5: CSS** — append to the One-Thing-First block at the end of `frontdoor.css`: `.fd-resume__block{display:block;font-size:var(--fd-font-xs);color:var(--fd-text-dim)}` and raise the CLASS-INVENTORY count by one (recompute with the node one-liner from the Phase 1 plan). Drift gate must stay clean.

- [ ] **Step 6: Run, commit** — `node --test tests/*.test.mjs`; `python3 bin/check_design_drift.py`; commit `feat(today): the Resume card resumes a block's question set with its progress line`.

---

### Task 4: Smoke B1–B4 (`tests/smoke/front-door.spec.js`, both audiences)

Reuse `OTF`, `seedApp`, `otfExpectOnePrimary` from Phase 1. Because the block plan's question count depends on the week's first unread page, the checks read `n` from the planner card rather than assuming 6.

```js
// ---- One Thing First Phase 2: an interrupted block resumes as the block's own step -----------
async function otfStartBlockFromToday(page) {
  await expect(page.locator('.fd-block:not(.is-live)')).toBeVisible();
  const steps = await page.locator('.fd-block:not(.is-live) .fd-block__step .fd-block__title').allTextContents();
  const qb = steps.find((t) => / practice questions?$/.test(t) || /practice questions? on /.test(t));
  expect(qb, `plan has a question step: ${steps.join(' | ')}`).toBeTruthy();
  const n = Number(qb.match(/^(\d+) practice/)[1]);
  await page.locator('[data-block-start]').click();
  return { steps, n };
}

// Confirmed against question-bank-practice.html (2026-09-16): confidence buttons are
// `.conf-btn[data-conf]` (466–469), options are `.opt[data-key]` inside `#optsList` (485–490),
// Next is `#nextBtn` (575), the counter is the element `progLabel` writes ("Question N of M", 715).
// Two-tier items show a second option list after the first pick; click its first `.opt` too.
async function otfAnswerOne(page) {
  const frame = page.frameLocator('iframe').first();
  await frame.locator('.conf-btn').first().click();
  await frame.locator('#optsList .opt').first().click();
  const tier2 = frame.locator('.opts .opt').nth(0);
  if (await frame.locator('#nextBtn').count() === 0) await tier2.click();
  await frame.locator('#nextBtn').click();
}

test('One Thing First B1–B3: an interrupted block question set resumes as the block\'s step and survives reload', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await seedApp(page, testInfo, { storage: {} });
  await page.goto('/');
  const { n } = await otfStartBlockFromToday(page);
  // First step is the week's first unread page: mark it done from the reader; the label leads with "Mark done ·".
  const marker = page.locator('.fd-article__actions [data-fd-toggle]');
  await expect(marker).toContainText(/^Mark done · /);
  await marker.click();
  await expect(page).toHaveURL(/tool=question-bank-practice\.html&block=1&n=\d+/);
  await otfAnswerOne(page);
  await otfAnswerOne(page);
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-resume.is-primary .fd-resume__block')).toHaveText('Block · 1 of 2 done');
  await expect(page.locator('.fd-primary .fd-resume__link')).toHaveAttribute('href', new RegExp(`resume=1&block=1&n=${n}$`));
  await expect(page.locator('.fd-block.is-live')).toHaveClass(/is-live/);
  await expect(page.locator('.fd-block.is-live [data-block-continue]')).toHaveText(`Resume: ${n - 2} of ${n} questions left →`);
  // B3: reload keeps the same primary
  await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
  await page.reload();
  await expect(page.locator('.fd-primary .fd-resume__block')).toHaveText('Block · 1 of 2 done');
  // B2: resume, counter continues, finish marks the block
  await page.locator('.fd-primary .fd-resume__link').click();
  await expect(page).toHaveURL(new RegExp(`resume=1&block=1&n=${n}`));
  await expect(page.frameLocator('iframe').first().locator('#progLabel, .prog-label').first()).toHaveText(`Question 3 of ${n}`);
  for (let i = 2; i < n; i += 1) await otfAnswerOne(page);
  await expect(page.frameLocator('iframe').first().locator('.cw-receipt__blockline')).toHaveText('Block complete · 2 of 2 done');
  expect(await page.evaluate(() => localStorage.getItem('cw_block_v1'))).toBeNull();
  await expectHealthy(page);
});

test('One Thing First B4: a block older than its TTL is pruned; the planner face returns and the primary falls through', async ({ page }, testInfo) => {
  const stale = Object.assign({}, OTF.block, { createdAt: OTF_NOW - 13 * OTF_HOUR });
  await seedApp(page, testInfo, { storage: { cw_block_v1: stale, cw_sess_v1: Object.assign({}, OTF.capsule, { sessions: { qbank: Object.assign({}, OTF.capsule.sessions.qbank, { fromBlock: true, n: 6, cat: null }) } }) } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-block:not(.is-live)')).toHaveCount(1);
  await expect(page.locator('.fd-block.is-live')).toHaveCount(0);
  // the orphaned capsule still resumes — as an ordinary set, because there is no block to be a step of
  await expect(page.locator('.fd-primary .fd-resume__link')).toHaveAttribute('href', '?tool=question-bank-practice.html&resume=1');
  await expect(page.locator('.fd-resume__block')).toHaveCount(0);
  await expectHealthy(page);
});
```

Implementer notes: the question bank runs inside the reader's tool iframe; confirm the confidence/option/next selectors from `question-bank-practice.html` (`.conf-btn`/`#nextBtn` are guesses to verify first — read the markup before running) and adjust the two locators in `otfAnswerOne`. The receipt's block line class is `cw-receipt__blockline` (session_receipt.js:221). Run with the alternate-port env line from the Phase 1 plan if 4200–4202 are busy.

---

### Task 5: Gates and PR

Same battery as Phase 1 Task 7–9: `node --test tests/*.test.mjs` → `bin/verify.sh` → both builds → drift gate → smoke (`-g "One Thing First"` + `frontdoor-runtime` + the field-guide tests, both audiences) → push → PR. PR body: what F3 does, the one pin widened (`block-wiring` block-card call), the capsule fields added (no new key), tests added, gates run, "Phase 3 gated on Josh".
