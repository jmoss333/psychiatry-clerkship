# Front Door Shell Swap Implementation Plan (Plan 3 of 3)

> **For any agent picking this up — Claude Code, Codex, or a human.** This plan is deliberately
> self-contained: every decision, constraint, and carry-in you need is written below rather than
> referenced from a session ledger. Work the tasks in order; each ends at a green gate and a commit.
> Repo conventions live in `CLAUDE.md` (Claude) and `AGENTS.md` (Codex) — they are byte-identical by
> CI contract, so read whichever your tool loads. If you edit one, run `cp CLAUDE.md AGENTS.md`.

**Goal:** Replace the shell with the front door — wire the nine modules into `index.html`, delete the sidebar, and repoint every test that read the old shell.

**Architecture:** Plans 1 and 2 built validated data (`curriculum.json`, `topic_meta.safetySteps`) and nine pure modules under `site_build/frontdoor/`, none of which anything consumes yet. This plan does the single integration: register the markers, inject the data, replace `spa_index.html`'s body and boot, add the one delegated event listener, delete what the design supersedes, and rewrite the 13 root tests and 5 smoke specs that are structurally coupled to the old shell.

**Tech Stack:** Python 3 build scripts (stdlib only), ES5-compatible vanilla JS snippets, `node:test`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-15-front-door-design.md`](../specs/2026-08-15-front-door-design.md)
**Class contract:** [`docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`](../specs/front-door-handoff/CLASS-INVENTORY.md)
**Visual ground truth:** [`docs/superpowers/specs/front-door-handoff/Front-Door-Hi-Fi-v2.dc.html`](../specs/front-door-handoff/Front-Door-Hi-Fi-v2.dc.html) — its inline styles are normative for every colour, size, radius, shadow, and animation. Its README says which parts of it are superseded; read that first.

**Prior plans:** [Plan 1](2026-08-15-front-door-foundation.md) (merged, PR #361) · [Plan 2](2026-08-15-front-door-modules.md)

---

## Global Constraints

- **The nine modules are build-injected snippets, not JS modules.** `common.py`'s `inject_shared_snippets()` does a plain textual `str.replace()` of a marker comment with the file body. **ES5 only** in them: `var`/`function`, no `const`/`let`/arrow functions/template literals. They have no imports or exports.
- **localStorage keys must be `cw_*` or `rp_*`.** `check-static-site.mjs` hard-fails any other prefix in `index.html`.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.
- **Shared shell copy is audience-neutral**: no `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford` in any string shipping to both sites without passing through `RESIDENT_REBRAND`. Say **"Exam"**, never "Shelf". Page slugs (`shelf.md`, `shelf-mode.html`) are identifiers and exempt.
- **Never edit `.github/workflows/*.yml`.** Any workflow edit trips a CI-only double pin in `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py` (`EXPECTED_STEP_INVENTORIES` plus a SHA-256 contract digest) that the local battery never runs. Everything this plan needs reaches CI through `build_and_check.sh`, which CI already invokes.
- **Crisis contacts come only from `crisis_resources.json`** via the `<!-- crisis-block -->` / `<!-- crisis-block-html -->` markers. Never hard-code a crisis number.
- **No PHI.** Clinical content is synthetic / de-identified only.
- **Rotations always start Monday** (confirmed by the repo owner, 2026-08-15). The first-run wizard must write a Monday-aligned `cw_rotation_start`.
- **Protocol content renders only from `topic_meta[ref].safetySteps` / `.safetyDoc`.** Never a literal. Those fields are faculty-attested; the prototype's own `PROTOCOLS` object is a superseded version and must not be copied.
- **The attested affordance must never over-claim** — it renders only when `facultyReview.status === 'reviewed'`, and never over an empty body.
- No new dependencies. `node --test` and stdlib Python only.

---

## What already exists, and what it is called

Nine files under `13_Faculty_Resources/_automation/site_build/frontdoor/`, each a pure snippet source with a `node --test` suite (`tests/fd-*.test.mjs`). **None is registered as a marker yet — that is Task 1.**

| Module | Key exports |
|---|---|
| `fd_state.js` | `FD_STORE` (`'cw_frontdoor_v1'`), `fdLoad()`, `fdSave(o)`, `fdExamCountdown(week,nowMs)`, `fdDailyPick(cands,doneMap,nowMs)`, `fdRingStep(from,to,elapsed,dur)` |
| `fd_data.js` | `fdEsc(s)`, `fdBuildIndex(curriculum,topicMeta,toolRegistry,siteManifest)`, `fdItemsForWeek(index,n)`, `fdFindWeek(index,n)`, `fdLibraryOnlyReads(index)` |
| `fd_shell.js` | `fdHeader(state)`, `fdTabs(tab)`, `fdSetupRole(roles)`, `fdSetupWeek(weeks,roleName)`, `fdKeyAction(key,opts)` |
| `fd_today.js` | `fdTodayProgress(items,doneMap)`, `fdRow(item,idx,doneMap,compact)`, `fdToday(index,state)` |
| `fd_path.js` | `fdPath(index,state)` |
| `fd_library.js` | `fdLibrary(index)` |
| `fd_reader.js` | `fdReaderNeighbours(index,ref,week)`, `fdReader(index,state,bodyHtml)` |
| `fd_search.js` | `fdExpandQuery(q,syn)`, `fdSearchResults(index,query,syn,state)`, `fdSearchOverlay(index,query,syn,state)` |
| `fd_sheet.js` | `fdSheet(index,topicMeta,state)`, `fdNudge(item)` |

Plus `frontdoor/frontdoor.css` (all seven surfaces) with its 22 design tokens + 11 derived tokens declared in `clinical-warm.css`, light and dark.

**Dependency order for injection — this is load-bearing.** `phase_policy.js` → `fd_state.js` → `fd_data.js` → `fd_today.js` → the rest. `fd_state` calls `localDayIndex` from `phase_policy`; `fd_path` and `fd_reader` call `fdTodayProgress` and `fdRow` from `fd_today`. Injecting out of order produces a page that throws on boot.

### `data-fd-*` attribute contract

One delegated listener reads these. They are the entire wiring surface:

| Attribute | Meaning |
|---|---|
| `data-fd-open="<ref>"` | Open the item — **navigate**, unless `data-fd-sheet` is also present |
| `data-fd-sheet` (bare) | Modifier: open as a preview side sheet instead of navigating |
| `data-fd-safety="<ref>"` | Open the safety protocol sheet for that page |
| `data-fd-toggle="<ref>"` | Toggle an item's done checkbox |
| `data-fd-tab="<today\|path\|library>"` | Switch tab |
| `data-fd-week="<n>"` | First-run wizard: pick week (`0` = "just browse") |
| `data-fd-setweek="<n>"` | Path: adopt the viewed week as the rotation week |
| `data-fd-role="<id>"` | First-run wizard: pick role |
| `data-fd-step="<i>"` | Sheet: toggle a protocol step (session-only) |
| `data-fd-back`, `data-fd-home`, `data-fd-search`, `data-fd-change-week` | Bare action flags |

⚠ **`data-fd-safety` is emitted by two surfaces** — Today's kit cards (`fd_today.js`) and the sheet's own kit rows (`fd_sheet.js`). The handler must distinguish them by DOM context to set `sheetFrom:'kit'` correctly, or the `‹ kit` back affordance silently never renders. Task 4 owns this.

---

## Carry-ins — things earlier plans deliberately left for this one

Each is a real gap, not a nicety. Tasks below own them; this table is so nothing is lost if tasks are worked out of order.

| Carry-in | Why it matters | Task |
|---|---|---|
| `build_deploy.py` has **no copy rule for `frontdoor/`** | `frontdoor.css` 404s in production while every local test stays green | 1 |
| Markers unregistered; `EXPECTED_MARKER_COUNT` is 7 | Nothing injects the modules | 1 |
| `.fd-article__body` has **no CSS rule and no inventory entry** | Spec §5 wants 16.5px/1.72/62ch; those values live only on `.fd-article__lead`, so `marked()` output renders at inherited size with browser-default headings inside a Georgia card | 2 |
| Due row + capture triage not ported | Spec §1 ports both "prominent"; they read `cw_srs_v1`/`cw_capture_v1`, runtime stores no pure renderer could reach | 5 |
| `libraryColumns` has no per-site scoping | 11 exclusions were added for pages one site ships and the other does not | 6 |
| Resident nav reconciliation | 9 resident-only pages reach users **only** via `resident_section.py`'s `nav.json`; deleting the sidebar orphans them | 6 |
| `spa_index.html` is in neither `_CRISIS_REQUIRED_MD` nor `_CRISIS_REQUIRED_TOOLS` | The shell becomes a risk-work surface once it renders protocol sheets | 7 |
| No "not yet faculty-reviewed" affordance | A non-attested protocol is signalled only by *absence* of the teal line, invisible to anyone who has not seen the attested version | 7 |
| Empty protocol sheet reads "nothing to do" | Honest since Plan 2 (no false attestation) but still not "this failed to load" — needs copy the repo owner approves | 7 |
| `extractShellCopy()` does not scan `frontdoor/` | `fd_state.js`'s own comment credits it with enforcement it does not perform | 8 |
| `.fd-tip` a11y: `✓` announced for unchecked steps | Fixed in `fd_sheet.js`; `fd_today.js` and `fd_search.js` still have it | 4 |

### Smaller carry-ins from Plan 2's whole-branch review

Each is real but is regression-protection or cosmetics on correct code. Fold into the task whose files they touch.

| Item | Note |
|---|---|
| **Ratify the `data-fd-*` names before writing any handler** | `data-fd-home`/`-search`/`-change-week`/`-back` were invented by one task and never confirmed. The `.fd-trynow` gap that reached the final review was exactly this class — a contract discovered by writing the consumer. Settle the vocabulary in Task 4 **first**. |
| Mobile "Quick tools" heading is missing | ⚠ trap: `frontdoor.css:552` hides only `.fd-quicktools--pills`, so a naive `<h2>` duplicates "Quick tools" on desktop. Needs a wrapper or a new scoped rule. |
| `tests/fd-*` coverage gaps (5) | Listed in the review journal; add alongside whichever task touches the module. |
| Search expands prototype-era synonym keys | Harmless, but the map should match the shipped `curriculum.json` vocabulary. |
| `CLASS-INVENTORY.md` preamble counts drift | Recompute (`:6` → 173/13, `:9-10` → 173/134) in the same edit as Task 2's inventory additions. |
| `test_validate_curriculum.py` runs in no gate | Add to **`build_and_check.sh`**, never `ci.yml` — a workflow edit trips the step-inventory/digest double pin. |
| Reader primary button label vs state | On an already-done item it reads "Next: … →" while announcing `aria-pressed="true"`. Honest but mismatched; belongs with the wiring. |

### Open questions for the repo owner — do not decide these yourself

1. **The light palette misses WCAG AA in 11 places**, including white-on-primary-button at 4.29:1 where 4.5 is required at the design's text size. Left verbatim because the prototype is normative for visuals. `tests/fd-contrast.test.mjs` pins the existing failures so no *new* debt can land. Repainting an approved palette is the owner's call.
2. **Should a non-attested page's `safetySteps` render at all?** Current answer: yes, with no attestation claim. The reviewer's recommendation, adopted: keep rendering, but add an affirmative "not yet faculty-reviewed" line (Task 7). All five kit pages are `reviewed` today, so this is currently hypothetical.
3. **Copy for a failed-to-load protocol sheet** (Task 7). Nobody should invent safety-surface copy unasked.

---

## File structure

| File | Change | Task |
|---|---|---|
| `site_build/common.py` | Register 8 markers in `SNIPPET_MARKERS` | 1 |
| `tests/parallel-ceilings.test.mjs` | `EXPECTED_MARKER_COUNT` 7 → 15 | 1 |
| `site_build/build_deploy.py` | Copy `frontdoor.css`; inject curriculum/topic_meta/manifest/roles as JSON literals | 1 |
| `site_build/frontdoor/frontdoor.css` | `.fd-article__body` + descendant typography | 2 |
| `specs/front-door-handoff/CLASS-INVENTORY.md` | `.fd-article__body`, preview meta line, Source label | 2 |
| `site_build/spa_index.html` | **Replace** body + boot; keep governance, faculty-preview, theme, SW | 3, 4 |
| `site_build/frontdoor/fd_wire.js` | **New** — the one delegated listener, routing, per-surface try/catch | 4 |
| `site_build/frontdoor/fd_due.js` | **New** — due row + capture triage, ported and restyled | 5 |
| `site_build/resident_section.py` | Rewrite `RESIDENT_REBRAND`; drop the `learning-path` rebrand | 6 |
| `curriculum.json`, `validate_curriculum.py` | Per-site column scoping | 6 |
| `_automation/validate_tool_governance.py` | `SITE_EXTRAS`, `EXPECTED_TOOL_COUNTS` 23→22 / 25→24 | 6 |
| `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` | `assertInventory` 23→22 / 25→24 | 6 |
| `site_build/build_deploy.py` | Crisis-required set gains the shell | 7 |
| 13 root `tests/*.test.mjs` | Repoint at module sources | 8 |
| 5 `tests/smoke/*.spec.js` | Rewrite for the new chrome | 9 |

**Deleted:** the sidebar and rail markup; `renderModeCompanion`, `renderWardDashboard`, `itemsForMode`, `scoreItemForMode`, `dashboardMode`; `01_Six_Week_Curriculum/learning-path.html`; `tests/smoke/mode-companion.spec.js`.

---

### Task 1: Build wiring — markers, asset copy, data injection

Nothing consumes the modules today. This makes them reachable without changing a pixel: after this task the shell still renders exactly as it does now, but the modules are injected and their data is on the page.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` (`SNIPPET_MARKERS`)
- Modify: `tests/parallel-ceilings.test.mjs` (`EXPECTED_MARKER_COUNT`)
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (marker comments + data needle only)
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py`, `tests/fd-inject.test.mjs` (new)

**Interfaces:**
- Consumes: the nine module files.
- Produces: on the built page, globals `FD_CURRICULUM`, `FD_TOPIC_META`, `FD_TOOL_REGISTRY`, `FD_SITE_MANIFEST`, `FD_ROLES` (the per-site role list), and every module function listed in "What already exists".

- [ ] **Step 1: Write the failing tests**

Add to `test_common.py`, mirroring the existing `test_phase_policy_snippet_expands_with_short_signature`:

```python
    def test_every_frontdoor_snippet_expands(self):
        """All eight frontdoor markers resolve through the frontdoor/ subdirectory."""
        markers = [
            ("/*__FD_DATA__*/", "function fdEsc("),
            ("/*__FD_SHELL__*/", "function fdKeyAction("),
            ("/*__FD_TODAY__*/", "function fdTodayProgress("),
            ("/*__FD_PATH__*/", "function fdPath("),
            ("/*__FD_LIBRARY__*/", "function fdLibrary("),
            ("/*__FD_READER__*/", "function fdReaderNeighbours("),
            ("/*__FD_SEARCH__*/", "function fdExpandQuery("),
            ("/*__FD_SHEET__*/", "function fdSheet("),
        ]
        for marker, needle in markers:
            p = self._page("<script>\n%s\n</script>" % marker)
            self.assertTrue(common.inject_shared_snippets(p), marker)
            t = open(p, encoding="utf-8").read()
            self.assertIn(needle, t, marker)
            self.assertNotIn(marker, t, marker)
```

Create `tests/fd-inject.test.mjs`:

```js
// Pins the ORDER of the injected snippets, which is load-bearing: fd_state calls localDayIndex
// from phase_policy, and fd_path/fd_reader call fdTodayProgress/fdRow from fd_today. A page whose
// markers appear in the wrong order throws on boot -- and every module's own unit suite would
// still pass, because each concatenates its own dependencies. This is the only test that sees the
// real page order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SHELL = '../13_Faculty_Resources/_automation/site_build/spa_index.html';
const src = readFileSync(new URL(SHELL, import.meta.url), 'utf8');

const ORDER = [
  '/*__PHASE_POLICY__*/', '/*__FD_STATE__*/', '/*__FD_DATA__*/', '/*__FD_TODAY__*/',
  '/*__FD_SHELL__*/', '/*__FD_PATH__*/', '/*__FD_LIBRARY__*/', '/*__FD_READER__*/',
  '/*__FD_SEARCH__*/', '/*__FD_SHEET__*/',
];

test('every front-door marker appears exactly once in the shell', () => {
  for (const m of ORDER) {
    assert.equal(src.split(m).length - 1, 1, `${m} must appear exactly once`);
  }
});

test('markers appear in dependency order', () => {
  let last = -1;
  for (const m of ORDER) {
    const at = src.indexOf(m);
    assert.ok(at > last, `${m} must come after ${ORDER[ORDER.indexOf(m) - 1] || 'the start'}`);
    last = at;
  }
});

test('the shell declares the data needles the build replaces', () => {
  for (const n of ['FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY',
                   'FD_SITE_MANIFEST', 'FD_ROLES']) {
    assert.equal(src.split('var ' + n + '=').length - 1, 1,
      `exactly one 'var ${n}=' declaration, for build_deploy.py to replace`);
  }
});
```

- [ ] **Step 2: Run both to verify they fail**

```bash
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/fd-inject.test.mjs
```
Expected: FAIL — the markers are not registered and the shell carries neither markers nor data needles.

- [ ] **Step 3: Register the markers**

In `common.py`, extend `SNIPPET_MARKERS` with the eight new entries (`fd_state.js` is already there):

```python
    "/*__FD_DATA__*/": "frontdoor/fd_data.js",
    "/*__FD_SHELL__*/": "frontdoor/fd_shell.js",
    "/*__FD_TODAY__*/": "frontdoor/fd_today.js",
    "/*__FD_PATH__*/": "frontdoor/fd_path.js",
    "/*__FD_LIBRARY__*/": "frontdoor/fd_library.js",
    "/*__FD_READER__*/": "frontdoor/fd_reader.js",
    "/*__FD_SEARCH__*/": "frontdoor/fd_search.js",
    "/*__FD_SHEET__*/": "frontdoor/fd_sheet.js",
```

Bump `EXPECTED_MARKER_COUNT` in `tests/parallel-ceilings.test.mjs` from 7 to 15 and extend its comment to name the new markers. That test's own docstring requires the pin move **in the same diff** as the marker change.

- [ ] **Step 4: Add the marker comments and data needles to the shell**

In `spa_index.html`, inside the existing script region, add the ten markers in the order `tests/fd-inject.test.mjs` pins, and five data declarations the build will replace:

```js
var FD_CURRICULUM={};
var FD_TOPIC_META={};
var FD_TOOL_REGISTRY={};
var FD_SITE_MANIFEST={};
var FD_ROLES=[];
```

Leave the rest of the shell alone — this task changes no rendering.

- [ ] **Step 5: Copy the stylesheet and inject the data in `build_deploy.py`**

Follow the existing `_copy_required(CLINICAL_CSS, OUT+"/clinical-warm.css", _missing_req)` pattern at `build_deploy.py:361` to copy `frontdoor/frontdoor.css` to `OUT+"/frontdoor.css"`, and add a `<link>` to it in the shell's head alongside `clinical-warm.css`.

Then replace the five data needles with real JSON, using the repo's **verified-replacement** idiom — a missing or duplicated needle must abort the build, exactly as the `RETIRED_QB_IDS` injection at `build_deploy.py:~375` does. Roles are per-site: inject `curriculum.json`'s `roles.ms3` for the ms3 build and `roles.resident` for the resident build.

- [ ] **Step 6: Verify**

```bash
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/fd-inject.test.mjs tests/parallel-ceilings.test.mjs
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```
All must pass. Then confirm the built page actually carries the data, not the empty needles:

```bash
grep -c 'var FD_CURRICULUM={}' _build/ms3/index.html   # must print 0
grep -o 'var FD_ROLES=\[[^]]\{0,60\}' _build/ms3/index.html
grep -o 'var FD_ROLES=\[[^]]\{0,60\}' _build/res/index.html
```
The last two must differ — that is the per-site roles proof.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/common.py \
  13_Faculty_Resources/_automation/site_build/build_deploy.py \
  13_Faculty_Resources/_automation/site_build/spa_index.html \
  13_Faculty_Resources/_automation/site_build/test_common.py \
  tests/parallel-ceilings.test.mjs tests/fd-inject.test.mjs
git commit -m "feat(frontdoor): inject the modules, their data, and the stylesheet

Registers the eight remaining markers, copies frontdoor.css into the build
(without which it 404s in production while every local test stays green),
and injects curriculum/topic_meta/tool_registry/site_manifest plus the
per-site role list as verified replacements.

Marker order is pinned by tests/fd-inject.test.mjs: fd_state needs
localDayIndex from phase_policy, and fd_path/fd_reader need fdTodayProgress
from fd_today. Every module's own suite concatenates its dependencies, so
this is the only test that sees the real page order."
```

---

### Task 2: Article body typography

`marked()` output lands in `.fd-article__body`, which has no rule at all. Spec §5 specifies 16.5px/1.72 with `max-width:62ch`; those values exist only on `.fd-article__lead`. Untouched, the reading experience renders at inherited size with browser-default headings, lists, links, and code inside a Georgia card.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Test: `tests/fd-tokens.test.mjs`

**Interfaces:** Consumes nothing. Produces `.fd-article__body` and its descendant typography.

- [ ] **Step 1: Write the failing test**

Append to `tests/fd-tokens.test.mjs`:

```js
test('the article body carries the spec typography, not browser defaults', () => {
  const body = fd.match(/\.fd-article__body\s*\{([^}]*)\}/);
  assert.ok(body, '.fd-article__body must have a rule — marked() output lands there');
  assert.match(body[1], /font-size:\s*16\.5px/, 'spec §5: 16.5px');
  assert.match(body[1], /line-height:\s*1\.72/, 'spec §5: 1.72');
  assert.match(body[1], /max-width:\s*62ch/, 'spec §5: 62ch measure');
});

test('article body descendants are styled, not left to the browser', () => {
  for (const sel of ['h2', 'h3', 'ul', 'ol', 'li', 'a', 'code', 'blockquote']) {
    assert.match(fd, new RegExp(`\\.fd-article__body\\s+${sel}\\b`),
      `.fd-article__body ${sel} needs a rule — marked() emits it`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/fd-tokens.test.mjs`
Expected: FAIL — `.fd-article__body must have a rule`.

- [ ] **Step 3: Write the rules**

Add `.fd-article__body` with the three spec values, then descendant rules for `h2 h3 ul ol li a code blockquote` derived from the prototype's article section. Colours come from `var(--fd-*)` only — `frontdoor.css` must keep zero raw hex, which `tests/fd-tokens.test.mjs` already enforces.

- [ ] **Step 4: Document it**

Add `.fd-article__body` to CLASS-INVENTORY's **Reader** tree and notes table, and — closing a gap Plan 2 left — the item-preview meta line and the "Source:" label under **Sheet**, both of which currently borrow `.fd-row__min` with no entry of their own.

- [ ] **Step 5: Verify and commit**

```bash
node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs
node --test tests/*.test.mjs
```

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css \
  docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/fd-tokens.test.mjs
git commit -m "feat(frontdoor): article body typography

marked() output lands in .fd-article__body, which had no rule — the spec's
16.5px/1.72/62ch lived only on .fd-article__lead, so the reading surface
would have rendered at inherited size with browser-default headings and
lists inside a Georgia card."
```

---

### Task 3: The shell skeleton — replace body and boot

The point of no return. After this task `index.html` renders the front door; the sidebar is gone.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Test: `tests/fd-shell-boot.test.mjs` (new)

**Interfaces:**
- Consumes: every module from Task 1.
- Produces: `fdRender(state)` — the single function that builds the whole page body as a string from state and assigns it to the content root. Task 4 calls it after every state change.

**What must survive the rewrite.** These are not optional and each has a consumer:

| Keep | Why |
|---|---|
| Governance notices (`renderGovernanceNotice`, `refreshGovernanceNotice`, `governanceBadge`) | Compliance surface; `tests/surface-governance-ui.test.mjs` pins it |
| Faculty-preview route (`readFacultyPreviewRequest`, `restoreFacultyPreviewRoute`, `showFacultyPreviewLockNotice`) | `faculty-console/` depends on it |
| Theme init + `cw_theme` toggle | `clinical-warm.css` and all 21 tools inherit it |
| Service-worker registration (`/*__SW_REGISTER__*/`) | Offline shell |
| `?page=`/`?tool=` routing and the `popstate` handler | `topic_meta` `cta[]`, every Week README, `communicationHref`, `familyAction`, and the nav-crawl smoke test all deep-link through it |
| `marked` rendering of markdown pages | The reader's `bodyHtml` |
| SRS/question-bank helpers (`srsState`, `dueBreakdown`, `sessLoad`) | Task 5 ports their surfaces |
| Ward-capture store (`capOpen`, `capSave`, `capTriageHtml`) | Task 5 ports its surface |

**Deleted here:** the `<aside id="side">` sidebar and rail markup, `#modetoggle`, `#modeCompanion`, `renderModeCompanion`, `renderWardDashboard`, `itemsForMode`, `scoreItemForMode`, `dashboardMode`, `setDashboardMode`, `dashCfg`, `modeReason`, `renderHome`, `renderProgress`'s markup half.

- [ ] **Step 1: Write the failing test**

Create `tests/fd-shell-boot.test.mjs` asserting on the **shipped source**, following the slice-and-execute idiom the existing shell tests use (`tests/phase-chip.test.mjs` is the model):
- `fdRender` exists exactly once and is a function of state.
- The sidebar is gone: zero occurrences of `id="side"`, `modetoggle`, `modeCompanion`, `renderModeCompanion`, `renderWardDashboard`.
- Every surviving item from the table above is still present — one assertion per row, naming the row's consumer in the message so a future deleter learns why it is there.
- `fdRender` wraps **each** surface call in its own `try`/`catch`: assert the source contains a `catch` inside `fdRender` for every one of `fdToday`, `fdPath`, `fdLibrary`, `fdReader`. Spec §6 requires per-surface isolation because an unguarded throw blanks the whole page rather than one region — the old `renderHome` had exactly that failure mode.

- [ ] **Step 2: Run it — Expected: FAIL, `fdRender` does not exist.**

- [ ] **Step 3: Replace the body markup**

Replace `<body>`'s contents with the front-door skeleton: skip link, `<header class="fd-header">` (from `fdHeader` + `fdTabs`), a content root, and the sheet/search/nudge mount points. Keep the governance notice container and the `aria-live` route-status span.

- [ ] **Step 4: Write `fdRender`**

```js
/* The whole page body from state, as one string. Each surface is independently guarded: an
   unguarded throw in the old renderHome() blanked the entire page rather than one region, and
   spec §6 makes that isolation a requirement rather than a nicety. A failed surface renders a
   minimal fallback and leaves the header and tabs usable. */
function fdSurface(name, fn){
  try{ return fn(); }
  catch(e){ return '<div class="fd-fallback">This section could not load. '
    + 'Try reloading, or use another tab.</div>'; }
}
```

Then `fdRender(state)` composing: setup wizard when no role/week is set, otherwise header + tabs + the tab's surface (or the reader when `state.openId` is set), each through `fdSurface`.

- [ ] **Step 5: Verify and commit**

```bash
node --test tests/fd-shell-boot.test.mjs
node --test tests/*.test.mjs   # 13 root tests WILL fail here — Task 8 repoints them
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```

The 13 shell-coupled suites are expected to fail from this task until Task 8. **Record the exact failing list in the commit message** so the next worker can tell an expected failure from a new one.

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-shell-boot.test.mjs
git commit -m "feat(shell): the front door replaces the sidebar

Body and boot are now fdRender(state) over the injected modules. Each
surface is independently try/caught: an unguarded throw in the old
renderHome blanked the whole page, and spec §6 makes that isolation a
requirement.

Governance notices, the faculty-preview route, theme, the service worker,
?page=/?tool= routing, marked rendering, and the SRS/capture stores all
survive — each has a consumer named in tests/fd-shell-boot.test.mjs.

EXPECTED FAILURES until Task 8 repoints them: <paste the exact list>"
```

---

### Task 4: Event delegation, routing, and state

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `common.py` (`/*__FD_WIRE__*/`), `tests/parallel-ceilings.test.mjs` (15 → 16), `spa_index.html` (marker)
- Test: `tests/fd-wire.test.mjs` (new)

**Interfaces:**
- Consumes: `fdRender`, `fdKeyAction`, `fdLoad`/`fdSave`, and the `data-fd-*` contract above.
- Produces: `fdResolveState(url, stored)` — pure; returns the state a given URL and stored blob imply. `fdDispatch(target, state)` — pure; maps a clicked element's `data-fd-*` attributes to a state patch.

- [ ] **Step 1: Write the failing test.** The two pure functions carry the logic worth pinning, so test them directly rather than through a DOM:
  - `fdResolveState`: **the URL wins when it carries `page`/`tool`/`tab`; stored state is the fallback for a bare URL** (spec §2.1). Cover a deep link overriding stored state, a bare URL restoring it, and a bare URL with nothing stored landing on Today.
  - `fdDispatch`: one case per `data-fd-*` attribute. Critically, cover the three-way distinction — `data-fd-open` alone navigates, `data-fd-open`+`data-fd-sheet` opens a sheet, `data-fd-safety` opens a protocol — and assert `data-fd-safety` **inside the sheet's own kit list** yields `sheetFrom:'kit'` while the same attribute on Today's kit card does not. That ambiguity is flagged in the contract above and is the one a handler gets wrong.
  - Keyboard: `fdKeyAction`'s result maps to the same patches.

- [ ] **Step 2: Run it — Expected: FAIL, module missing.**

- [ ] **Step 3: Write `fd_wire.js`.** One `click` listener on the content root, one `keydown` on `window`, one `popstate`. Every handler computes a patch, merges it into state, persists the whitelisted keys via `fdSave`, calls `setRoute` for routed changes, and re-renders. Register the marker and bump the pin in the same diff.

- [ ] **Step 4: Verify and commit**

```bash
node --test tests/fd-wire.test.mjs tests/parallel-ceilings.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```

```bash
git commit -m "feat(frontdoor): fd_wire.js — one delegated listener, URL-first routing

fdResolveState makes the precedence explicit: a URL carrying page/tool/tab
wins, stored state is the fallback for a bare URL, so a shared deep link
always opens what it names. fdDispatch distinguishes navigate from
open-as-sheet from open-protocol, including the data-fd-safety ambiguity
between Today's kit cards and the sheet's own kit rows."
```

---

### Task 5: Port the due row and capture triage

Spec §1 ports both "prominent". They render from `cw_srs_v1` and `cw_capture_v1` — runtime stores no pure renderer could reach, which is why Plan 2 could not build them.

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js`
- Modify: `common.py` (`/*__FD_DUE__*/`), `tests/parallel-ceilings.test.mjs` (16 → 17), `frontdoor.css`, `CLASS-INVENTORY.md`, `spa_index.html`
- Test: `tests/fd-due.test.mjs` (new)

- [ ] **Step 1: Write the failing test.** `fdDueRow(breakdown)` and `fdCaptureTriage(items)` are pure functions of already-read store data — the impure read stays in `fd_wire.js`. Cover: the due row omitted entirely at zero due; singular/plural; the triage list omitted when empty; every interpolated value escaped; and **no audience token**, since this copy ships to both sites unrebranded.

- [ ] **Step 2: Run it — Expected: FAIL.**

- [ ] **Step 3: Port the markup** from `dueStripHtml()` and `capTriageHtml()` in `spa_index.html`, restyled onto `--fd-*` tokens with new classes added to `frontdoor.css` and CLASS-INVENTORY. **Keep the PHI warning copy byte-identical** — `tests/shell-copy.test.mjs` extracts it, it is the whole PHI enforcement surface, and there is no automated PHI check anywhere in the build.

- [ ] **Step 4: Close the one a11y residual Plan 2 could not.** The `aria-hidden`/`aria-pressed` fix now covers every real toggle across `fd_today`, `fd_path`, `fd_reader`, and `fd_sheet`. One case remains open by deliberate choice: the reader's **week-navigator rail row** conveys done-state by colour alone. It was left that way because the row is a `data-fd-open` navigation control, and `aria-pressed` on a navigation control would trade one false announcement for another — silence beat a lie. Closing it properly needs either a visually-hidden state suffix in the accessible name or a new class, and `frontdoor.css` was frozen for that plan. Do it here: add the affordance, its class in `frontdoor.css` and CLASS-INVENTORY, and a test. There is a comment above `fdReaderRailRow` marking the spot, and a test forbidding `aria-pressed` there — keep that guard.

- [ ] **Step 5: Verify and commit**

```bash
node --test tests/fd-due.test.mjs tests/fd-today.test.mjs tests/fd-search.test.mjs tests/shell-copy.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```

---

### Task 6: Retirements, count pins, and the resident site

The pins are the trap: **two of the three never run locally.**

**Files:**
- Delete: `01_Six_Week_Curriculum/learning-path.html`, `tests/smoke/mode-companion.spec.js`
- Modify: `site_manifest.json`, `build_deploy.py` (nav), `resident_section.py`, `validate_tool_governance.py`, `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`, `curriculum.json`, `validate_curriculum.py`

- [ ] **Step 1: Retire `learning-path.html`.** Remove from `site_manifest.json`, from the nav in `build_deploy.py:319`, from `_copy_required` at `:177`, and delete the file. The Path tab is a strict superset; leaving both ships two six-week timelines that can disagree.

- [ ] **Step 2: Move all four count pins in the same commit.**

| Pin | Location | Change | Runs locally? |
|---|---|---|---|
| `SITE_EXTRAS` | `validate_tool_governance.py:40` | drop `learning-path.html` from **both** site tuples | yes |
| `EXPECTED_TOOL_COUNTS` | `validate_tool_governance.py:52` | `{"ms3": 22, "resident": 24}` | yes |
| `assertInventory` | `_prototypes/sp-interview/tests/ci-build-contract.test.mjs:103,114` | 23→22, 25→24 | **no — CI only** |
| `learning-path` rebrand | `resident_section.py:141` | delete the block | build-time |

Run `node --test _prototypes/sp-interview/tests` explicitly — the root glob does not reach it, and this pin has broken two prior PRs.

- [ ] **Step 3: Rewrite `RESIDENT_REBRAND`** (`resident_section.py:127`). It uses `apply_verified_replacements`, so every needle must match the shell's current copy or the build aborts. Task 3 replaced that copy wholesale, so the list is rewritten from scratch against the new shell, not patched.

- [ ] **Step 4: Per-site column scoping.** Add an optional `sites` field to `curriculum.json`'s `libraryColumns[].refs` entries (or a parallel `libraryExcludeBySite`) so a page one site ships and the other does not is excluded per-site rather than globally. Extend `validate_curriculum.py` and its tests. **Then reconcile resident nav:** nine resident-only pages currently reach users only via `resident_section.py`'s `nav.json`, and the sidebar that rendered it is gone — each must appear in a resident Library column or the resident site loses its browse path to them. Verify by counting rendered Library links in `_build/res/index.html`.

- [ ] **Step 5: Verify and commit**

```bash
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
node --test _prototypes/sp-interview/tests
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

---

### Task 7: Safety governance on the new shell

- [ ] **Step 1: Add the shell to the crisis-required set.** `build_deploy.py:296-300` gates only `_CRISIS_REQUIRED_MD` / `_CRISIS_REQUIRED_TOOLS`, and `spa_index.html` is in neither. It now renders protocol sheets, which is risk work under the scope rule in `CLAUDE.md` — the learner is assessing and planning disposition there. Add it, place the `<!-- crisis-block-html -->` marker in the sheet's mount region, and confirm `res` inherits it. `tests/crisis-block.test.mjs` covers the mechanism.

- [ ] **Step 2: Add the "not yet faculty-reviewed" affordance.** A non-attested protocol is currently signalled only by the *absence* of the teal attribution line — invisible to anyone who has never seen the attested version. Add an affirmative line, its class in `frontdoor.css` and CLASS-INVENTORY, and a test asserting it renders exactly when `attested` is false and the body is non-empty.

- [ ] **Step 3: Ask the repo owner for the failed-load copy.** When `topicMeta` is missing entirely, the sheet renders an honest but silent empty body that still reads as "nothing to do" rather than "this failed to load". `.fd-sheet__note` carries it in one line. **Do not invent copy for a safety surface** — this is open question 3 above.

- [ ] **Step 4: Verify and commit** with `node --test tests/crisis-block.test.mjs tests/fd-sheet.test.mjs` and both builds.

---

### Task 8: Repoint the 13 shell-coupled root tests

Every one of these slices code out of `spa_index.html` and executes it via `new Function`. The swap breaks them **structurally**, so they cannot be patched — each is repointed at the module source that now owns its logic, exactly as `tests/fd-*.test.mjs` already do.

`calib-panel` · `calib-wiring` · `fd-contrast` · `mastery-weakflag` · `phase-chip` · `phase-wiring` · `qbank-due-first` · `resume-card` · `shell-copy` · `spa-shell-a11y` · `srs-home-counters` · `surface-governance-ui` · `ward-capture-store`

- [ ] **Step 1: Triage each into one of three buckets** and record the verdict in the commit message: **(a)** logic moved to a module → repoint the slice at that module's source; **(b)** logic still lives in the shell → update the slice markers; **(c)** the surface is deleted → delete the test, naming what replaced it.
- [ ] **Step 2: Extend `extractShellCopy()`** in `tests/shell-copy.test.mjs` to scan `frontdoor/*.js`. Until now it read only `spa_index.html` and `sw_register.js`, so `fd_state.js`'s own comment credits it with enforcement it does not perform. Every front-door string that ships to both sites unrebranded must pass the audience-token scan.
- [ ] **Step 3: Rewrite `tests/spa-shell-a11y.test.mjs`** for the new landmark structure: one `<main>`, the tab row as a labelled `nav` with `aria-current`, the sheet with dialog semantics (`role="dialog"`, `aria-modal`, a label, and focus management), and 44px minimum hit targets on mobile primary actions. `.fd-sheet` currently has no dialog semantics at all.
- [ ] **Step 4: Verify** `node --test tests/*.test.mjs` fully green — no expected failures remain after this task.

---

### Task 9: Smoke specs and visual baselines

- [ ] **Step 1: Rewrite the five chrome-coupled specs** — `nav-crawl`, `aria-live`, `governance-warnings`, `faculty-console`, `ward-capture` — against the new Library, tabs, and sheet. `nav-crawl` is the important one: it is what proves every shipped page is still reachable now that the sidebar is gone.
- [ ] **Step 2: Delete `tests/smoke/mode-companion.spec.js`** — its surface is deleted.
- [ ] **Step 3: Add front-door smoke coverage**: first-run wizard through to Today; tab switching; reader prev/next; ⌘K search opening a preview sheet rather than navigating; the safety sheet; and **the mobile action bar staying fixed while the article scrolls** — that is the regression the sibling-nesting unit test guards structurally, and this is where it is verified for real.
- [ ] **Step 4: Regenerate the 4 visual baselines** via the "Refresh visual baselines" `workflow_dispatch`. **Never locally** — baselines must be generated on the Ubuntu/Chromium CI runner or they will not match.
- [ ] **Step 5: Full gate.**

```bash
python3 -m pip install -r requirements.txt
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/*.test.mjs
node --test _prototypes/sp-interview/tests
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npm ci && npx playwright test
```

The Playwright suite needs servers on ports 4200/4201/4202 — there is no `webServer` block, so the command in `CLAUDE.md` will `ECONNREFUSE` without them.
