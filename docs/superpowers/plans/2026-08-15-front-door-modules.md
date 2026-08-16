# Front Door Modules Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and unit-test the seven remaining front-door modules plus its stylesheet, leaving the shipped shell untouched.

**Architecture:** Every renderer is a **pure function of `(data, state) → HTML string`** with no DOM access — the shell's existing idiom, and what makes these modules testable before anything consumes them. A join layer (`fd_data.js`) turns `curriculum.json` + `topic_meta.json` + `tool_registry.json` + `site_manifest.json` into one item index the other six read. Event handling and browser APIs are confined to `fd_shell.js`. `index.html` is not modified by this plan.

**Tech Stack:** ES5-compatible vanilla JS snippet sources, `node:test`, CSS custom properties.

**Spec:** [`docs/superpowers/specs/2026-08-15-front-door-design.md`](../specs/2026-08-15-front-door-design.md).
**Visual ground truth:** [`docs/superpowers/specs/front-door-handoff/Front-Door-Hi-Fi-v2.dc.html`](../specs/front-door-handoff/Front-Door-Hi-Fi-v2.dc.html) — its inline styles are the normative source for every color, size, radius, shadow, and animation. Read its [README](../specs/front-door-handoff/README.md) first: parts of its data are deliberately superseded.

**Plan 1** (merged as [#361](https://github.com/jmoss333/psychiatry-clerkship/pull/361)) built `curriculum.json`, its validator, `topic_meta.safetySteps`, and `fd_state.js`. **Plan 3** does the swap: wiring, deletions, count pins, `RESIDENT_REBRAND`, and rewriting the 12 root tests and 5 smoke specs that read `spa_index.html`.

## Global Constraints

- **These files are build-injected snippets, not modules.** `common.py`'s `inject_shared_snippets()` does a plain textual `str.replace()` of a marker comment with the file body. No `import`/`export`. **ES5 only**: `var` and `function` declarations, no `const`/`let`/arrow functions/template literals/spread.
- **Marker registration is Plan 3's job.** Do not add entries to `SNIPPET_MARKERS` or touch `tests/parallel-ceilings.test.mjs` — nothing consumes these yet, and eight pin bumps for zero wiring is churn. Tests read module sources from disk.
- **Renderers are pure.** No `document`, `window`, `localStorage`, `Date.now()`, or `performance` inside a renderer. State and "now" arrive as parameters. Only `fd_shell.js` may touch browser APIs, and only in its non-renderer functions.
- **localStorage keys are `cw_*` or `rp_*`.** `check-static-site.mjs` hard-fails anything else.
- **Audience-neutral copy**: no `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford` in any emitted string. Say **"Exam"**, never "Shelf". Page slugs (`shelf.md`, `shelf-mode.html`) are identifiers, not copy.
- **Escape all interpolated text.** Titles, summaries, and query strings reach `innerHTML`. Use `fdEsc` from Task 1 everywhere.
- **No `'T00:00:00'` literal** in any front-door file — `tests/phase-chip.test.mjs` guards the shell and `phase_policy.js` owns the single sanctioned local-midnight parse.
- **No PHI.** No new dependencies; `node:test` only.
- **Rotations always start Monday** (confirmed 2026-08-15) — the first-run wizard must write a Monday-aligned `cw_rotation_start`.

---

## File structure

All under `13_Faculty_Resources/_automation/site_build/frontdoor/`, joining `fd_state.js` from Plan 1.

| File | Responsibility | Task |
|---|---|---|
| `fd_data.js` | Join `curriculum` + `topicMeta` + `toolRegistry` + `siteManifest` into one item index; `fdEsc` | 1 |
| `frontdoor.css` | Layout + component CSS (tokens live in `clinical-warm.css`) | 2 |
| `fd_shell.js` | Header, tab row, first-run wizard, keyboard map | 3 |
| `fd_today.js` | Greeting, Continue card + ring, week list, daily pick, rails | 4 |
| `fd_path.js` | Six-week timeline + week detail card | 5 |
| `fd_library.js` | Five-column index over every shipped page | 6 |
| `fd_reader.js` | Article pane, week navigator rail, prev/next footer, mobile action bar | 7 |
| `fd_search.js` | Ranking (pure) + ⌘K overlay markup | 8 |
| `fd_sheet.js` | Safety kit list, protocol view, item preview, nudge toast | 9 |

Tests land as `tests/fd-<name>.test.mjs`, mirroring `tests/fd-state.test.mjs`.

---

### Task 1: `fd_data.js` — the join layer

Every other module needs an item's title, minutes, summary, and attestation. Those facts are spread across three files (spec §4.2 — structure and facts are deliberately separated so neither duplicates the other). This module performs the join once.

**Titles come from `site_manifest.json`, not `topic_meta.json`.** `topic_meta` has no `title` field on any of its 73 entries — it describes a page's *content*, not its identity. `site_manifest.json` is the registry of shipped pages and carries `[sourcePath, slug, title]` for both `md` and `tools`; its tool titles match `tool_registry.json` exactly, so the manifest is the single title source for both kinds and `tool_registry` is consulted only for `riskLevel`.

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js`
- Test: `tests/fd-data.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces, all global on the injected page:
  - `fdEsc(s) -> string` — HTML-escapes `& < > " '`. Every other task uses it.
  - `fdBuildIndex(curriculum, topicMeta, toolRegistry, siteManifest) -> index` where `index` is
    `{ byRef: {<ref>: item}, weeks: [{n, title, theme, items: [item]}], columns: [{name, accent, items: [item]}], kit: [{item, sub}] }`
    and each `item` is `{ ref, kind, title, minutes, summary, points, attested, toolRef, risk, href }`.
    `kind` is `'read'` or `'tool'`; `minutes` is a number or `null`; `points` is an array (possibly empty); `attested` is a boolean; `toolRef` is a slug or `null`; `risk` is `'high'|'moderate'|'low'|null`; `href` is `'?page=<ref>'` or `'?tool=<ref>'`.
  - `fdItemsForWeek(index, n) -> [item]`
  - `fdFindWeek(index, n) -> week|null` — the week object itself, or `null` for an unknown week or a malformed index. Lives here rather than in a renderer because Today and Path both need it; hoisted during Task 5's review after the two modules were found carrying byte-identical copies.
  - `fdLibraryOnlyReads(index) -> [item]` — reads belonging to no week, for the daily pick.

- [ ] **Step 1: Write the failing test**

Create `tests/fd-data.test.mjs`:

```js
// Contract for the front-door join layer. Evaluates the real snippet body via new Function,
// following tests/fd-state.test.mjs. Exercised against BOTH a small fixture (for shape) and the
// repo's REAL curriculum.json + topic_meta.json (for the join actually holding on live data) --
// a fixture-only suite would not have caught a topic_meta field being renamed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const src = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${src}
  return { fdEsc: fdEsc, fdBuildIndex: fdBuildIndex, fdItemsForWeek: fdItemsForWeek,
           fdLibraryOnlyReads: fdLibraryOnlyReads };
`);
const F = make();

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CUR = readJson('../curriculum.json');
const META = readJson('../topic_meta.json');
const TOOLS = readJson('../tool_registry.json');
const MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');

const FIX_CUR = {
  weeks: [{ n: 1, title: 'W1', theme: 'T1', items: [{ ref: 'a.md', kind: 'read' }] },
          { n: 2, title: 'W2', theme: 'T2', items: [] }, { n: 3, title: 'W3', theme: 'T3', items: [] },
          { n: 4, title: 'W4', theme: 'T4', items: [] }, { n: 5, title: 'W5', theme: 'T5', items: [] },
          { n: 6, title: 'W6', theme: 'T6', items: [] }],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md', 'b.md'] }],
  libraryExclude: [],
  safetyKit: [{ ref: 'a.md', sub: 'Sub line' }],
  roles: { ms3: [], resident: [] },
  synonyms: {},
};
const FIX_META = {
  'a.md': { read: 6, tldr: 'Summary A', points: ['p1', 'p2'],
            facultyReview: { status: 'reviewed' }, relatedTools: ['t.html'] },
  'b.md': { read: 3, tldr: 'Summary B' },
};
const FIX_TOOLS = { tools: [{ file: 't.html', title: 'Tool T', category: 'acute-safety', riskLevel: 'high' }] };
const FIX_MAN = { tools: [['src/t.html', 't.html', 'Tool T']],
                  md: [['src/a.md', 'a.md', 'Page A'], ['src/b.md', 'b.md', 'Page B']] };

test('fdEsc escapes every character that could break out of markup', () => {
  assert.equal(F.fdEsc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
});

test('fdEsc coerces null and undefined to an empty string rather than printing them', () => {
  assert.equal(F.fdEsc(null), '');
  assert.equal(F.fdEsc(undefined), '');
});

test('an item joins minutes, summary, points and attestation from topic_meta', () => {
  const i = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN).byRef['a.md'];
  assert.equal(i.minutes, 6);
  assert.equal(i.summary, 'Summary A');
  assert.deepEqual(i.points, ['p1', 'p2']);
  assert.equal(i.attested, true);
  assert.equal(i.toolRef, 't.html');
});

test('a page with no topic_meta entry still yields a usable item', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('orphan.md');
  const i = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN).byRef['orphan.md'];
  assert.equal(i.minutes, null, 'missing metadata must degrade, not throw');
  assert.equal(i.summary, '');
  assert.deepEqual(i.points, []);
  assert.equal(i.attested, false);
});

test('attested is true only for facultyReview.status "reviewed"', () => {
  for (const [status, expected] of [['reviewed', true], ['pending', false], ['draft', false], ['retired', false]]) {
    const meta = { 'a.md': { read: 1, tldr: 'x', facultyReview: { status } } };
    assert.equal(F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].attested, expected, status);
  }
});

test('href routes by kind so deep links keep working', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.byRef['a.md'].href, '?page=a.md');
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  assert.equal(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN).byRef['t.html'].href, '?tool=t.html');
});

test('a tool item takes its title and risk from tool_registry', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  const i = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN).byRef['t.html'];
  assert.equal(i.title, 'Tool T');
  assert.equal(i.risk, 'high');
  assert.equal(i.kind, 'tool');
});

test('weeks carry resolved items in curriculum order', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.weeks.length, 6);
  assert.equal(idx.weeks[0].items[0].ref, 'a.md');
  assert.equal(idx.weeks[0].items[0].summary, 'Summary A', 'week items must be joined, not bare refs');
});

test('the kit carries its subtitle alongside the resolved item', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.kit[0].sub, 'Sub line');
  assert.equal(idx.kit[0].item.ref, 'a.md');
});

test('fdItemsForWeek returns that week only, and [] for an unknown week', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(F.fdItemsForWeek(idx, 1).length, 1);
  assert.deepEqual(F.fdItemsForWeek(idx, 9), []);
});

test('fdLibraryOnlyReads excludes week items and excludes tools', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  const refs = F.fdLibraryOnlyReads(idx).map((i) => i.ref);
  assert.ok(refs.indexOf('b.md') !== -1, 'b.md is in a column but no week');
  assert.ok(refs.indexOf('a.md') === -1, 'a.md is a week item');
});

// ---- against the REAL repo data -----------------------------------------------------

test('titles resolve to the real page names, not to the slug', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  // Asserting against known titles rather than truthiness: `title` falls back to `ref`, which is
  // always truthy, so assert.ok(it.title) passes even when every title is broken.
  assert.equal(idx.byRef['pg_suicide.md'].title, 'Suicide Risk & Safety Card');
  assert.equal(idx.byRef['mse.html'].title, 'Mental Status Exam');
});

test('no real item falls back to its slug as a title', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  const fellBack = Object.keys(idx.byRef).filter((r) => idx.byRef[r].title === r);
  assert.deepEqual(fellBack, [],
    `every placed page is in site_manifest.json, so none should degrade to its slug: ${fellBack}`);
});

test('the real curriculum joins without throwing and routes every week item', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  assert.equal(idx.weeks.length, 6);
  let n = 0;
  for (const w of idx.weeks) {
    for (const it of w.items) {
      assert.ok(it.href.indexOf('?') === 0, `week ${w.n} item ${it.ref} has no route`);
      n += 1;
    }
  }
  assert.equal(n, 40, 'expected the 40 week items curriculum.json ships');
});

test('every real library column item resolves', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  let placed = 0;
  for (const c of idx.columns) placed += c.items.length;
  assert.equal(placed, 81, 'expected the 81 pages curriculum.json places');
});

test('all five real kit items are attested and carry safety steps', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  assert.equal(idx.kit.length, 5);
  for (const k of idx.kit) {
    assert.equal(k.item.attested, true, `${k.item.ref} must be attested to appear in the kit`);
    assert.ok(META[k.item.ref].safetySteps.length >= 3, `${k.item.ref} needs safetySteps`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/fd-data.test.mjs`
Expected: FAIL — `ENOENT` reading `frontdoor/fd_data.js`.

- [ ] **Step 3: Write the module**

Create `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js`:

```js
/* Front door join layer. curriculum.json holds STRUCTURE (which pages, which week, which column);
   topic_meta.json holds the FACTS about each page (minutes, summary, key points, attestation);
   tool_registry.json holds tool identity and risk. Nothing is duplicated across those three, so
   something has to join them -- this is that something, done once, so the six renderers downstream
   read one shape.

   Pure: no DOM, no storage, no clock. Injected via a marker Plan 3 registers. */
function fdEsc(s){
  if(s===null||s===undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fdIsTool(ref){ return /\.html$/.test(ref); }

/* A page with no topic_meta entry still has to render -- the Library carries every shipped page
   and not all of them are topic-template pages. Degrade to a titled row rather than throwing:
   renderHome()'s history in this repo is that one unguarded throw blanks the whole surface. */
function fdMakeItem(ref, kind, topicMeta, toolIndex, titleIndex){
  var m=topicMeta[ref]||{};
  var t=toolIndex[ref]||null;
  var fr=m.facultyReview||{};
  var isTool=(kind==='tool')||fdIsTool(ref);
  return {
    ref: ref,
    kind: isTool?'tool':'read',
    /* Title comes from site_manifest.json, the registry of shipped pages. topic_meta has no
       title field on any entry -- it describes a page's content, not its identity -- so reading
       one there would silently degrade every .md row to its raw slug. Falling back to the ref is
       for a page the manifest does not list, which the curriculum validator already rejects. */
    title: titleIndex[ref]||ref,
    minutes: (typeof m.read==='number')?m.read:null,
    summary: m.tldr||'',
    points: (m.points&&m.points.length)?m.points:[],
    attested: fr.status==='reviewed',
    toolRef: (m.relatedTools&&m.relatedTools.length)?m.relatedTools[0]:null,
    risk: (t&&t.riskLevel)||m.safetyLevel||null,
    href: (isTool?'?tool=':'?page=')+ref
  };
}

function fdBuildIndex(curriculum, topicMeta, toolRegistry, siteManifest){
  var meta=topicMeta||{}, cur=curriculum||{};
  var toolIndex={}, list=(toolRegistry&&toolRegistry.tools)||[];
  for(var i=0;i<list.length;i++){ toolIndex[list[i].file]=list[i]; }

  /* site_manifest entries are [sourcePath, slug, title] triples for both md and tools. */
  var titleIndex={}, man=siteManifest||{};
  var groups=[man.tools||[], man.md||[]];
  for(var g=0;g<groups.length;g++){
    for(var e=0;e<groups[g].length;e++){ titleIndex[groups[g][e][1]]=groups[g][e][2]; }
  }

  var byRef={};
  function ensure(ref, kind){
    if(!byRef[ref]) byRef[ref]=fdMakeItem(ref, kind, meta, toolIndex, titleIndex);
    return byRef[ref];
  }

  var weeks=[], cw=cur.weeks||[];
  for(var w=0;w<cw.length;w++){
    var items=[], src=cw[w].items||[];
    for(var j=0;j<src.length;j++){ items.push(ensure(src[j].ref, src[j].kind)); }
    weeks.push({ n: cw[w].n, title: cw[w].title, theme: cw[w].theme, items: items });
  }

  var columns=[], cc=cur.libraryColumns||[];
  for(var c=0;c<cc.length;c++){
    var citems=[], refs=cc[c].refs||[];
    for(var r=0;r<refs.length;r++){ citems.push(ensure(refs[r], null)); }
    columns.push({ name: cc[c].name, accent: cc[c].accent, items: citems });
  }

  var kit=[], ck=cur.safetyKit||[];
  for(var k=0;k<ck.length;k++){ kit.push({ item: ensure(ck[k].ref, null), sub: ck[k].sub }); }

  return { byRef: byRef, weeks: weeks, columns: columns, kit: kit };
}

function fdItemsForWeek(index, n){
  for(var i=0;i<index.weeks.length;i++){ if(index.weeks[i].n===n) return index.weeks[i].items; }
  return [];
}

/* Candidates for the daily pick: reads that belong to no week, so the pick surfaces library
   breadth rather than re-suggesting this week's list. */
function fdLibraryOnlyReads(index){
  var inWeek={};
  for(var w=0;w<index.weeks.length;w++){
    for(var i=0;i<index.weeks[w].items.length;i++){ inWeek[index.weeks[w].items[i].ref]=true; }
  }
  var out=[];
  for(var ref in index.byRef){
    var it=index.byRef[ref];
    if(it.kind==='read'&&!inWeek[ref]) out.push(it);
  }
  out.sort(function(a,b){ return a.ref<b.ref?-1:(a.ref>b.ref?1:0); });
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/fd-data.test.mjs`
Expected: PASS — 14 tests. The three real-data tests are the ones that matter most; if they fail, the join is reading a `topic_meta` field that does not exist, so check the field names against a live entry rather than loosening the test.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js tests/fd-data.test.mjs
git commit -m "feat(frontdoor): fd_data.js — join curriculum, topic_meta and tool_registry

curriculum.json holds structure and topic_meta.json holds the facts, so
something has to join them once rather than each renderer reaching into
both. Tested against the real repo data as well as fixtures: a
fixture-only suite would not notice a topic_meta field being renamed."
```

---

### Task 2: `frontdoor.css` and the dark token set

The design ships one light palette; this repo ships a dark theme all 21 tools inherit (spec §2.4). Expressing the palette as custom properties in `clinical-warm.css` is what lets the toggle survive and keeps a tool opened from the front door visually consistent with it.

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/clinical-warm.css`
- Test: `tests/fd-tokens.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties below on `:root`, with dark counterparts under `[data-theme="dark"]`. Tasks 3-9 reference **only** these names, never a literal hex value.

| Token | Light | Role |
|---|---|---|
| `--fd-bg` | `#f6f3ee` | page background |
| `--fd-surface` | `#ffffff` | cards |
| `--fd-surface-warm` | `#fffdf9` | header, sheet |
| `--fd-line` | `#ebe5da` | hairline border |
| `--fd-line-strong` | `#ddd3c6` | control border |
| `--fd-line-hover` | `#c8baa7` | hover border |
| `--fd-text` | `#3b332c` | body text |
| `--fd-text-mid` | `#64574b` | secondary |
| `--fd-text-dim` | `#87786a` | tertiary / done |
| `--fd-terracotta` | `#b0674e` | primary action |
| `--fd-terracotta-dark` | `#96523b` | primary hover |
| `--fd-teal` | `#3a7d6e` | accent |
| `--fd-teal-deep` | `#2c6356` | accent text |
| `--fd-teal-wash` | `#edf4f2` | accent background |
| `--fd-success` | `#357160` | done state |
| `--fd-danger` | `#a34132` | safety |
| `--fd-danger-dark` | `#8f372a` | safety hover |
| `--fd-danger-wash` | `#fbefec` | safety background |
| `--fd-olive` | `#8b7040` | daily pick |
| `--fd-selected` | `#f3ebe5` | selected row |
| `--fd-chip` | `#f1ece6` | chip background |
| `--fd-callout` | `#fbf8f3` | key-points callout |

Exact values are from the prototype's inline styles — cross-check against
`docs/superpowers/specs/front-door-handoff/Front-Door-Hi-Fi-v2.dc.html`.

- [ ] **Step 1: Write the failing test**

Create `tests/fd-tokens.test.mjs`:

```js
// Pins the token contract rather than the pixels. Tasks 3-9 reference token NAMES only, so a
// renamed or dropped token silently breaks a surface that no unit test renders -- this catches it.
// Also pins that every token has a dark counterpart, which is the half of the palette the source
// design does not provide and is therefore the half most likely to be forgotten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const warm = readFileSync(new URL(`${BUILD}/clinical-warm.css`, import.meta.url), 'utf8');
const fd = readFileSync(new URL(`${BUILD}/frontdoor/frontdoor.css`, import.meta.url), 'utf8');

const TOKENS = [
  'fd-bg', 'fd-surface', 'fd-surface-warm', 'fd-line', 'fd-line-strong', 'fd-line-hover',
  'fd-text', 'fd-text-mid', 'fd-text-dim', 'fd-terracotta', 'fd-terracotta-dark',
  'fd-teal', 'fd-teal-deep', 'fd-teal-wash', 'fd-success', 'fd-danger', 'fd-danger-dark',
  'fd-danger-wash', 'fd-olive', 'fd-selected', 'fd-chip', 'fd-callout',
];

function block(css, selector) {
  const i = css.indexOf(selector);
  assert.ok(i !== -1, `no ${selector} block in clinical-warm.css`);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open, close);
}

test('every front-door token is defined in the light palette', () => {
  const light = block(warm, ':root');
  for (const t of TOKENS) assert.match(light, new RegExp(`--${t}\\s*:`), `missing --${t}`);
});

test('every front-door token has a dark counterpart', () => {
  const dark = block(warm, '[data-theme="dark"]');
  for (const t of TOKENS) assert.match(dark, new RegExp(`--${t}\\s*:`), `--${t} has no dark value`);
});

test('the dark palette actually differs from the light one', () => {
  const light = block(warm, ':root');
  const dark = block(warm, '[data-theme="dark"]');
  const grab = (css, t) => (css.match(new RegExp(`--${t}\\s*:\\s*([^;]+);`)) || [])[1];
  // Backgrounds and text must invert; an accidental copy-paste of the light block would pass the
  // presence tests above while shipping an unreadable dark mode.
  for (const t of ['fd-bg', 'fd-surface', 'fd-text']) {
    assert.notEqual(grab(light, t), grab(dark, t), `--${t} is identical in both themes`);
  }
});

test('frontdoor.css references tokens, never raw hex colours', () => {
  const hex = fd.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [],
    `frontdoor.css must use var(--fd-*), found raw hex: ${hex.join(', ')}`);
});

test('frontdoor.css carries no audience token', () => {
  assert.doesNotMatch(fd, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});

test('the desktop breakpoint is 1000px, as the design specifies', () => {
  assert.match(fd, /min-width:\s*1000px/,
    'desktop rails appear at >=1000px (design handoff, Global Frame)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/fd-tokens.test.mjs`
Expected: FAIL — `ENOENT` reading `frontdoor/frontdoor.css`.

- [ ] **Step 3: Add the tokens to `clinical-warm.css`**

Append the 22 light values to the existing `:root` block and a dark counterpart block. Derive the dark values by role, not by formula: backgrounds darken (`--fd-bg` to a warm near-black around `#211d1a`, `--fd-surface` to `#2a2521`, `--fd-surface-warm` to `#2f2a25`), text lightens (`--fd-text` to `#ece5db`, `--fd-text-mid` to `#bcb0a2`, `--fd-text-dim` to `#93887c`), lines lift off the background rather than sinking (`--fd-line` `#3a332c`, `--fd-line-strong` `#4a4139`, `--fd-line-hover` `#5d5248`), washes become low-alpha tints of their accent rather than pale pastels (`--fd-teal-wash` `#1d332e`, `--fd-danger-wash` `#3a231f`, `--fd-selected` `#3a2b24`, `--fd-chip` `#332c26`, `--fd-callout` `#2b2620`), and the accents themselves lighten enough to stay legible on a dark ground (`--fd-terracotta` `#d08a6f`, `--fd-teal` `#5fa392`, `--fd-teal-deep` `#7fc0ae`, `--fd-success` `#5aa48f`, `--fd-danger` `#d97a68`, `--fd-olive` `#c0a06a`).

Verify contrast rather than trusting the values: this repo ships `tests/contrast-check.mjs`. Run it against the new pairs and fix anything under 4.5:1 for body text or 3:1 for large text and borders.

- [ ] **Step 4: Write `frontdoor.css`**

Write the layout and component CSS for all seven surfaces, referencing `var(--fd-*)` exclusively. Take every dimension, radius, shadow, font size, and animation curve verbatim from the prototype at `docs/superpowers/specs/front-door-handoff/Front-Door-Hi-Fi-v2.dc.html` — its inline `style="…"` attributes are the normative source, and the section markers (search `══`) map each surface to its block.

The pieces the later tasks depend on, with the class names they will emit:

- `.fd-shell`, `.fd-header`, `.fd-tabs`, `.fd-tab`, `.fd-tab.is-active`
- `.fd-setup`, `.fd-role`, `.fd-weekgrid`, `.fd-weektile`, `.fd-weektile.is-sel`
- `.fd-today`, `.fd-continue`, `.fd-ring`, `.fd-list`, `.fd-row`, `.fd-check`, `.fd-check.is-done`, `.fd-chip`, `.fd-pick`
- `.fd-path`, `.fd-timeline`, `.fd-dot`, `.fd-dot.is-done`, `.fd-dot.is-current`, `.fd-detail`
- `.fd-library`, `.fd-col`, `.fd-collink`
- `.fd-reader`, `.fd-article`, `.fd-railnav`, `.fd-keypoints`, `.fd-trynow`, `.fd-prevnext`, `.fd-actionbar`
- `.fd-search`, `.fd-searchpanel`, `.fd-result`
- `.fd-sheet`, `.fd-sheetbackdrop`, `.fd-kitrow`, `.fd-step`, `.fd-doccallout`, `.fd-nudge`

Also carry the six keyframes the prototype defines (`fadeUp`, `sheetIn`, `backdropIn`, `popIn`, `checkPop`, `strikeDraw`, `ringPulse`) and honour `@media (prefers-reduced-motion: reduce)` by disabling them — the prototype has no reduced-motion handling and this repo's a11y tests expect it.

Mobile primary actions keep a 44px minimum hit target.

- [ ] **Step 5: Run the tests**

```bash
node --test tests/fd-tokens.test.mjs
node tests/contrast-check.mjs
```
Expected: PASS. If `contrast-check.mjs` needs the new pairs registered, add them there in this task.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css \
  13_Faculty_Resources/_automation/site_build/clinical-warm.css tests/fd-tokens.test.mjs
git commit -m "feat(frontdoor): stylesheet and the dark half of the palette

The source design ships one light palette; this repo ships a dark theme
that all 21 tools inherit. Expressing the palette as tokens in
clinical-warm.css keeps the toggle working and stops a tool opened from
the front door disagreeing with it.

Dark values are derived by role rather than formula, and the token test
pins that they actually differ -- a copied light block would pass a
presence check while shipping an unreadable dark mode."
```

---

### Task 3: `fd_shell.js` — header, tabs, first-run wizard, keyboard map

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js`
- Modify: `curriculum.json` (fill `roles`)
- Test: `tests/fd-shell.test.mjs`

> **This task also fills `curriculum.json`'s `roles`,** which Plan 1 deliberately left as
> `{"ms3": [], "resident": []}` because nothing consumed it. The wizard is that consumer, so the
> data belongs with it. Spec §2.5: role lists are per-site, because audience is already split at
> the site level and offering "Resident" on the MS3 build would either dead-end or link off-site.
>
> ```json
> "roles": {
>   "ms3": [
>     { "id": "student", "name": "Core rotation", "desc": "The six-week inpatient rotation", "hint": "most common" },
>     { "id": "subi", "name": "Sub-I / acting intern", "desc": "Acting intern on the unit", "hint": "" },
>     { "id": "staff", "name": "Nursing · SW · family", "desc": "Unit staff and families", "hint": "" }
>   ],
>   "resident": [
>     { "id": "pgy1", "name": "PGY-1", "desc": "First year on inpatient psychiatry", "hint": "most common" },
>     { "id": "pgy2", "name": "PGY-2 and above", "desc": "Senior on the unit", "hint": "" },
>     { "id": "staff", "name": "Nursing · SW · family", "desc": "Unit staff and families", "hint": "" }
>   ]
> }
> ```
>
> Note the MS3 labels avoid the banned audience tokens (`student`, `clerkship`, `resident`) in their
> **displayed text** — `"Core rotation"`, not `"MS3 · clerkship student"` as the prototype had it —
> because `curriculum.json` is one document read by both builds. The `id` values are identifiers and
> are not copy. Add a validator check in `validate_curriculum.py` that each role has non-empty `id`,
> `name`, and `desc`, and that no `name` or `desc` matches
> `/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`, with tests for both directions.

**Interfaces:**
- Consumes: `fdEsc` (Task 1); tokens (Task 2).
- Produces:
  - `fdHeader(state) -> string` — sticky header: logo button, search field with `⌘K` chip, week pill, Safety button.
  - `fdTabs(tab) -> string` — Today / Path / Library row; the active tab carries `.is-active` and `aria-current="page"`.
  - `fdSetupRole(roles) -> string` — step 1; each role is a `<button data-fd-role="<id>">`.
  - `fdSetupWeek(weeks, roleName) -> string` — step 2; each tile is `<button data-fd-week="<n>">`, plus the dashed browse button `data-fd-week="0"`.
  - `fdKeyAction(key, opts) -> action|null` where `opts` is `{typing, screen, searchOpen, sheetOpen, reading}` and `action` is one of `{type:'search'}`, `{type:'close'}`, `{type:'tab', tab:'today'|'path'|'library'}`, `{type:'nav', dir:-1|1}`. Pure — it takes a key name, not an event.

- [ ] **Step 1: Write the failing test**

Create `tests/fd-shell.test.mjs`:

```js
// The keyboard map is the part worth testing hardest: it is pure decision logic with six
// interacting conditions, and every one of its branches is a real usability bug when wrong
// (typing "1" in the search box must not switch tabs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_shell.js')}
  return { fdHeader: fdHeader, fdTabs: fdTabs, fdSetupRole: fdSetupRole,
           fdSetupWeek: fdSetupWeek, fdKeyAction: fdKeyAction };
`);
const F = make();

const OPTS = { typing: false, screen: 'app', searchOpen: false, sheetOpen: false, reading: false };
const o = (over) => Object.assign({}, OPTS, over);

// ---- keyboard map ----------------------------------------------------------------

test('slash and cmd-k open search', () => {
  assert.deepEqual(F.fdKeyAction('/', o()), { type: 'search' });
  assert.deepEqual(F.fdKeyAction('k', o({ meta: true })), { type: 'search' });
});

test('no shortcut fires while typing in an input', () => {
  for (const k of ['/', '1', '2', '3', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(F.fdKeyAction(k, o({ typing: true })), null, `${k} fired while typing`);
  }
});

test('escape closes search first, then the sheet', () => {
  assert.deepEqual(F.fdKeyAction('Escape', o({ searchOpen: true, sheetOpen: true })), { type: 'close' });
  assert.deepEqual(F.fdKeyAction('Escape', o({ sheetOpen: true })), { type: 'close' });
  assert.equal(F.fdKeyAction('Escape', o()), null, 'escape with nothing open does nothing');
});

test('1/2/3 switch tabs only when nothing is layered above the page', () => {
  assert.deepEqual(F.fdKeyAction('1', o()), { type: 'tab', tab: 'today' });
  assert.deepEqual(F.fdKeyAction('2', o()), { type: 'tab', tab: 'path' });
  assert.deepEqual(F.fdKeyAction('3', o()), { type: 'tab', tab: 'library' });
  assert.equal(F.fdKeyAction('1', o({ searchOpen: true })), null);
  assert.equal(F.fdKeyAction('1', o({ sheetOpen: true })), null);
});

test('arrows move between items only while reading', () => {
  assert.deepEqual(F.fdKeyAction('ArrowLeft', o({ reading: true })), { type: 'nav', dir: -1 });
  assert.deepEqual(F.fdKeyAction('ArrowRight', o({ reading: true })), { type: 'nav', dir: 1 });
  assert.equal(F.fdKeyAction('ArrowLeft', o()), null, 'arrows do nothing outside the reader');
});

test('no shortcut fires during first-run setup except nothing at all', () => {
  for (const k of ['/', '1', 'ArrowLeft']) {
    assert.equal(F.fdKeyAction(k, o({ screen: 'setup' })), null, `${k} fired during setup`);
  }
});

// ---- renderers -------------------------------------------------------------------

test('the active tab is marked for both CSS and assistive tech', () => {
  const html = F.fdTabs('path');
  assert.match(html, /class="[^"]*fd-tab[^"]*is-active[^"]*"[^>]*data-fd-tab="path"/);
  assert.match(html, /aria-current="page"/);
  assert.equal((html.match(/is-active/g) || []).length, 1, 'exactly one tab is active');
});

test('the header renders the safety button and the week pill', () => {
  const html = F.fdHeader({ week: 4 });
  assert.match(html, /data-fd-safety/);
  assert.match(html, /Week 4/);
});

test('the header says exam, never the site-specific word', () => {
  assert.doesNotMatch(F.fdHeader({ week: 6 }), /MS3|clerkship|student|shelf|resident/i);
});

test('role and week choices are addressable by the delegated click handler', () => {
  const roles = F.fdSetupRole([{ id: 'ms3', name: 'Student', desc: 'd', hint: 'most common' }]);
  assert.match(roles, /data-fd-role="ms3"/);
  const weeks = F.fdSetupWeek([{ n: 1, title: 'Foundations', theme: 't' }], 'Student');
  assert.match(weeks, /data-fd-week="1"/);
  assert.match(weeks, /data-fd-week="0"/, 'the browse option must be addressable too');
});

test('user-supplied text is escaped in every renderer', () => {
  const evil = '<img src=x onerror=1>';
  assert.doesNotMatch(F.fdSetupRole([{ id: 'x', name: evil, desc: evil, hint: '' }]), /<img/);
  assert.doesNotMatch(F.fdSetupWeek([{ n: 1, title: evil, theme: evil }], evil), /<img/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/fd-shell.test.mjs`
Expected: FAIL — `ENOENT` reading `frontdoor/fd_shell.js`.

- [ ] **Step 3: Write the module**

Create `fd_shell.js`. The keyboard map is the piece with exact required behaviour:

```js
/* Front door shell: header, tab row, first-run wizard, and the keyboard map.
   Renderers here are pure (state in, string out). Only Plan 3's wiring touches the DOM. */

/* Pure decision logic, deliberately taking a key NAME rather than an event, so every branch is
   testable without synthesising KeyboardEvents. Order matters: escape unwinds the topmost layer
   first, and nothing at all fires while the user is typing or still in first-run setup. */
function fdKeyAction(key, opts){
  var o=opts||{};
  if(o.typing) return null;
  if(o.screen!=='app') return null;
  if(key==='Escape'){ return (o.searchOpen||o.sheetOpen)?{type:'close'}:null; }
  if(key==='/'||(key==='k'&&o.meta)) return {type:'search'};
  if(o.searchOpen||o.sheetOpen) return null;
  if(key==='ArrowLeft'||key==='ArrowRight'){
    if(!o.reading) return null;
    return {type:'nav', dir:(key==='ArrowLeft')?-1:1};
  }
  if(key==='1'||key==='2'||key==='3'){
    var tabs=['today','path','library'];
    return {type:'tab', tab:tabs[parseInt(key,10)-1]};
  }
  return null;
}
```

Write `fdHeader`, `fdTabs`, `fdSetupRole`, and `fdSetupWeek` as string renderers using the class names from Task 2 and the markup structure in the prototype's sections at lines 34, 60, and 83. Every interpolated value goes through `fdEsc`. Every clickable element carries a `data-fd-*` attribute so Plan 3 can wire one delegated listener rather than per-element handlers.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/fd-shell.test.mjs`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js tests/fd-shell.test.mjs
git commit -m "feat(frontdoor): fd_shell.js — chrome, wizard, keyboard map

fdKeyAction takes a key name rather than an event so all six interacting
conditions are testable directly. Every branch is a real usability bug
when wrong: typing '1' in the search box must not switch tabs, and escape
has to unwind search before the sheet."
```

---

### Task 4: `fd_today.js`

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- Test: `tests/fd-today.test.mjs`

**Interfaces:**
- Consumes: `fdEsc`, `fdItemsForWeek`, `fdLibraryOnlyReads` (Task 1); `fdDailyPick`, `fdExamCountdown`, `fdRingStep` (Plan 1's `fd_state.js`).
- Produces:
  - `fdTodayProgress(items, doneMap) -> {done, total, pct, next}` — pure arithmetic; `next` is the first not-done item or `null`.
  - `fdRow(item, idx, doneMap, compact) -> string` — one item row. `compact` is optional and falsy by default; Path passes `true` for its denser detail rows. Shared rather than duplicated so a future escaping change reaches both surfaces.
  - `fdToday(index, state) -> string` where `state` is `{week, role, done, streak, desk, ringPct, nowMs}`.

> **The due row and capture triage are NOT part of this task.** Spec §1 ports both "prominent", and an earlier draft of this task listed them — but they render from `cw_srs_v1` and `cw_capture_v1`, runtime stores belonging to other subsystems, not from the item index every Plan 2 renderer is a pure function over. They also have no prototype markup and no `frontdoor.css` rules, because the design handoff never depicted them: they are repo features being carried forward, not design surfaces. Plan 3 ports them during wiring, where those stores are readable and the shell's existing `dueStripHtml()` / `capTriageHtml()` markup can be moved across and restyled onto `--fd-*` tokens. Do not accept `due` or `capture` in the state shape here — a parameter a renderer ignores is a trap for whoever passes it.

- [ ] **Step 1: Write the failing test**

Create `tests/fd-today.test.mjs`, following `tests/fd-data.test.mjs`'s `new Function` harness and concatenating `phase_policy.js`, `fd_state.js`, `fd_data.js`, and `fd_today.js` in that order (`fd_state` calls `localDayIndex` from `phase_policy`).

The pure arithmetic is pinned exactly — it is what the ring, the "X of Y done" label, and the week-complete state all read, so a disagreement between them starts here:

```js
const ITEMS = [{ ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' }];

test('progress is zero and safe on an empty week', () => {
  const p = F.fdTodayProgress([], {});
  assert.deepEqual(p, { done: 0, total: 0, pct: 0, next: null },
    'an empty week must not divide by zero');
});

test('pct rounds rather than truncating', () => {
  assert.equal(F.fdTodayProgress(ITEMS, { 'a.md': true }).pct, 33);
  assert.equal(F.fdTodayProgress(ITEMS, { 'a.md': true, 'b.md': true }).pct, 67);
});

test('next is the first not-done item, skipping earlier done ones', () => {
  assert.equal(F.fdTodayProgress(ITEMS, { 'a.md': true }).next.ref, 'b.md');
  assert.equal(F.fdTodayProgress(ITEMS, { 'b.md': true }).next.ref, 'a.md',
    'a done item mid-list must not become next');
});

test('next is null and pct 100 when the week is complete', () => {
  const p = F.fdTodayProgress(ITEMS, { 'a.md': true, 'b.md': true, 'c.md': true });
  assert.equal(p.next, null);
  assert.equal(p.pct, 100);
});

test('a done map naming items outside the week does not inflate the count', () => {
  assert.equal(F.fdTodayProgress(ITEMS, { 'z.md': true }).done, 0);
});
```

Then cover the rendering: the greeting varying by time of day derived from `state.nowMs` rather than a clock call; the week-complete kicker appearing only at 100%; a done row carrying `.is-done`; the daily pick omitted when every library read is done; quick tools rendering as a rail when `desk: true` and as chips otherwise; and every title escaped.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/fd-today.test.mjs` — Expected: FAIL, module missing.

- [ ] **Step 3: Write the module**

```js
/* Pure progress arithmetic, split out because it is what the ring, the "X of Y done" label and the
   week-complete state all read -- three surfaces that must never disagree. */
function fdTodayProgress(items, doneMap){
  var done=0, next=null, d=doneMap||{}, list=items||[];
  for(var i=0;i<list.length;i++){
    if(d[list[i].ref]) done++;
    else if(!next) next=list[i];
  }
  return { done: done, total: list.length, pct: list.length?Math.round(done*100/list.length):0, next: next };
}
```

Then `fdToday(index, state)` assembling the surfaces in the design's order: greeting (`Morning|Afternoon|Evening` derived from `state.nowMs`, never a clock call) with `Week N · title · weekday` plus the streak suffix at >= 2 and `fdExamCountdown(state.week, state.nowMs)`; the Continue card with the ring at `state.ringPct`; the week list with staggered rows; the daily pick from `fdDailyPick(fdLibraryOnlyReads(index), state.done, state.nowMs)`; and on `state.desk` the quick-tools and safety rails, or pill chips otherwise. Structure and values from the prototype's App-shell section.

- [ ] **Step 4: Run the tests** — `node --test tests/fd-today.test.mjs` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js tests/fd-today.test.mjs
git commit -m "feat(frontdoor): fd_today.js — greeting, continue card, week list, daily pick"
```

---

### Task 5: `fd_path.js`

**Files:**
- Create: `frontdoor/fd_path.js` · Test: `tests/fd-path.test.mjs`

**Interfaces:**
- Consumes: `fdEsc`, `fdItemsForWeek` (Task 1); `fdTodayProgress` (Task 4).
- Produces: `fdPath(index, state) -> string`, `state` = `{week, viewWeek, done}`.

- [ ] **Step 1: Write the failing test.** Cover: six timeline rows always render; the current week's dot carries `is-current` and the ones before it `is-done` only when actually complete; the selected row is `viewWeek`, not `week`; per-week counts read `d/t`; the detail card shows "you are here" only for the current week; "Set as my week" appears only when `viewWeek !== week` and carries `data-fd-setweek="<n>"`; with no week set nothing claims to be current; titles escaped.

- [ ] **Step 2: Run it — Expected: FAIL, module missing.**

- [ ] **Step 3: Write the module.** Timeline plus detail card, per the prototype's Path section. Dot state derives from `fdTodayProgress(fdItemsForWeek(index, n), state.done).pct === 100`, not from week ordering — a student can complete week 4 before week 3.

- [ ] **Step 4: Run the tests — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js tests/fd-path.test.mjs
git commit -m "feat(frontdoor): fd_path.js — six-week timeline and week detail"
```

---

### Task 6: `fd_library.js`

**Files:**
- Create: `frontdoor/fd_library.js` · Test: `tests/fd-library.test.mjs`

**Interfaces:**
- Consumes: `fdEsc` (Task 1).
- Produces: `fdLibrary(index) -> string`.

- [ ] **Step 1: Write the failing test.** Cover: all five columns render in `curriculum.json` order; **the count of rendered links equals 81 against the real `curriculum.json`** — this is the test that fails if a page silently stops being reachable, which is the whole reason the Library exists; each row carries `data-fd-open="<ref>"` and its column's accent class; the header reads "Everything, one screen" with the page count; titles escaped.

- [ ] **Step 2: Run it — Expected: FAIL, module missing.**

- [ ] **Step 3: Write the module.** `grid-template-columns:repeat(auto-fill,minmax(196px,1fr))` per the design, borderless button rows with a 6px category dot coloured by `accent`.

- [ ] **Step 4: Run the tests — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_library.js tests/fd-library.test.mjs
git commit -m "feat(frontdoor): fd_library.js — five columns over every shipped page"
```

---

### Task 7: `fd_reader.js`

**Files:**
- Create: `frontdoor/fd_reader.js` · Test: `tests/fd-reader.test.mjs`

**Interfaces:**
- Consumes: `fdEsc`, `fdItemsForWeek` (Task 1); `fdTodayProgress` (Task 4).
- Produces:
  - `fdReaderNeighbours(index, ref, week) -> {prev, next}` — either may be `null`.
  - `fdReader(index, state, bodyHtml) -> string`, `state` = `{ref, week, fromTab, done, desk}`. `bodyHtml` is already-rendered article markup supplied by the caller (Plan 3 passes `marked` output) and is **not** escaped — everything else is.

- [ ] **Step 1: Write the failing test.** Pin the neighbour arithmetic exactly — it drives both the prev/next footer and the `←`/`→` keyboard nav, which must agree:

```js
const WEEK = [{ ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' }];
const IDX = { weeks: [{ n: 1, title: 'W', theme: 'T', items: WEEK }] };

test('the first item has no prev and the last has no next', () => {
  assert.equal(F.fdReaderNeighbours(IDX, 'a.md', 1).prev, null);
  assert.equal(F.fdReaderNeighbours(IDX, 'c.md', 1).next, null);
});

test('a middle item has both neighbours, in week order', () => {
  const n = F.fdReaderNeighbours(IDX, 'b.md', 1);
  assert.equal(n.prev.ref, 'a.md');
  assert.equal(n.next.ref, 'c.md');
});

test('an item outside the week yields no neighbours rather than throwing', () => {
  assert.deepEqual(F.fdReaderNeighbours(IDX, 'zzz.md', 1), { prev: null, next: null },
    'a library-only page opened from the Library has no week to page through');
});
```

Then cover: the back link naming the originating tab; the attested pill present only when `item.attested`; the Key points callout omitted when `points` is empty; the "Try it now" launcher only when `toolRef` is set; the desktop-only primary button absent when `desk: false`; the prev/next footer present at **both** breakpoints; and — the regression test that matters — **the mobile action bar is a sibling of the article element, never a descendant**, because a transformed ancestor silently breaks `position: fixed` (design handoff §6). Assert on element order/nesting in the returned string.

- [ ] **Step 2: Run it — Expected: FAIL, module missing.**

- [ ] **Step 3: Write the module.** Per the prototype's reading-pane section. `bodyHtml` is injected verbatim; document that in a comment so nobody "fixes" it by escaping.

- [ ] **Step 4: Run the tests — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js tests/fd-reader.test.mjs
git commit -m "feat(frontdoor): fd_reader.js — article, week rail, prev/next, mobile bar

The mobile action bar is emitted as a sibling of the animated article, not
inside it: a transformed ancestor silently breaks position:fixed, and the
test pins the nesting rather than the styling."
```

---

### Task 8: `fd_search.js`

**Files:**
- Create: `frontdoor/fd_search.js` · Test: `tests/fd-search.test.mjs`

**Interfaces:**
- Consumes: `fdEsc` (Task 1).
- Produces:
  - `fdExpandQuery(q, synonyms) -> string`
  - `fdSearchResults(index, query, synonyms, state) -> [result]` where `result` is `{item, kind:'protocol'|'item', meta}`, protocols merged first, capped at 8.
  - `fdSearchOverlay(index, query, synonyms, state) -> string`

- [ ] **Step 1: Write the failing test.** Pin the ranking logic exactly — search is how a student finds a protocol under time pressure, so ordering and the cap are contracts, not preferences:

```js
const SYN = { etoh: 'alcohol withdrawal ciwa', si: 'suicide risk ideation' };

test('a known abbreviation expands, an unknown word is left alone', () => {
  assert.match(F.fdExpandQuery('etoh', SYN), /alcohol/);
  assert.match(F.fdExpandQuery('etoh', SYN), /etoh/, 'the original term must survive expansion');
  assert.equal(F.fdExpandQuery('pneumonia', SYN), 'pneumonia');
});

test('expansion is per-word, so a multi-word query expands each term', () => {
  const out = F.fdExpandQuery('etoh si', SYN);
  assert.match(out, /alcohol/);
  assert.match(out, /ideation/);
});

test('protocols rank ahead of ordinary items for the same query', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'suicide', SYN, {});
  assert.equal(r[0].kind, 'protocol',
    'a student typing "suicide" mid-shift needs the protocol first, not a topic page');
});

test('results are capped at 8 however many match', () => {
  assert.ok(F.fdSearchResults(REAL_INDEX, 'a', SYN, {}).length <= 8);
});

test('a query matching nothing returns an empty list rather than throwing', () => {
  assert.deepEqual(F.fdSearchResults(REAL_INDEX, 'zzzzqqq', SYN, {}), []);
});

test('the empty-state message escapes the user query', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '<img src=x onerror=1>', SYN, {});
  assert.doesNotMatch(html, /<img/, 'the query is echoed back into the empty state');
});
```

Build `REAL_INDEX` with `fdBuildIndex` over the repo's real `curriculum.json`/`topic_meta.json`, as Task 1's suite does. Then cover: matching over title + ref + summary, and the empty query returning the design's defaults (5 protocols, next unread, MSE builder, CIWA/COWS, pocket card).

- [ ] **Step 2: Run it — Expected: FAIL, module missing.**

- [ ] **Step 3: Write the module.** Substring match over the expanded query; synonyms come from `curriculum.json`, passed in rather than hardcoded.

- [ ] **Step 4: Run the tests — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js tests/fd-search.test.mjs
git commit -m "feat(frontdoor): fd_search.js — synonym-expanded ranking and overlay"
```

---

### Task 9: `fd_sheet.js`

**Files:**
- Create: `frontdoor/fd_sheet.js` · Test: `tests/fd-sheet.test.mjs`

**Interfaces:**
- Consumes: `fdEsc` (Task 1).
- Produces: `fdSheet(index, topicMeta, state) -> string`, `state` = `{sheet, sheetFrom, stepsDone, done}` where `sheet` is `'kit'`, a kit `ref`, or `'item:<ref>'`; and `fdNudge(item) -> string`.

- [ ] **Step 1: Write the failing test.** Cover: the kit list rendering all five rows from `index.kit` with their subtitles; a protocol view rendering that page's `safetySteps` **in order** and its `safetyDoc` in the Document callout; step checks reflecting `stepsDone` and being session-only; the `‹ kit` back affordance present only when `sheetFrom` is set; **the attested line rendering only when `item.attested` is true** — the pill must never claim a review that is not recorded; the item-preview variant; `fdNudge` naming the item and its minutes; and every clinical string escaped.

Add one test asserting the five real kit protocols each render >= 3 steps from the live `topic_meta.json`, so a `safetySteps` array being emptied is caught here rather than on the ward.

- [ ] **Step 2: Run it — Expected: FAIL, module missing.**

- [ ] **Step 3: Write the module.** Per the prototype's side-sheet section. Protocol content comes from `topicMeta[ref].safetySteps` / `.safetyDoc` — never from a literal in this file.

- [ ] **Step 4: Run the tests — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js tests/fd-sheet.test.mjs
git commit -m "feat(frontdoor): fd_sheet.js — safety kit, protocol view, item preview

Protocol steps render from topic_meta.safetySteps rather than any literal
here, so the faculty-attested content is the only source. The attested
line renders only when facultyReview.status is 'reviewed'."
```

---

## Verification before handoff to Plan 3

```bash
node --test tests/*.test.mjs
node tests/contrast-check.mjs
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Both builds must still pass and `index.html` must be byte-identical to its state at the start of this plan — confirm with `git diff --stat <plan-start-sha> -- 13_Faculty_Resources/_automation/site_build/spa_index.html`, which must print nothing. Nothing in this plan touches the shipped shell.

**A note on test resolution.** Tasks 1-3 carry complete test code. Tasks 4-9 carry complete code for their **pure logic** — progress arithmetic, neighbour resolution, query expansion and ranking — and prose specifications for their **markup** assertions. That split is deliberate, not a shortcut: the exact HTML is derived from the prototype, so pinning literal strings in this plan would either duplicate the design source or contradict it. Pin structure, `data-fd-*` hooks, escaping, and conditional presence; do not pin exact class-attribute strings or copy that the prototype governs.

**Deliberately not covered here — Plan 3 owns all of it:** **the Today due row and capture triage**, which spec §1 ports "prominent" but which render from the `cw_srs_v1` and `cw_capture_v1` runtime stores rather than the item index, have no prototype markup and no `frontdoor.css` rules, and whose existing `dueStripHtml()` / `capTriageHtml()` implementations are moved across and restyled onto `--fd-*` tokens during wiring; **a copy rule for `frontdoor/` in `build_deploy.py`**, without which `frontdoor.css` 404s in production while every local test stays green; registering the eight markers in `SNIPPET_MARKERS` and bumping `EXPECTED_MARKER_COUNT`; build-time injection of `curriculum.json`/`topic_meta.json` into the page; **the per-surface `try`/`catch` that spec §6 requires** — renderers here are pure and throw freely, and the caller that wraps each one arrives with the wiring; replacing `spa_index.html`'s body and render path; deleting the sidebar, `renderModeCompanion`, and `renderWardDashboard`; retiring `learning-path.html` and its four count pins; rewriting `RESIDENT_REBRAND`; rewriting the 12 root tests and 5 smoke specs that read `spa_index.html`; adding `frontdoor/` to `extractShellCopy()`; per-site column scoping for the 11 `libraryExclude` entries; resident nav reconciliation; and regenerating visual baselines on the Ubuntu runner.
