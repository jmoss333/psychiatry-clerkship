# Taplinger UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shipped therapy curriculum reachable, restore the dead long-page disclosure mechanism, and route every clinical/governance finding to an explicit faculty gate.

**Architecture:** Four packages, executed in order. **WP-A** is purely mechanical — CSS scope, scroll reset, search ranking, path wiring — and changes no clinical claim, so it ships without waiting on anyone. **WP-B** (Interview Room), **WP-C** (learner contract + curricular calls), and **WP-D** (Library density) each open with a hard GATE task that stops until Joshua Moss, MD has decided. No agent infers a clinical claim, a review status, or a course requirement.

**Tech Stack:** Static-site builder (Python assembler + ES5 `frontdoor/*.js` snippets injected into `spa_index.html`), `node:test` contract tests, Playwright smoke suite, Netlify deploy-on-push to two sites.

**Spec:** `docs/superpowers/plans/2026-08-23-taplinger-ux-decision-packet.md` — the read-only decision review this plan implements (findings F1–F9 plus two additional observations). Executors read both.

## Global Constraints

Every task's requirements implicitly include this section.

- **ES5 only in `frontdoor/*.js`** — `var` and `function`, no `const`/`let`/arrow functions/template literals. Matches every other module in that directory.
- **Copy rule — audience-neutral strings.** Every string in `frontdoor/*.js` ships to BOTH sites unrebranded. Banned tokens: `MS3`, `clerkship`, `student`, `shelf`, `resident`, `UNE`, `MMC`, `Sanford`. Enforced by `AUDIENCE_TOKEN_RE` in `tests/fd-search.test.mjs` and by the `frontdoor.css` audience-token ban.
- **Search ranking is a safety contract, not a preference.** Protocols (`index.kit`) are matched and concatenated FIRST, ahead of ordinary items. A learner typing "suicide" mid-shift must get the protocol sheet before a topic page that merely mentions it. Any ranking change preserves this.
- **Search results stay capped at 8**, protocols included in the cap, dropping from the END of the list.
- **localStorage keys must be namespaced `cw_*` (shared hub) or `rp_*` (resident).** The QA gate hard-fails any other prefix.
- **Crisis contacts (988 etc.) live in `crisis_resources.json` only.** Never hard-code a crisis number. Pages opt in with a `<!-- crisis-block -->` marker.
- **No PHI.** Synthetic / de-identified clinical content only.
- **THE LIBRARY TEACHES ADMINISTRATION; IT DOES NOT REPRODUCE INSTRUMENTS.** No verbatim item stems, no anchor ladders, no fillable copies. Scope is a governance decision — if a task seems to require verbatim instrument text, **stop and ask**.
- **Never hand-edit `_build/`.** It is generated output.
- **A new page must be registered in `site_manifest.json` AND in nav inside `build_deploy.py`**, or the QA gate's orphaned-source check hard-fails the build.
- **`CLAUDE.md` and `AGENTS.md` must stay byte-identical.** After editing `CLAUDE.md`, run `cp CLAUDE.md AGENTS.md`. CI fails the PR if they diverge.
- **Visual baselines regenerate on Ubuntu/Chromium via the "Refresh visual baselines" workflow_dispatch — never locally on macOS.**
- **Do not add steps to `.github/workflows/ci.yml`.** A new step trips three separate contracts (verify-coverage, step inventory + sha256 digest, registry PAIRS). Nothing in this plan requires a CI change.
- **`main` is strict-mode protected with 0 required approvals.** PRs merge on green checks, so **every open PR must be re-synced after each merge**.
- **Run `bash bin/verify.sh`** (the full local battery, also installed as a pre-push hook) before pushing.
- **LFS note:** `build_and_check.sh` will exit 1 at the LFS media preflight in any worktree without LFS objects pulled. That is an environment artifact, **not** a failure this plan introduces. Confirm the failure is the LFS gate and nothing upstream of it.

---

## File Structure

| File | Responsibility | Package |
|---|---|---|
| `13_Faculty_Resources/_automation/site_build/spa_index.html` | Shell CSS — dual-scope `.sec-*` rules to the Front Door reader container; `.toolframe` sizing | WP-A, WP-B |
| `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js` | `fdOpenResource` — add injectable scroll reset on genuine (non-history) navigation | WP-A |
| `13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js` | `fdSearchResults` — relevance scoring + stopword guard | WP-A |
| `curriculum.json` | MS3 Week 3 `items` — the therapy pathway | WP-A (gated) |
| `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` | "Pair with" rail — link into the newer pages | WP-A |
| `02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md` | Go-deeper rail — make the Reading Room reference a real link | WP-A |
| `07_Evidence_and_Reading/Therapy_Reading_Room/therapy_reading_room.md` | Return link to the therapy module | WP-A |
| `_prototypes/sp-interview/sp-interview.html` + `.preview.html` | Review-status badge (line 840 / 842) | WP-B (gated) |
| `_prototypes/sp-interview/sp-interview.pack.json` | Intent pattern lists — suicide-screen recognition | WP-B (gated) |
| `13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md` | Learner entry contract copy (line 29) | WP-C (gated) |
| `tests/fd-search.test.mjs` | Search ranking contract | WP-A |
| `tests/fd-resource.test.mjs` | Scroll-reset contract | WP-A |
| `tests/spa-shell-a11y.test.mjs` | Shell CSS scope contract | WP-A |

---

# WP-A · Reachability (mechanical, ungated)

Four tasks. No clinical claim changes. Ships independently of every faculty decision.

---

### Task 1: Dual-scope the `.sec-*` CSS to the Front Door reader

**Why:** The reader auto-wraps long pages into collapsible sections and injects an Expand&nbsp;all / Collapse&nbsp;all toolbar, but every matching rule is scoped `.md-body .sec-*` while `fd_reader.js` renders into `.fd-article__body`. The selector never matches, so `.sec-b{display:none}` never applies: all sections stay permanently expanded and both toolbar buttons are inert. The same file already dual-scopes its *table* rules this way at lines 126–131 — the `.sec-*` rules were missed in that migration.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:277-288`
- Test: `tests/spa-shell-a11y.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: working `.sec-c.open` / `.sec-b` disclosure inside `.fd-article__body`. Task 5's browser journey asserts against it.

- [ ] **Step 1: Write the failing test**

Append to `tests/spa-shell-a11y.test.mjs` (the file already defines `shellCss` as the `<style>` slice of `spa_index.html`):

```javascript
test('every .md-body .sec-* rule is also scoped to the Front Door reader body', () => {
  // fd_reader.js renders into .fd-article__body, never .md-body. A .sec-* rule scoped
  // only to .md-body is dead code on every Front Door page -- which silently disables
  // the collapse mechanism rather than merely restyling it.
  const secRules = shellCss
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('.md-body .sec-'));

  assert.ok(secRules.length >= 8, 'expected the collapsible-section rules to be present');

  for (const rule of secRules) {
    const selector = rule.slice(0, rule.indexOf('{'));
    assert.match(
      selector,
      /\.fd-article__body\s+\.sec-/,
      `collapsible rule is dead inside the Front Door reader: ${selector.trim()}`,
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/spa-shell-a11y.test.mjs`
Expected: FAIL — `collapsible rule is dead inside the Front Door reader: .md-body .sec-toolbar`

- [ ] **Step 3: Replace lines 277–288 with dual-scoped rules**

Replace the block exactly:

```css
  .md-body .sec-toolbar,.fd-article__body .sec-toolbar{display:flex;gap:8px;margin:10px 0 12px}
  .md-body .sec-all,.fd-article__body .sec-all{font-size:.8rem;border:1px solid var(--border);background:var(--surface);color:var(--accent-dark);border-radius:999px;padding:5px 13px;cursor:pointer;font-family:inherit}
  .md-body .sec-all:hover,.fd-article__body .sec-all:hover{border-color:var(--accent)}
  .md-body .sec-c,.fd-article__body .sec-c{border:1px solid var(--border);border-radius:10px;margin:9px 0;background:var(--surface);overflow:hidden}
  .md-body .sec-h,.fd-article__body .sec-h{margin:0;border:none;padding:0;font-size:1.05rem}
  .md-body .sec-h button,.fd-article__body .sec-h button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:none;cursor:pointer;font:inherit;font-family:var(--font-head);font-weight:600;color:var(--text);padding:12px 15px}
  .md-body .sec-h button:hover,.fd-article__body .sec-h button:hover{background:var(--bg-alt)}
  .md-body .sec-chev,.fd-article__body .sec-chev{display:inline-block;color:var(--accent-dark);font-size:.78rem;transition:transform .15s;flex:0 0 auto}
  .md-body .sec-c.open .sec-chev,.fd-article__body .sec-c.open .sec-chev{transform:rotate(90deg)}
  .md-body .sec-b,.fd-article__body .sec-b{display:none;padding:0 16px 12px}
  .md-body .sec-c.open .sec-b,.fd-article__body .sec-c.open .sec-b{display:block}
  .md-body .sec-b>:first-child,.fd-article__body .sec-b>:first-child{margin-top:6px}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/spa-shell-a11y.test.mjs tests/fd-contrast.test.mjs`
Expected: PASS. `fd-contrast` is included because `.sec-all` now paints `--accent-dark` on `--surface` in a second container; the WCAG token check must still pass.

- [ ] **Step 5: Verify in a real browser at both viewports**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
python3 -m http.server 8801 --directory _build/ms3
```

Open `http://localhost:8801/?page=therapy_on_the_unit.md`. In the console:

```javascript
const bodies=[...document.querySelectorAll('.sec-b')];
const before=bodies.map(b=>getComputedStyle(b).display);
[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Collapse all').click();
JSON.stringify({before:[...new Set(before)],
  after:[...new Set(bodies.map(b=>getComputedStyle(b).display))],
  radius:getComputedStyle(document.querySelector('.sec-all')).borderRadius});
```

Expected AFTER the fix: `before:["none"]`, `after:["none"]`, `radius:"999px"` — and clicking **Expand all** flips the bodies to `["block"]`. Before the fix this returned `block` / `block` / `0px`.

> **Corrected 2026-08-23 during execution.** This step originally predicted `before:["block"]`, which is impossible once the rule is live: `.md-body .sec-b{display:none}` is the base rule, so the moment the selector matches, sections render **collapsed by default**. Use **Expand all → `["block"]`** as the proof the mechanism works, not "Collapse all changes something".
>
> That blind spot was not harmless. Collapse-by-default also hides the build-injected crisis block on every page that carries one — including two safety-kit protocol sheets — and hides trailing "Pair with" rails. Both were caught in final review and fixed in the same branch. **Any future change to `makeCollapsible` must re-check what is inside a collapsed section, not just whether collapsing works.**

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/spa-shell-a11y.test.mjs
git commit -m "fix(reader): dual-scope collapsible-section CSS to .fd-article__body

The Front Door reader renders into .fd-article__body, but every .sec-* rule
was scoped .md-body only -- so display:none never applied and Expand/Collapse
all were inert on every long page, on both sites. Follows the table-rule
precedent already in this file at lines 126-131."
```

---

### Task 2: Reset scroll on genuine resource navigation

**Why:** The shipped bundle contains exactly one scroll call — `scrollTo(0,0)` in the faculty-preview path, which a comment notes learner navigation never reaches. `scrollPos` is declared in `FD_KEYS` but never read or written. Opening a resource from deep in Library therefore lands mid-page: measured scrollY 665.5 → 665.5 on ms3 (title 368 px above the viewport) and 820 → 820 on res (522 px above).

Back/forward must NOT be reset — `fdOpenResource` already receives `o.fromHistory`, threaded from `fdApplyEffect` and set `true` by the popstate handler. That flag is the discriminator.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:411` (`fdOpenResource`, `mount()`)
- Test: `tests/fd-resource.test.mjs`

**Interfaces:**
- Consumes: `o.fromHistory` (boolean), already passed at `fd_wire.js:727`, `:751`, `:974`.
- Produces: `fdOpenResource` accepts `o.scrollReset` — a zero-argument function called once per successful mount when `o.fromHistory` is falsy. Defaults to scrolling the window to top. Injected the same way `o.host`, `o.governanceNotice`, and `o.renderReader` already are.

- [ ] **Step 1: Write the failing test**

Append to `tests/fd-resource.test.mjs`:

```javascript
test('opening a resource resets scroll, but history navigation does not', async () => {
  const calls = [];
  const base = {
    index: { byRef: {} },
    state: {},
    search: '?page=interview.md',
    host: { innerHTML: '' },
    renderReader: (_i, _s, body) => body,
    governanceNotice: () => '',
    parseMarkdown: (md) => md,
    fetcher: () => Promise.resolve({ ok: true, text: () => Promise.resolve('# X\n\nbody') }),
    scrollReset: () => { calls.push('reset'); },
  };

  await make().fdOpenResource('interview.md', { ...base });
  assert.deepEqual(calls, ['reset'], 'a genuine navigation lands at the top of the new page');

  calls.length = 0;
  await make().fdOpenResource('interview.md', { ...base, fromHistory: true });
  assert.deepEqual(calls, [], 'back/forward must restore the reader position, not jump to top');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fd-resource.test.mjs`
Expected: FAIL — `a genuine navigation lands at the top of the new page`, actual `[]`.

- [ ] **Step 3: Implement in `fdOpenResource`**

Add after the `renderReader` declaration (ES5 only):

```javascript
  /* Genuine navigation lands at the top of the new resource; back/forward keeps whatever
     position the browser restores. Injectable so the contract is testable without a DOM --
     same pattern as host/governanceNotice/renderReader above. */
  var scrollReset=o.scrollReset||function(){
    if(typeof window!=='undefined'&&window.scrollTo) window.scrollTo(0,0);
  };
```

Then inside `mount(body)`, replace the existing body with:

```javascript
  function mount(body){
    if(!current()) return false;
    var bar=governance(legacy)||'';
    if(host) host.innerHTML=renderReader(index,currentRenderState(),bar+body);
    if(!o.fromHistory) scrollReset();
    return true;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/fd-resource.test.mjs tests/fd-wire.test.mjs`
Expected: PASS, including all pre-existing assertions in both files.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js tests/fd-resource.test.mjs
git commit -m "fix(reader): scroll to top on genuine resource navigation

Opening a resource from deep in Library retained the previous page's scroll
(665 -> 665 on ms3; 820 -> 820 on res), hiding the title and attestation chip.
Gated on o.fromHistory so back/forward still restores position."
```

---

### Task 3: Rank search results by relevance

**Why:** Two compounding defects. (a) `fdSearchHits` accepts any expanded word longer than one character, so `on` matches 70 of 83 items and `the` matches 59 — including inside other words. (b) Items are ordered by `refs.sort()` — pure alphabetical filename order — then `.slice(0,8)`. The exact phrase `"therapy on the unit"` matches precisely the two right pages, but that signal is discarded because matching is boolean and ordering is alphabetical: the target ranks 71st of 75 and is cut. Plain `"therapy"` also fails — the two new pages rank 10th and 11th of 11.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js`
- Test: `tests/fd-search.test.mjs`

**Interfaces:**
- Consumes: `fdSearchHaystack(item)`, `fdExpandQuery(q, synonyms)` — both unchanged.
- Produces: `fdSearchScore(item, rawQuery, contentWords)` → integer, higher is better. `fdSearchResults` keeps its existing signature `(index, query, synonyms, state)` and its existing return shape `[{item, kind, meta}]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fd-search.test.mjs` (`REAL_INDEX` and `SYN` are already defined at the top of that file):

```javascript
// ---- relevance ranking (Taplinger UX remediation, F2) ----------------------------------------

const titles = (q) => F.fdSearchResults(REAL_INDEX, q, SYN, {}).map((r) => r.item.title);

test('searching a page title exactly returns that page first', () => {
  assert.equal(titles('therapy on the unit')[0], 'Therapy on the Unit');
});

test('a one-word topic query surfaces the attested pages for that topic', () => {
  const t = titles('therapy');
  assert.ok(t.includes('Therapy on the Unit'), 'Therapy on the Unit missing from "therapy"');
  assert.ok(t.includes('The Therapy Reading Room'), 'The Therapy Reading Room missing from "therapy"');
});

test('stopwords do not displace content matches in a multi-word query', () => {
  // "on" alone matched 70 of 83 items before the guard, and "the" 59, so every item result
  // for this query used to be a stopword accident. Verified: all item results now contain
  // the content word.
  const items = F.fdSearchResults(REAL_INDEX, 'therapy on the unit', SYN, {})
    .filter((r) => r.kind === 'item');
  assert.ok(items.length > 0);
  for (const r of items) {
    const hay = `${r.item.title} ${r.item.ref} ${r.item.summary}`.toLowerCase();
    assert.ok(hay.includes('therapy'), `stopword-only match leaked in: ${r.item.title}`);
  }
});

test('an all-stopword query degrades to protocol-first rather than exploding', () => {
  // fdSearchContentWords never returns empty, so a query with no topic signal keeps its
  // words rather than silently matching nothing -- and the safety contract still governs
  // what surfaces first.
  assert.equal(F.fdSearchResults(REAL_INDEX, 'on', SYN, {})[0].kind, 'protocol');
});

test('protocols still rank ahead of ordinary items after scoring', () => {
  // Regression guard for the safety contract -- scoring reorders items, never protocols.
  const r = F.fdSearchResults(REAL_INDEX, 'suicide', SYN, {});
  assert.equal(r[0].kind, 'protocol');
});

test('scoring does not break the cap-at-8 contract', () => {
  assert.ok(F.fdSearchResults(REAL_INDEX, 'a', SYN, {}).length <= 8);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/fd-search.test.mjs`
Expected: FAIL on the first three — `titles('therapy on the unit')[0]` is `'Suicide Risk & Safety'`; `'therapy'` omits both pages; `'on'` returns 8.

- [ ] **Step 3: Add the stopword guard and scorer**

Insert after `FD_SEARCH_PINNED` in `fd_search.js`:

```javascript
/* Words that carry no topic signal. Unguarded, "on" matched 70 of 83 items and "the" 59 --
   including as substrings inside other words -- so any multi-word query degenerated into a
   near-wildcard and the cap-at-8 dropped the intended page. The raw-query substring check in
   fdSearchHits still sees the full phrase, so exact-title queries keep working. */
var FD_SEARCH_STOPWORDS={
  'a':1,'an':1,'and':1,'are':1,'as':1,'at':1,'be':1,'by':1,'for':1,'from':1,'has':1,'in':1,
  'is':1,'it':1,'of':1,'on':1,'or':1,'that':1,'the':1,'to':1,'was':1,'what':1,'when':1,
  'which':1,'who':1,'with':1,'you':1,'your':1
};

/* Drops stopwords, but never returns empty: a query made only of stopwords keeps its words so
   it still behaves as before rather than silently matching nothing. */
function fdSearchContentWords(words){
  var out=[],i;
  for(i=0;i<words.length;i++){
    if(words[i]&&words[i].length>1&&!FD_SEARCH_STOPWORDS[words[i]]) out.push(words[i]);
  }
  return out.length?out:words;
}

/* Higher is better. Title evidence outranks ref evidence outranks summary evidence, so an exact
   title match cannot be displaced by a page that merely mentions the phrase in prose. */
function fdSearchScore(item, rawQuery, contentWords){
  var title=String(item.title||'').toLowerCase();
  var ref=String(item.ref||'').toLowerCase();
  var summary=String(item.summary||'').toLowerCase();
  var score=0,i,w;
  if(rawQuery){
    if(title===rawQuery) score+=100;
    else if(title.indexOf(rawQuery)!==-1) score+=70;
    if(ref.indexOf(rawQuery)!==-1) score+=25;
    if(summary.indexOf(rawQuery)!==-1) score+=10;
  }
  for(i=0;i<contentWords.length;i++){
    w=contentWords[i];
    if(title.indexOf(w)!==-1) score+=12;
    else if(ref.indexOf(w)!==-1) score+=6;
    else if(summary.indexOf(w)!==-1) score+=2;
  }
  return score;
}
```

- [ ] **Step 4: Use the guard and scorer inside `fdSearchResults`**

In `fdSearchResults`, replace the block from `var expandedWords=` down to the `return` with:

```javascript
  var expandedWords=fdExpandQuery(rawQuery, synonyms).split(/\s+/);
  var qw=[];
  for(var e=0;e<expandedWords.length;e++){ if(expandedWords[e]) qw.push(expandedWords[e]); }
  var contentWords=fdSearchContentWords(qw);

  var protoResults=[];
  for(var kk=0;kk<kit.length;kk++){
    var kitItem=kit[kk].item;
    if(fdSearchHits(fdSearchHaystack(kitItem), rawQuery, contentWords)){
      protoResults.push({ item: kitItem, kind:'protocol', meta:'safety · protocol' });
      seenRefs[kitItem.ref]=true;
    }
  }

  /* Refs are sorted first so the sort below is deterministic across engines: equal scores keep
     alphabetical order, matching fd_data.js's fdLibraryOnlyReads precedent. */
  var refs=[];
  for(var ref in idx.byRef){ refs.push(ref); }
  refs.sort(function(a,b){ return a<b?-1:(a>b?1:0); });

  var itemResults=[];
  for(var r=0;r<refs.length;r++){
    if(seenRefs[refs[r]]) continue;
    var it=idx.byRef[refs[r]];
    if(fdSearchHits(fdSearchHaystack(it), rawQuery, contentWords)){
      itemResults.push({
        item: it, kind:'item', meta: fdSearchItemMeta(it),
        _score: fdSearchScore(it, rawQuery, contentWords)
      });
    }
  }
  /* Stable by construction: equal scores preserve the alphabetical order established above.
     Protocols are concatenated ahead of every item and are never reordered -- the safety
     contract is positional, not score-based. */
  itemResults.sort(function(a,b){ return b._score-a._score; });
  for(var s=0;s<itemResults.length;s++){ delete itemResults[s]._score; }

  return protoResults.concat(itemResults).slice(0,8);
```

- [ ] **Step 5: Run the full search suite**

Run: `node --test tests/fd-search.test.mjs`
Expected: PASS — including the pre-existing protocol-first, cap-at-8, empty-state-escaping, and `AUDIENCE_TOKEN_RE` assertions.

> **This patch was pre-verified against the real index during planning** (2026-08-23), not just reasoned about. All 11 assertions passed. Measured result sets after the change:
> - `"therapy on the unit"` → `Therapy on the Unit`, `Brief Psychotherapy on the Unit`, `Family Therapy Modalities`, `The Therapy Reading Room`, `Psychotherapies at a Glance`
> - `"therapy"` → `The Therapy Reading Room`, `Brief Psychotherapy on the Unit`, `Therapy on the Unit`, … (both new pages now present; they were absent entirely)
> - `"suicide"` → protocol first, unchanged
>
> One design note the verification surfaced: an **all-stopword** query such as `"on"` still returns 8 results, because `fdSearchContentWords` deliberately never returns empty. That is intended — a query with no topic signal degrades to protocol-first rather than to nothing. Do not "fix" it.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js tests/fd-search.test.mjs
git commit -m "fix(search): rank by relevance and stop treating stopwords as wildcards

Matching was boolean and ordering alphabetical, so the exact phrase signal was
computed and then discarded: 'Therapy on the Unit' ranked 71st of 75 matches for
its own title and was cut by the cap. Plain 'therapy' omitted both attested
therapy pages. Protocol-first ordering and the cap-at-8 are unchanged."
```

---

### Task 4: Wire the therapy pathway and its cross-links

**Why:** The two attested therapy pages are absent from *every* week of *both* paths, contain **zero markdown links of any kind**, and are named-but-unlinked from the one page that points at them. `brief_psychotherapy.md` has a five-link "Pair with" rail naming neither. The Go-deeper rail closes with "see the Therapy Reading Room page" as plain prose.

> **GATE — Task 4a requires Joshua Moss, MD.**
> MS3 Week 3 currently holds five items at ~12 minutes. Adding two substantial readings (12 min + 8 min) roughly doubles it. **Do the pages get added, or do they replace `brief_psychotherapy.md`?**
> Recommendation to present: **add both, drop nothing.** `brief_psychotherapy` is a 4-minute matching table that works as the quick reference; the new module is the teaching text. But the week's weight is a curricular call.
> **Do not proceed past Step 1 without a decision.** Steps 2–7 (cross-links) are ungated and may be done first.

**Files:**
- Modify: `curriculum.json` (`learningPaths.ms3.weeks[2].items`) — **gated**
- Modify: `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md:40`
- Modify: `02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md` (Go-deeper rail close)
- Modify: `07_Evidence_and_Reading/Therapy_Reading_Room/therapy_reading_room.md`

**Interfaces:**
- Consumes: slugs registered in `site_manifest.json` — `therapy_on_the_unit.md`, `therapy_reading_room.md`, `brief_psychotherapy.md`. All three already registered; no `build_deploy.py` nav change needed.
- Produces: inbound path references and bidirectional `?page=` links.

- [ ] **Step 1: Record the gate decision**

Write the decision and its date into this plan file before editing `curriculum.json`. If the decision is "add both", `weeks[2].items` becomes:

```json
    "items": [
      { "ref": "t_personality.md", "kind": "read" },
      { "ref": "exp_tx.md", "kind": "read" },
      { "ref": "brief_psychotherapy.md", "kind": "read" },
      { "ref": "therapy_on_the_unit.md", "kind": "read" },
      { "ref": "therapy_reading_room.md", "kind": "read" },
      { "ref": "reflection.html", "kind": "tool" },
      { "ref": "question-bank-practice.html", "kind": "tool" }
    ]
```

- [ ] **Step 2: Validate the curriculum change**

Run: `python3 13_Faculty_Resources/_automation/validate_curriculum.py`
Expected: PASS. This validator owns week ordering and ref integrity; a slug not present in `site_manifest.json` fails here rather than at deploy.

- [ ] **Step 3: Link `brief_psychotherapy` forward**

At `brief_psychotherapy_inpatient.md:40`, extend the existing "Pair with" rail. Replace the closing of that line so it reads:

```markdown
**Pair with** — [Therapy on the Unit](?page=therapy_on_the_unit.md) for the full teaching module and the 5-minute bedside toolkit, [The Therapy Reading Room](?page=therapy_reading_room.md) for the verified reading list, the [Motivational Interviewing](?page=motivational_interviewing.md) page, the [suicide-risk & safety pocket card](?page=pg_suicide.md), the [Personality Disorders](?page=t_personality.md) page (DBT-informed stance), the [Family Meeting Playbook](?page=family_playbook.md), and the [Evidence-Based Inpatient Psychiatry](?page=evidence_inpatient.md) reference for the underlying trials.
```

- [ ] **Step 4: Make the Go-deeper rail's Reading Room reference a real link**

In `therapy_on_the_unit_inpatient_teaching.md`, in the italic line closing the "Go deeper (verified reading — the rail)" section, replace `see the Therapy Reading Room page` with:

```markdown
Full domain-by-domain reading list: see [The Therapy Reading Room](?page=therapy_reading_room.md).
```

- [ ] **Step 5: Give the Reading Room a return link**

In `therapy_reading_room.md`, immediately below the H1, add:

```markdown
> Companion to [Therapy on the Unit](?page=therapy_on_the_unit.md) — that page teaches the bedside moves; this one is the evidence behind them.
```

- [ ] **Step 6: Build both sites and confirm the links survive assembly**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
grep -c '?page=' _build/ms3/content/therapy_on_the_unit.md _build/ms3/content/therapy_reading_room.md
```

Expected: each ≥ 1 (both were `0`). Builds exit 1 **only** at the LFS media preflight — confirm nothing upstream failed.

- [ ] **Step 7: Commit**

```bash
git add curriculum.json 02_Clinical_Skills 07_Evidence_and_Reading docs/superpowers/plans/2026-08-23-taplinger-ux-remediation.md
git commit -m "feat(therapy): put the attested therapy pages in Week 3 and link them both ways

Both pages were in no learning path for either audience and contained zero
markdown links -- the Go-deeper rail named the Reading Room in plain prose.
Week 3 composition per faculty decision recorded in the plan."
```

---

### Task 5: Whole-journey verification for WP-A

**Files:** none modified — this task is the package's acceptance gate.

- [ ] **Step 1: Run the full local battery**

```bash
node --test tests/*.test.mjs
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
bash bin/verify.sh
```

Expected: 1,413+ tests pass, 0 fail. Any new failure is owned by this package.

- [ ] **Step 2: Fresh-learner browser journey — MS3 at 1440 px and 390 × 844**

Clear `localStorage`, complete setup as Core rotation → Week 3, then assert:

1. Today shows the therapy pages in the Week 3 list.
2. Search `"therapy"` → both new pages present.
3. Search `"therapy on the unit"` → that page ranks first.
4. Search `"reading room"` → The Therapy Reading Room present.
5. Search `"suicide"` → a protocol is still first (safety contract).
6. Scroll to the bottom of Library, open a resource → title visible, `scrollY` ≈ 0.
7. Browser Back → Library position restored, not jumped to top.
8. On the therapy page, click **Collapse all** → sections actually collapse; buttons render as accent pills.
9. From `brief_psychotherapy`, follow the "Pair with" rail into both new pages, and follow the Go-deeper rail into the Reading Room.

- [ ] **Step 3: Repeat every step on the resident site independently**

Serve `_build/res` and re-run steps 1–9. Do not assume MS3 behaviour proves resident behaviour — Library is 92 items there, not 83, and the scroll defect measured differently (820 → 820, title 522 px above).

- [ ] **Step 4: Playwright smoke**

```bash
cd tests/smoke && npm ci && npx playwright test
```

If visual baselines shift because `.sec-*` now renders as designed, **regenerate them via the "Refresh visual baselines" workflow_dispatch on Ubuntu/Chromium — never locally on macOS.**

- [ ] **Step 5: Open the PR**

```bash
git push -u origin fix/taplinger-reachability
gh pr create --title "WP-A: make the therapy curriculum reachable" \
  --body "Fixes F1, F2, F3, F4, F8a from the 2026-08-23 UX decision review. No clinical claim changed."
```

Re-sync the branch after any other PR merges — `main` is strict-mode protected with 0 required approvals, so it moves without warning.

---

# WP-B · The Interview Room (faculty-gated)

> **GATE — none of WP-B proceeds without Joshua Moss, MD.**
> Every task here changes a clinical simulation behaviour or a review-status claim. An agent must not infer either.

---

### Task 6: Decide and reconcile the review-status claim (F7)

**Why:** Four artifacts say reviewed — pack `status`, all three cases' `facultyReview`, `reviewed.json`, and `governance.json` (Joshua Moss, MD · 2026-08-11). One hard-coded badge says pending, in a file whose own header six lines from the top declares `status="reviewed"`. A learner sees both claims about 85 px apart.

**Files:**
- Modify: `_prototypes/sp-interview/sp-interview.html:840` — **gated**
- Modify: `_prototypes/sp-interview/sp-interview.preview.html:842` — **gated**

- [ ] **Step 1: GATE — obtain the decision**

Ask: *the registry says reviewed and signed by you on 2026-08-11; the in-tool badge says pending. Which is true?* Record the answer and date in this plan. **Stop here until answered.**

- [ ] **Step 2: If "reviewed" — remove the contradicting badge**

Delete the badge element from both files:

```javascript
      e('span',{className:'badge draft'},'Redesigned — pending faculty review'),
```

The Front Door already renders the authoritative chip ("Reviewed by Joshua Moss, MD · 2026-08-11") from `governance.json`, so removing the hard-coded span leaves exactly one claim rather than none.

- [ ] **Step 3: If "still pending" — correct the registry instead**

Do **not** edit the badge. Set `status` to draft in `13_Faculty_Resources/reviewed.json` for `sp-interview.html` and re-run the attestation validator. The badge then becomes the truthful artifact.

- [ ] **Step 4: Validate attestation consistency**

Run: `python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py`
Expected: PASS — this validator exists precisely to catch a divergence like this one.

- [ ] **Step 5: Confirm one claim, in a browser**

Open `?tool=sp-interview.html` on both sites and confirm exactly one review-status indicator is visible.

- [ ] **Step 6: Commit**

```bash
git add _prototypes/sp-interview 13_Faculty_Resources/reviewed.json
git commit -m "fix(governance): one review-status claim for the Interview Room

Per faculty decision <DATE>. The tool carried a hard-coded 'pending faculty
review' badge while pack, all three cases, reviewed.json and governance.json
all recorded reviewed."
```

---

### Task 7: Close the suicide-screen recognition gap (F6)

**Why — this is the P0 of the whole review.** The offline engine compiles each intent's literal phrase list to `new RegExp(p,'i')`. The textbook screen *"Have you had any thoughts that life isn't worth living?"* matches **no** intent and returns a generic deflection. Because coverage is scored by which intent IDs matched, a learner who screens correctly is recorded as not having screened: the gated disclosure never unlocks and the debrief tells them they missed it. The simulation teaches that a guideline-concordant question is wrong.

8 of 16 clinically reasonable phrasings missed in testing. A natural introduction — *"I'm Sam, a third-year student working with Dr. Chen"* — also deflects, so the interview's first move fails.

**Files:**
- Modify: `_prototypes/sp-interview/sp-interview.pack.json` (`cases[].intents[].patterns`) — **gated**
- Test: `sp-proxy/tests/sp-pack-governance.test.mjs`

- [ ] **Step 1: GATE — faculty supplies the phrase list**

**Which phrasings count as a suicide screen is a clinical vocabulary decision.** An agent must not invent this list. Present the measured misses and ask for additions. Known-missing families to put in front of faculty:

| Family | Example that currently deflects |
|---|---|
| Worth-of-living | "Have you had any thoughts that life isn't worth living?" |
| Wish-not-to-exist | "Do you ever wish you wouldn't wake up?" *(partially covered)* |
| Passive burden | "Do you ever feel your family would be better off without you?" |
| Openers | "What made you come to the hospital?" · "So what happened?" |
| Introductions | "I'm Sam, a third-year student" · "Hi, I'm one of the students on the team" |
| Validation | "That sounds incredibly hard" · "It makes sense you'd feel that way" |

Record the approved list here. **Stop until it exists.**

- [ ] **Step 2: Write the failing test**

Add to `sp-proxy/tests/sp-pack-governance.test.mjs`, using the faculty-approved phrasings:

```javascript
test('every faculty-approved suicide screening phrasing is recognised', () => {
  const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));
  const APPROVED = [/* the exact phrasings recorded in Step 1 */];

  for (const caseDef of pack.cases) {
    const safety = caseDef.intents.filter((i) => i.category === 'safety');
    const rx = safety.flatMap((i) => i.patterns.map((p) => new RegExp(p, 'i')));
    for (const phrase of APPROVED) {
      assert.ok(
        rx.some((r) => r.test(phrase)),
        `${caseDef.id}: no safety intent recognises ${JSON.stringify(phrase)} -- ` +
        'a learner who screens correctly would be scored as not having screened',
      );
    }
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd sp-proxy && node --test tests/sp-pack-governance.test.mjs`
Expected: FAIL naming each unrecognised phrasing.

- [ ] **Step 4: Extend the pattern lists to the approved set**

Edit `patterns` for `si_direct`, `si_euphemism`, `greeting_agenda`, `open_invite`, and `reflection` in each case. Patterns are regex strings; keep them anchored on distinctive stems rather than whole sentences, matching the existing style — e.g. the worth-of-living family is served by a stem like `"worth living"`, not a full-sentence pattern.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd sp-proxy && node --test tests/*.test.mjs`
Expected: PASS, including the pre-existing pack-governance and handler suites.

- [ ] **Step 6: Re-verify the live offline behaviour**

Serve `_build/ms3`, open `?tool=sp-interview.html`, switch to **Mock patient (offline)**, begin Dana, and send each approved phrasing. Confirm each advances the interview and that the coverage map credits the safety intent. Repeat for Marcus and Ray.

- [ ] **Step 7: Re-run the red-team checklist and commit**

`sp-proxy/REDTEAM_CHECKLIST.md` is **mandatory after every pack change**, per CLAUDE.md.

```bash
git add _prototypes/sp-interview/sp-interview.pack.json sp-proxy/tests
git commit -m "fix(sim): recognise faculty-approved suicide screening phrasings

A standard screen ('thoughts that life isn't worth living') matched no intent,
so a learner who screened correctly was scored as not having screened and the
gated disclosure never unlocked. Phrase list approved by Joshua Moss, MD <DATE>."
```

---

### Task 8: Make the live-mode refusal explain itself, and surface the third case

**Why:** Kaitlin asked *"Is this because it is offline?"* — she inferred "broken" from silence. Separately, all three attested cases ship, but `.toolframe` is `height:calc(100vh - 46px)` (≈879 px) while the tool's content is ≈2629 px, and the embedded frame does not grow. Ray's Begin buttons sit at y ≈ 1668/1759, below the clip — which is why Kaitlin reported "both OSCE cases" rather than three.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:93-94` (`.toolframe`)
- Modify: `_prototypes/sp-interview/sp-interview.html` (live-refusal copy) — **gated on wording**

- [ ] **Step 1: Give the embedded reader frame room, or let it scroll**

The tool is mounted inside `.fd-article__body`, where `#content.toolmode` does not apply, so the frame keeps a fixed viewport height regardless of content. Add a reader-scoped rule beside the existing ones:

```css
  .fd-article__body .toolframe{height:min(2700px,180vh)}
```

Prefer this over `scrolling` attributes: a nested scroll region inside an already-scrolling reader is the usability problem that hid Ray in the first place.

- [ ] **Step 2: Verify all three cases are reachable without an inner scroll**

Serve `_build/ms3`, open the tool embedded (not expanded), and confirm Dana, Marcus, **and Ray** each expose both Begin buttons.

- [ ] **Step 3: GATE — approve the live-refusal copy**

WP-08f already proposes: *"Live patient mode is closed while this case pack is pending faculty review. You are in practice mode."* **If Task 6 resolved to "reviewed", this sentence is now false** and the copy must be rewritten to describe the actual refusal reason (missing/invalid passcode, budget, or proxy availability). Obtain the wording. **Stop until approved.**

- [ ] **Step 4: Implement the approved copy and commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html _prototypes/sp-interview
git commit -m "fix(sim): surface the third attested case and explain live-mode refusal

The embedded frame clipped its own start controls at ~879px of ~2629px, hiding
Ray entirely. Refusal copy approved by faculty <DATE>."
```

---

### Task 9: Decide the engine's direction (design task, no code)

**Why:** The deterministic matcher will always be brittle at the edges. Task 7 closes the known-dangerous gap; it does not make the engine robust. This decision interacts with the audio/cost question Kaitlin raised and with any grant application.

- [ ] **Step 1: Present the three options and record the choice**

1. **Broaden patterns only.** Cheapest, still brittle, and every future gap is another silent mis-scoring.
2. **Add a semantic intent layer.** Robust; costs money per turn; needs its own governance and a privacy review — the proxy's `reviewedPrivacy` gate already models what that requires.
3. **Reframe offline honestly.** Keep the matcher, but label offline mode "practice — phrase-sensitive" and stop scoring coverage as if it measured clinical completeness.

Recommendation to present: **3 now, 2 if funded.** Option 3 removes the teaching-harm mechanism immediately and costs nothing; option 1 alone leaves the same failure mode waiting in phrasings nobody tested.

- [ ] **Step 2: Record the decision in this plan.** No code until it exists.

---

# WP-C · Learner contract and curricular calls (faculty-gated)

---

### Task 10: Resolve the learner entry contract (F5)

**Why:** The one-pager says "nothing here is required reading; it's all available whenever it's useful to you." The front door shows "0 of 5 done", a 0% ring, "~12 min left", and a next-unread pointer. Both are defensible; together they don't tell a student what is expected. Kaitlin asked this directly: *"Do you explain to them that this is a starting point?"*

**This is not mechanical.** A statement about what a rotation requires of enrolled students is a faculty claim, which is why it was removed from WP-A.

**Files:**
- Modify: `13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md:29` — **gated**

- [ ] **Step 1: GATE — choose the contract**

Present three drafts and let faculty pick or rewrite:

- **A — Starting point, nothing required.** "Nothing here is required reading. The weekly path is a suggested route; the progress marks are yours, and nobody else sees them."
- **B — Path expected, library optional.** "Work the weekly path — it's the spine of the rotation. Everything else is there when you need it."
- **C — Path expected, explicitly assessed.** Names which items feed evaluation.

Note for the discussion: option A is closest to the current wording but leaves the progress affordances unexplained; B matches what the interface actually communicates. **Stop until chosen.**

- [ ] **Step 2: Apply the chosen wording**

Edit line 29 and, if the contract mentions progress marks, confirm the Today view's framing agrees.

- [ ] **Step 3: Rebuild, check copy rules, commit**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
git add 13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md
git commit -m "docs(welcome): state the learner contract explicitly

Per faculty decision <DATE>. Resolves the ambiguity between 'nothing is
required reading' and a completion-tracked weekly path."
```

---

### Task 11: Decide the resident-extension question (F8b — decision only)

**Why:** The review **rejects** this as a defect. "Learner level: MS3 core, with labeled Resident extension blocks (shown on both sites)" is printed on the page's own third line and renders as a labelled aside. But whether that intent is right for MS3 learners is a real curricular question, and Kaitlin's "students could get lost" is an argument for revisiting it.

- [ ] **Step 1: GATE — decide**

Options: keep as-is (current design); collapse resident extensions by default on the MS3 site (now genuinely possible — Task 1 restored the disclosure mechanism); or strip them from the MS3 build via `resident_section.py`.

Note: option 2 became cheap only after Task 1. Sequence matters.

- [ ] **Step 2: If a change is chosen, write it as its own task in this plan.** Do not improvise it here — stripping content per-audience touches `resident_section.py` and the two-site contract.

---

# WP-D · Library density (measure first)

---

### Task 12: Re-measure Library load after WP-A, then decide (F9)

**Why:** Library exposes 83 items on MS3 and 92 on resident, all at once. The finding is real, but WP-A changes how much work Library has to do: with search ranking fixed and the therapy pathway wired, fewer journeys route through Library at all. Redesigning it before re-measuring risks solving a problem WP-A already shrank.

- [ ] **Step 1: Re-run the lost-learner journey after WP-A has shipped**

Fresh MS3 setup at 390 × 844. Attempt each of these **without** using Library: find therapy material; find the suicide protocol; find the question bank; find this week's reading. Record how many succeed via Today, Path, or search alone.

- [ ] **Step 2: Decide from the measurement**

If most journeys now succeed without Library, prefer a low-cost change — collapse columns by default on mobile (the mechanism Task 1 restored), or add a filter. If journeys still route through Library, escalate to a scoped redesign as its own plan.

- [ ] **Step 3: Record the measurement and the decision in this plan.**

---

## Deliberately not in this plan

| Item | Why |
|---|---|
| Git-LFS build failure | Environment artifact — objects are not pulled in this worktree. The gate behaved correctly. Not a defect. |
| Self-check answer disclosure on the therapy page | Depends on Task 1 landing first. Revisit as a follow-on once the disclosure mechanism is known-good in production. |
| Audio / video standardized patient | Kaitlin's original ask. Constraint is governance and cost, not technology — grant-dependent, out of scope here. |
| Passcode handling | Real and urgent, but it is an operational/security decision (rotation + distribution route), not a code change. Routed to faculty separately. |
| Any `ci.yml` change | Adding a step trips three separate contracts. Nothing here requires one. |

---

## Self-Review

**Spec coverage:** F1 → Task 2. F2 → Task 3. F3 → Task 4. F4 → Task 4. F5 → Task 10. F6 → Task 7. F7 → Task 6. F8a → Task 1. F8b → Task 11. F9 → Task 12. Iframe clip / third case → Task 8. Live-refusal copy → Task 8. Engine direction → Task 9. Self-check disclosure, LFS, audio, passcode → explicitly deferred above with reasons. No finding is unaddressed.

**Placeholder scan:** The only `<DATE>` tokens are in commit messages for gated tasks, where the date is the faculty decision date recorded in Step 1 of that task. The one `/* the exact phrasings recorded in Step 1 */` in Task 7 is a deliberate gate, not a placeholder — an agent must not invent which phrasings count as a suicide screen.

**Type consistency:** `fdSearchScore(item, rawQuery, contentWords)` and `fdSearchContentWords(words)` are defined in Task 3 Step 3 and used in Step 4 with matching signatures. `o.scrollReset` is defined and consumed in Task 2. `o.fromHistory` is pre-existing (`fd_wire.js:727`, `:751`, `:974`) and unchanged. The `_score` property is added and deleted within `fdSearchResults`, so the returned shape `{item, kind, meta}` is unchanged for `fdSearchResultRow`.
