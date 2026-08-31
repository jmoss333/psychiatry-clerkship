# Fresh Eyes Audit — Lane A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Subagent-driven execution is disabled for this session by user instruction.)

**Goal:** Land the four agent-executable findings from the 2026-08-27 Fresh Eyes Audit — without regressing the crisis-query safety path the audit's own recommendation would have broken.

**Architecture:** Four independent batches, each its own commit and its own test cycle. Batch 1 changes a safety contract and lands first because everything else is cosmetic by comparison. Batch 4 is last because it touches six count-pin surfaces and a failure there is noisy.

**Tech Stack:** ES5 browser JS (no build step for `frontdoor/*.js` — snippets are concatenated by `inject_shared_snippets()`), Python 3 validators, `node:test` for contract tests, Playwright for smoke.

**Spec:** `docs/superpowers/specs/2026-08-28-fresh-eyes-audit-remediation-design.md`

## Global Constraints

- `frontdoor/*.js` is **ES5** — no `let`/`const`/arrow functions/template literals. Match surrounding style.
- localStorage keys stay `cw_*` / `rp_*`. The QA gate hard-fails any other prefix.
- No dose literals in `rp-*` / `*-trainer` tools.
- Never hand-edit `_build/`. Never hard-code a crisis number outside `crisis_resources.json`.
- `CLAUDE.md` and `AGENTS.md` must stay byte-identical (`cp CLAUDE.md AGENTS.md`) — CI fails the PR otherwise.
- A red node test **silently aborts the build**: `build_and_check.sh` is `set -euo pipefail` and runs `node --test tests/*.test.mjs` before `build_deploy.py`. Run the node suite first when a source edit isn't showing up in `_build/`.
- Verification per batch: `node --test tests/*.test.mjs`, then `build_and_check.sh ms3` and `res`.

---

### Task 1: Crisis vocabulary for the protocol pass (A1)

**Files:**
- Modify: `curriculum.json` — `safetyKit` (5 entries)
- Modify: `curriculum.schema.json` — `properties.safetyKit.items`
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py:347-372`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js:87`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js:200-216`
- Test: `tests/fd-search.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `fdSearchTriggerHit(triggers, paddedQuery) -> boolean` exported from the `make()` harness in `tests/fd-search.test.mjs`; kit records gain `.triggers` (array of lowercase strings).

- [ ] **Step 1: Write the failing tests**

Add to `tests/fd-search.test.mjs`, replacing the "protocol reachability" section comment:

```js
// ---- protocol reachability: explicit crisis vocabulary, not a stopword accident --------------
// Before 2026-08-28 the ONLY thing routing "i want to kill myself" to pg_suicide.md was the
// stopword "to" substring-matching inside "thoughts". The haystack carries none of
// kill/myself/die/suicidal and the synonyms map has no crisis terms, so filtering stopwords from
// the protocol pass -- as the Fresh Eyes Audit recommended -- returned ZERO protocols for it.
// safetyKit triggers make the routing explicit; these tests pin the vocabulary, not the accident.

const protocolRefs = (q) => F.fdSearchResults(REAL_INDEX, q, SYN, {})
  .filter((x) => x.kind === 'protocol').map((x) => x.item.ref);

for (const q of ['i want to kill myself', 'she said she wants to die',
                 'patient is suicidal', 'thinking about self harm']) {
  test(`"${q}" reaches the suicide protocol by trigger, not by stopword`, () => {
    assert.ok(protocolRefs(q).includes('pg_suicide.md'), `pg_suicide.md missing for "${q}"`);
  });
}

test('the crisis route does not depend on any stopword in the query', () => {
  // Strip every stopword and the protocol must STILL be reached. This is the regression guard:
  // it fails if someone reverts to matching on the unfiltered word list.
  assert.ok(protocolRefs('kill myself').includes('pg_suicide.md'));
  assert.ok(protocolRefs('wants die').includes('pg_suicide.md'));
});

test('a trigger matches whole words only, so "diet" does not summon the suicide sheet', () => {
  assert.equal(protocolRefs('diet and nutrition').includes('pg_suicide.md'), false);
});

test('stopwords no longer summon the safety kit for an ordinary content query', () => {
  // The A1 leak: "on"/"the" substring-matched every protocol haystack, so all five ranked above
  // the page the learner named, and Enter opened the suicide sheet.
  assert.deepEqual(protocolRefs('therapy on the unit'), []);
});

test('the exact-title query now returns that page first overall, not sixth', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'therapy on the unit', SYN, {});
  assert.equal(r[0].item.title, 'Therapy on the Unit');
});

test('every safety-kit protocol carries a non-empty trigger vocabulary', () => {
  for (const k of REAL_CUR.safetyKit) {
    assert.ok(Array.isArray(k.triggers) && k.triggers.length > 0, `${k.ref} has no triggers`);
    for (const t of k.triggers) {
      assert.equal(t, t.toLowerCase(), `trigger "${t}" on ${k.ref} must be lowercase`);
      assert.ok(t.trim() === t && t.length > 1, `trigger "${t}" on ${k.ref} is malformed`);
    }
  }
});

test('an all-stopword query still degrades to protocol-first (fail-safe, deliberate)', () => {
  // fdSearchContentWords never returns empty, so "on" keeps its words and the kit still shows.
  // Showing a safety sheet for a meaningless query is the safe direction; pinned so a future
  // tightening is a deliberate decision rather than a side effect.
  assert.equal(F.fdSearchResults(REAL_INDEX, 'on', SYN, {})[0].kind, 'protocol');
});
```

Then **update** the existing test at `tests/fd-search.test.mjs:256` — its premise inverts:

```js
test('searching a page title exactly returns that page at the head of the whole list', () => {
  // Before 2026-08-28 protocols were matched on the UNFILTERED query, so the stopwords in this
  // query brushed all five safety sheets and the exact title landed 6th of 8. The protocol pass
  // now filters stopwords (crisis routing moved to explicit triggers), so the title leads.
  const r = F.fdSearchResults(REAL_INDEX, 'therapy on the unit', SYN, {});
  assert.equal(r[0].kind, 'item');
  assert.equal(r[0].item.title, 'Therapy on the Unit');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fd-search.test.mjs`
Expected: FAIL — `pg_suicide.md has no triggers`, and `therapy on the unit` still returns 5 protocols.

- [ ] **Step 3: Add the trigger vocabulary to `curriculum.json`**

Replace the `safetyKit` block. Vocabulary is over-inclusive by design: a false positive shows a
safety sheet that wasn't needed; a false negative hides one that was.

```json
  "safetyKit": [
    { "ref": "pg_suicide.md", "sub": "Screen · stratify · safety plan",
      "triggers": ["suicidal", "suicide", "kill myself", "killing myself", "kill herself",
        "kill himself", "kill themselves", "want to die", "wants to die", "wanted to die",
        "better off dead", "end my life", "end her life", "end his life", "end it all",
        "self harm", "self-harm", "hurt myself", "hurt herself", "hurt himself",
        "cutting", "overdose", "od'd", "hanging", "wants to leave", "eloping"] },
    { "ref": "agitation.md", "sub": "Verbal first · PO before IM",
      "triggers": ["agitated", "agitation", "combative", "aggressive", "violent", "threatening",
        "hitting", "throwing", "restraint", "restraints", "seclusion", "escalating",
        "out of control", "swinging"] },
    { "ref": "exp_consult.md", "sub": "Choice · understand · appreciate · reason",
      "triggers": ["capacity", "refusing", "refuses", "refused", "declining", "declines",
        "ama", "against medical advice", "wants to leave", "leave the hospital", "consent",
        "decisional"] },
    { "ref": "t_sud.md", "sub": "Score · thiamine · escalate",
      "triggers": ["withdrawal", "withdrawing", "dts", "delirium tremens", "detox", "shakes",
        "shaking", "tremor", "tremulous", "ciwa", "cows", "last drink", "seizure",
        "alcohol withdrawal", "opioid withdrawal"] },
    { "ref": "delirium.md", "sub": "Vitals · meds · CAM",
      "triggers": ["delirious", "confused", "confusion", "disoriented", "altered mental status",
        "ams", "sundowning", "waxing and waning", "inattentive", "not making sense"] }
  ],
```

- [ ] **Step 4: Allow `triggers` in the schema**

`curriculum.schema.json`, `properties.safetyKit.items` — the object is `additionalProperties:false`,
so the key must be declared:

```json
      "required": ["ref", "sub", "triggers"],
      "additionalProperties": false,
      "properties": {
        "ref": { "type": "string", "minLength": 1 },
        "sub": { "type": "string", "minLength": 1 },
        "triggers": {
          "type": "array", "minItems": 1,
          "items": { "type": "string", "minLength": 2, "pattern": "^[a-z0-9'’ -]+$" }
        }
      }
```

- [ ] **Step 5: Enforce triggers in the validator**

`validate_curriculum.py`, inside the `for ent in kit:` loop, after the `sub` check:

```python
        triggers = ent.get("triggers")
        if not isinstance(triggers, list) or not triggers:
            bad("safetyKit", "entry '%s' needs a non-empty 'triggers' list -- the protocol pass "
                             "routes crisis queries by this vocabulary, not by stopword accident"
                % (ref,))
        else:
            for trig in triggers:
                if not isinstance(trig, str) or trig != trig.strip().lower() or len(trig) < 2:
                    bad("safetyKit",
                        "entry '%s' trigger %r must be a lowercase, trimmed string of 2+ chars"
                        % (ref, trig))
```

- [ ] **Step 6: Carry triggers onto the kit record**

`fd_data.js:87`:

```js
  var kit=[], ck=cur.safetyKit||[];
  for(var k=0;k<ck.length;k++){
    kit.push({ item: ensure(ck[k].ref, null), sub: ck[k].sub, triggers: (ck[k].triggers||[]).slice() });
  }
```

- [ ] **Step 7: Add the trigger pass and filter the protocol pass**

`fd_search.js` — add above `fdSearchResults`:

```js
/* Crisis routing is EXPLICIT vocabulary, not a side effect of stopword matching. Until 2026-08-28
   the only token in "i want to kill myself" that reached pg_suicide.md was the stopword "to",
   substring-matched inside "thoughts" -- so the leak that put five safety sheets above an
   exact-title query and the crisis path were the same mechanism, and removing one removed the
   other (measured; the Fresh Eyes Audit's proposed one-line fix returned zero protocols for it).
   Triggers are matched against the SPACE-PADDED raw query so they are whole-word/phrase: authors
   write "wants to die" the way a learner types it, and "diet" cannot match the trigger "die". */
function fdSearchTriggerHit(triggers, paddedQuery){
  var list=triggers||[];
  for(var i=0;i<list.length;i++){
    if(list[i]&&paddedQuery.indexOf(' '+list[i]+' ')!==-1) return true;
  }
  return false;
}
```

Then replace the protocol-pass block (`fd_search.js:200-216`), comment included:

```js
  /* Two ways into the safety kit, both deliberate. (1) an explicit trigger phrase -- the crisis
     vocabulary in curriculum.json's safetyKit, which is what carries plain-language queries.
     (2) the ordinary haystack match, now on the FILTERED word list: that is what closes the leak
     where "on"/"the" wildcard-matched every protocol and buried the page the learner named.
     fdSearchContentWords never returns empty, so an all-stopword query still surfaces the kit --
     fail-safe, pinned by test. */
  var paddedQuery=' '+rawQuery+' ';
  var protoResults=[];
  for(var kk=0;kk<kit.length;kk++){
    var kitItem=kit[kk].item;
    if(fdSearchTriggerHit(kit[kk].triggers, paddedQuery)||
       fdSearchHits(fdSearchHaystack(kitItem), rawQuery, contentWords)){
      protoResults.push({ item: kitItem, kind:'protocol', meta:'safety · protocol' });
      seenRefs[kitItem.ref]=true;
    }
  }
```

- [ ] **Step 8: Export the new function from the test harness**

`tests/fd-search.test.mjs`, in the `return { ... }` of `make()`, add:

```js
      fdSearchTriggerHit: fdSearchTriggerHit,
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test tests/fd-search.test.mjs`
Expected: PASS, all 40+ tests. Then `python3 13_Faculty_Resources/_automation/validate_curriculum.py` — expected: clean.

- [ ] **Step 10: Run the full node suite and both builds**

```bash
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- [ ] **Step 11: Commit**

```bash
git add curriculum.json curriculum.schema.json \
  13_Faculty_Resources/_automation/validate_curriculum.py \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js \
  13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js \
  tests/fd-search.test.mjs
git commit -m "fix(search): route crisis queries by explicit vocabulary, then filter stopwords (A1)"
```

---

### Task 2: Shell accessibility (A2 + A6)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js:88-108` (`fdRow`), `:229-230` (greeting)
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js:286` (results body)
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css:253-257`
- Test: `tests/fd-today.test.mjs`, `tests/fd-search.test.mjs`, `tests/spa-shell-a11y.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `fdRow` emits `title="Mark done: <title>"` / `"Mark undone: <title>"`.

- [ ] **Step 1: Write the failing tests**

In `tests/fd-today.test.mjs`:

```js
test('each done-toggle carries the item title in its accessible name', () => {
  // Nine rows all named "Mark done" told a screen-reader user nothing about WHICH item.
  const html = renderWeekList();               // existing helper in this file
  const names = [...html.matchAll(/title="(Mark (?:done|undone)[^"]*)"/g)].map((m) => m[1]);
  assert.ok(names.length > 1, 'expected several toggles');
  assert.equal(new Set(names).size, names.length, `duplicate toggle names: ${names.join(' | ')}`);
});

test('the toggle name tracks aria-pressed so it says what the press will do', () => {
  const html = renderWeekList();
  for (const [, name, pressed] of html.matchAll(/title="(Mark [^"]+)" aria-pressed="(true|false)"/g)) {
    assert.equal(name.startsWith(pressed === 'true' ? 'Mark undone' : 'Mark done'), true, name);
  }
});

test('the greeting does not end in a dangling dash a screen reader announces', () => {
  assert.doesNotMatch(renderToday(), /<h1 class="fd-today__h1">[^<]*—\s*<\/h1>/);
});
```

In `tests/fd-search.test.mjs`:

```js
test('the results list announces its count politely', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, 'suicide', SYN, {});
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /\d+ results?/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fd-today.test.mjs tests/fd-search.test.mjs`
Expected: FAIL — duplicate toggle names; no `aria-live`.

- [ ] **Step 3: Per-item toggle names**

`fd_today.js`, in `fdRow`:

```js
  var toggleName=(on?'Mark undone: ':'Mark done: ')+it.title;
```

and in the button:

```js
    '<button type="button" class="'+checkCls+'" data-fd-toggle="'+fdEsc(it.ref)+'" '+
      'title="'+fdEsc(toggleName)+'" aria-pressed="'+(on?'true':'false')+'">'+
```

- [ ] **Step 4: Fix the greeting**

`fd_today.js:230`:

```js
  var greeting=period+' — '+fdEsc(roleShort);
```

- [ ] **Step 5: Announce the result count**

`fd_search.js`, replace the results-body open tag:

```js
  out+='<div class="fd-searchpanel__body" role="region" aria-live="polite" '+
    'aria-label="'+results.length+' result'+(results.length===1?'':'s')+'">';
```

- [ ] **Step 6: Fine-pointer target size**

`frontdoor.css:253-257` — the 44px overlay is `pointer:coarse` only, leaving 22px on a mouse
(WCAG 2.2 SC 2.5.8 wants 24). Give fine pointers a 24px overlay; the visual circle does not move:

```css
/* The 22px circle is the design's mark, not its target. Touch grows it to 44px; fine pointers get
 * 24px to clear WCAG 2.2 SC 2.5.8. The visual stays put in both cases. */
.fd-check::after{content:'';position:absolute;top:50%;left:50%;width:24px;height:24px;transform:translate(-50%,-50%)}
@media (pointer:coarse){
  .fd-check::after{width:44px;height:44px}
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/fd-today.test.mjs tests/fd-search.test.mjs tests/spa-shell-a11y.test.mjs`
Expected: PASS.

- [ ] **Step 8: Run the full suite and both builds, then commit**

```bash
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git add 13_Faculty_Resources/_automation/site_build/frontdoor/ tests/
git commit -m "fix(a11y): per-item toggle names, result-count announcement, 24px targets (A2/A6)"
```

---

### Task 3: `kind: "rights"` for retired instruments (A3)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py:327` (`_tool` → `_rights` for `cssrs.html`, `bfcrs.html`)
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py:208` (`"k":"tool"` → `"k":"rights"` for the same two)
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js:93-94` (chip label), `fd_search.js:151` (`fdSearchItemMeta`)
- Test: `tests/cssrs-retirement.test.mjs`, `tests/bfcrs-presentation.test.mjs`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: a third `kind` token, `rights`, alongside `md` and `tool`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/cssrs-retirement.test.mjs` and `tests/bfcrs-presentation.test.mjs` respectively
(substituting the slug):

```js
test('the retired instrument is not classed as an interactive tool', () => {
  assert.equal(navKindFor('cssrs.html'), 'rights',
    'a page that exists to say the instrument is NOT reproduced must not present as a tool');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/cssrs-retirement.test.mjs tests/bfcrs-presentation.test.mjs`
Expected: FAIL — `'tool' !== 'rights'`.

- [ ] **Step 3: Add the `_rights` nav helper**

`build_deploy.py`, beside `_md` / `_tool`:

```python
def _rights(f, t):
    """A reference page ABOUT an instrument the library does not reproduce. Renders as reference,
    never in Quick Tools: reaching for a scorer mid-shift and getting a removal notice is the
    failure this token exists to prevent (Fresh Eyes Audit A3)."""
    return {"t": t, "f": f, "k": "rights"}
```

Swap the two call sites at line 327 from `_tool(...)` to `_rights(...)`, and the two
`"k":"tool"` literals in `resident_section.py:208` to `"k":"rights"`.

- [ ] **Step 4: Render the new kind**

`fd_today.js` in `fdRow`:

```js
  var typeCls=(it.kind==='tool')?'fd-chip is-tool':'fd-chip';
  var typeLabel=(it.kind==='tool')?'tool':((it.kind==='rights')?'reference':'read');
```

`fd_search.js` `fdSearchItemMeta`:

```js
function fdSearchItemMeta(item){
  if(item.kind==='tool') return 'tool';
  if(item.kind==='rights') return 'reference · not reproduced';
  return (typeof item.minutes==='number')?(item.minutes+' min read'):'';
}
```

- [ ] **Step 5: Reconcile the six count pins**

The two slugs stop counting as tools. Run each pin surface and update the expected counts to what
the code now produces — **read the failure, do not guess the delta**:

```bash
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
python3 -m unittest 13_Faculty_Resources._automation.test_validate_tool_governance
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs
```

Surfaces: `validate_tool_governance.py` `SITE_EXTRAS` + `EXPECTED_TOOL_COUNTS`; four assertions in
`test_validate_tool_governance.py` plus its `patch.object(EXPECTED_TOOL_COUNTS, …)` fixture;
`tools/pdf_library_export` (needs `pypdf`); `ci-build-contract.test.mjs` `assertInventory` (ms3+res).
Note `node --test _prototypes/sp-interview/tests` (the directory) **fails with MODULE_NOT_FOUND on
Node 22** — run the file directly or `bash _prototypes/sp-interview/tests/run-all.sh`.

- [ ] **Step 6: Run everything and commit**

```bash
node --test tests/*.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git commit -am "fix(registry): kind 'rights' — retired instruments stop presenting as tools (A3)"
```

---

### Task 4: One not-found surface (A4)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:99-113` (deep-link routing)
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js` (unknown-ref render)
- Test: `tests/fd-wire.test.mjs`, `tests/fd-reader.test.mjs`

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces: `fdNotFound(ref) -> string` in `fd_reader.js`.

- [ ] **Step 1: Write the failing tests**

```js
test('an unknown ?page= does not leave a dead slug in the address bar', () => {
  const s = F.fdBootState({}, 'https://x/?page=resident_welcome.md', REAL_INDEX);
  assert.equal(s.openId, '__notfound__');
});

test('an unknown ?tool= renders the shared not-found surface, not a framed 404', () => {
  const html = R.fdNotFound('nope.html');
  assert.match(html, /couldn’t find/i);
  assert.doesNotMatch(html, /<iframe/);
});

test('the not-found surface keeps the fail-safe governance copy', () => {
  assert.match(R.fdNotFound('nope.html'), /verify with faculty/i);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/fd-wire.test.mjs tests/fd-reader.test.mjs`
Expected: FAIL — `fdNotFound is not defined`.

- [ ] **Step 3: Add the surface**

`fd_reader.js`:

```js
/* One not-found surface for BOTH ref kinds. An unknown ?page= used to bounce to Today while the
   address bar kept the dead slug (a copied URL then lied); an unknown ?tool= rendered the raw
   filename as a title and framed a 404. The governance line stays: failing closed on review
   status is correct, only the presentation was broken. */
function fdNotFound(ref){
  return '<div class="fd-reader fd-reader--notfound">'+
    '<h1 class="fd-h1">We couldn’t find that page</h1>'+
    '<p class="fd-sub">The link may be old, or the page may have been retired. '+
    'Try search, or the Library.</p>'+
    '<div class="governance-notice unavailable">Review status unavailable—verify with faculty</div>'+
    '<button type="button" class="fd-setupcta" data-fd-home>Back to Today</button>'+
    '</div>';
}
```

- [ ] **Step 4: Route unknown refs to it**

`fd_wire.js`, in the deep-link block — validate against the index before accepting the ref:

```js
    if(routedRef&&!fdIsLegacyRouteAlias(routedRef)){
      out.fromTab=out.tab;
      out.openId=(index&&index.byRef&&index.byRef[routedRef])?routedRef:'__notfound__';
    }
```

- [ ] **Step 5: Run, build, commit**

```bash
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git commit -am "fix(routing): one graceful not-found surface for unknown page and tool refs (A4)"
```

---

### Task 5: Prove the resident site did not shift

- [ ] **Step 1: Capture `_build/res` before and after**

The audit requires explicit proof that MS3-facing fixes do not move resident output:

```bash
git stash list >/dev/null   # no stash: use a worktree-local copy instead
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cp -R _build/res /tmp/res-after
git checkout ef3057f -- . && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
diff -rq _build/res /tmp/res-after | tee /tmp/res-diff.txt
```

Expected: differences confined to the four intended surfaces (search snippet, `fdRow` markup,
the two retired-instrument nav entries, the not-found surface). Anything else is a regression.

- [ ] **Step 2: Restore the branch state**

```bash
git checkout fix/fresh-eyes-audit-lane-a -- .
```

---

## Self-Review

**Spec coverage:** §1 A1 → Task 1. §2 A2+A6 → Task 2 (the suggested-week sr-only item is dropped —
see below). §3 A4 → Task 4. §4 A3 → Task 3. §6 verification → Tasks 1-5.

**Known gap, deliberate:** spec §2 lists an sr-only "(current week)" for the setup week grid. At
`ef3057f` `fdSetupWeek` (`fd_shell.js:101-124`) emits no highlight at all, and `.fd-weektile.is-sel`
is dead CSS never applied. The finding does not reproduce in source; it is verified against built
output in Task 2 and reported as a false positive rather than "fixed" by inventing a highlight.

**Type consistency:** `fdSearchTriggerHit(triggers, paddedQuery)` — same signature in Task 1 Steps 7
and 8. `fdNotFound(ref)` — same in Task 4 Steps 1, 3. Kit records gain `.triggers` in Step 6 and are
read in Step 7. The `rights` token is spelled identically in `build_deploy.py`,
`resident_section.py`, `fd_today.js`, and `fd_search.js`.
