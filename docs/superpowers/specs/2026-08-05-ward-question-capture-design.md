# Ward Question Capture — design

**Date:** 2026-08-05 (revised 2026-08-06)
**Status:** Design — awaiting review
**Author:** Joshua Moss, MD (with Claude Code)
**Canonical repository:** `Psychiatry-Clerkship-Library`
**Primary audience:** MS3 learners (`une-ms3-psychiatry`) **and** MMC general-psychiatry residents (`mmc-psychiatry-residents-sanford`) — shared copy, both sites, phase 1

**Line anchors FINAL against `origin/main` @ `adc73a8`** ("ci(smoke): run the offline service-worker project in CI (#322)"). All dependencies have merged: #316 quick wins, #318 snippet infrastructure, #321 (offline shell #319 + calibration ledger #320), #322 offline CI. `spa_index.html` is 1623 lines and was untouched by #322, so the anchor table below is verified against the current tip. **Nothing in this spec is conditional or pending.**

**Revision history:** draft 1 carried stale-branch anchors (off by 31); draft 2 re-anchored to `6a00a36`; draft 3 to `1d18f18`; draft 4 to the `07a0216` landing ref; this draft to merged `adc73a8`. Five re-anchorings in two days is the argument for the anchor-linting idea in *Natural next steps* — and note that `07a0216` is **not** byte-identical to today's main, because #322 landed after it.

---

## Plain-language summary

A learner on the unit hears something they don't understand. Right now the only place that
question can go is their own memory, and it is gone by the time they sit down. This adds one
button, present on every page, that opens one text box. What they type stays on their device.
At their next study session the hub matches each captured question to a page in the curriculum
and offers three routes: open the page, schedule the topic for review, or copy the list to bring
to their attending.

The design question is not "can we build a text box." It is **how a free-text field earns its
place in a repository whose top governance rule is a PHI firewall.**

---

## Problem

1. **The highest-frequency learning moment on the ward has no capture surface.** The hub is a
   study-session tool; the ward question arrives 6 hours earlier, standing up, holding a phone.
2. **No existing surface can hold it.** `spa_index.html:273` — `.mobile-chrome{display:none}`
   outside `@media(max-width:820px)`; `aside#side` becomes an off-canvas drawer with `inert` +
   `aria-hidden` at `:786`; `.tl-dock`/`.tl-bar` are torn down by `__clearDock()` on **every**
   `show()` (`:860`) and never remounted on the `special` (`:861-868`) or `tool` (`:869-878`)
   branches. `#banner` is dismissible and the dismissal persists (`.banner.hide{display:none}`
   `:88`, `cw_banner_dismissed` `:472`). There is no route-and-breakpoint-persistent element.
3. **The repo has already written the rule this feature must satisfy.**
   `plans/2026-08-04-tools-quick-wins.md:17` — *"any new free-text input must carry a 'no patient
   information' style warning."* PR #316's commit body: *"this repo's PHI firewall is its top
   governance rule."*
4. **"Persist + copy out" is already precedented; two properties are not.**
   `Reflection_PIF/reflection-and-pif-set.html` ships free text + `localStorage` + **clipboard
   egress** (`:151` `copyAll()`, button `:177`) with **no stamp** on the copy path. What is new in
   `cw_capture_v1` is **global availability on every route** and **storage on by default**
   (reflection is off-by-default at `:118`). Those two must be earned specifically.
5. **The PHI heuristic is now shared — and one copy is unguarded.** #318 landed
   `phi_heuristic.js` and injected it into the shell. Three copies of `PHI_PATTERNS` now exist:
   the snippet, `sp-interview.html:222`, and `sp-interview.preview.html:224`. `ward-capture.test.mjs`
   T3b pins only the **first two**. The preview copy can drift silently.
6. **New shell copy escapes attestation.** `site_manifest.json` has no shell entry, so
   `validate_attestation_consistency.py` never iterates `index.html`.

---

## Decisions approved with the user

- **Ship the persistent, always-available free-text box.** Decided 2026-08-05.
- **Both sites, shared copy.** Consequence: **zero audience tokens** in any capture string.
  `resident_section.py:116-125` rebrands the built `index.html` by literal replacement; a missing
  needle **aborts** the build, but new copy that *collides* with a needle mis-brands **silently**
  (`common.apply_verified_replacements` records only absent needles, `common.py:411-415`).
- **Storage is on by default**, paid for with a permanent disclosure line rather than a one-time
  consent (P3).

---

## Goals

- One capture affordance on **every route at every breakpoint**, ≤2 taps from any page.
- Capture works **fully offline**, with no dependency on the service worker or search index.
- Captured text **never leaves the device** except by one explicit user action.
- Every captured item routes to something the hub can actually serve.

## Non-goals

- No transcription, dictation, microphone, or photo capture. No sync, account, or server.
- **No new event ledger.** One new key. This feature writes no practice events.
  (`cw_calib_v1` — landing via #320 — is the calibration ledger; `cw_practice_events_v1` is
  reserved for sim process events per `calib_log.js:5` and exists in neither the shell nor main.)
- No free-text card in Daily Review. Captures route to real `TOPIC#` cards or nowhere.
- **No change to the study export schema.** The payload is an explicit allow-list of named
  `safeLS()` calls (`spa_index.html:1422-1426`); a new key is excluded by construction.
- **No migration of `sp-interview.html`.** #318 correctly left it inline — see §D.
- **No new pattern added to `PHI_PATTERNS`.** See P2.

---

## Approaches considered

**A. Fixed-position FAB.** Rejected. `visual-regression.spec.js:114-117` clicks `#drawerBackdrop`
at `{x: asideBox.x + asideBox.width + 10, y: 10}` — a fixed top-right element intercepts it.
Bottom-right collides with `.tl-dock` (`:305`, z-30) and `.tl-bar` (`:329`, z-29) — and
with the SW update toast (`.sw-toast`, fixed bottom-center, z-31).

**B. Reuse `.tl-bar`.** Rejected. `visual-regression.spec.js:145` requires `.tl-bar`
`toHaveCount(0)` on Learning Path; `:100`/`:152`/`:155` pin `.tl-bar__item[data-tool]` to 3 @320px
and 4 @390px.

**C. Two mount points: the existing empty mobile spacer + a new sidebar row — selected.**
`spa_index.html:461` is `<span class="mobile-chrome-spacer" aria-hidden="true"></span>`, sized
`min-width:44px;min-height:44px` (`:288`), in grid column 3 of
`minmax(44px,auto) minmax(0,1fr) minmax(44px,auto)` (`:280`). It exists purely to balance
`#menuBtn`. The button's max-content (~24px) is under the 44px floor, so the resolved track is
44px either way — `visual-regression.spec.js:184-190` (no 320px horizontal overflow) is unaffected.

**Baselines:** the 4 baselines are *element* screenshots of `aside#side`
(`visual-regression.spec.js:70`) and `#content` (`:86`, height-clamped `:81-85`). `.mobile-chrome`
(`spa_index.html:458`) is a sibling of `#content` and captured by neither — the mobile mount needs
no refresh because it is **outside the capture region**. The desktop mount **is** inside
`aside#side` and **will** change `sidebar-desktop.png` and `sidebar-mobile.png`.

---

## Design

### Verified anchors (`07a0216`, `spa_index.html` unless noted)

Every load-bearing citation in this document, in one table, so a future re-anchoring edits one
block instead of forty inline cites.

| Anchor | Line | Note |
|---|---|---|
| `.mobile-chrome{display:none}` | 273 | unchanged from main |
| `@media(max-width:820px)` open / close | 276 / 293 | unchanged |
| `.mobile-chrome{position:sticky` | 280 | `spa-shell-a11y.test.mjs:47` anchors this literal |
| `#routeStatus{display:none}` | 284 | inside the 280→296 asserted slice |
| `.menubtn{display:inline-flex…font:inherit` | 285 | the `font:inherit` precedent |
| `.mobile-chrome-spacer{display:block` | 288 | delete after the swap |
| `.sw-toast` | 332 | **new**, z-31, fixed bottom-center |
| `<h1>Inpatient Psychiatry</h1>` / `.by` | 456 / 457 | `RESIDENT_REBRAND` needles |
| `#modetoggle` (`#mPath`/`#mLib` inline) | 459 | inner buttons pinned char-for-char |
| `.search-wrap` open / close | 460 / 464 | **desktop mount inserts after 464** |
| `#modeCompanion` / `#nav` | 465 / 466 | |
| `.mobile-chrome` open / `#menuBtn` / `#mobileTitle` | 469 / 470 / 471 | |
| `.mobile-chrome-spacer` span | **472** | **mobile mount replaces this** |
| `.banner` / `#routeStatus` / `#content` | 474 / 475 / 476 | |
| `function topicHasQuiz(` / `function seedSRS(` | 575 / 576 | guard is `seedSRS`'s first statement |
| `function show(` | 868 | |
| `__clearDock()` in `show()` | 877 | also 800 in `showPath()` |
| `special` branch open / close | 878 / 885 | `__afterSpecial` at 883-ish |
| `tool` branch open / close | 886 / 895 | |
| `openByFile('__home__',{replace:true})` | 961 | |
| nav-fetch `.catch` | 990 | **new** — do not confuse with the search `.catch` |
| `/*__PHI_HEURISTIC__*/` | 993 | `looksLikePhi` hoisted from here |
| `var SI=null, VOCAB=[]` | 996 | |
| `function tok(` / `function idf(` / `function runSearch(` | 998 / 1005 / 1006 | |
| **`fetch('search-index.json')`** | **1002** | single line; `.catch` on 1003 |
| `window.__clearDock=` def | 1134 | |
| `window.__afterContent=` def | 1187 | `cw_last` write on the same line |
| `renderCalibPanel` def | 1465–1490 | **new**; returns `''` under 20 events |
| `window.renderHome=function(){` | 1493 | closes 1548 |
| `hmRoot` opens / closes | 1501 / 1547 | |
| `hm-grid` open / close | 1506 / 1511 | |
| "Continue where you left off" | 1512 | **triage card inserts here** |
| weak topics | 1513–1514 | |
| calib panel + fallback | 1531–1544 | |
| `window.exportStudy=` | 1438 | payload literal 1439–1444 |
| `window.__afterSpecial` / `__home__` handler | 1599–1619 / 1604–1608 | click delegation |
| z-index stack | — | `.skip-link` 100 · `.tl-sheet` 40 · `.tl-sheet-backdrop` 39 · **`.sw-toast` 31** · `.tl-dock` 30 · `.tl-bar` 29 · `aside` 20 · `.mobile-chrome` 18 |

### A. Mount points

Two buttons, **distinct ids** (a shared id is invalid HTML and makes `aria-expanded` and
focus-return ambiguous — A11y R2). Both carry `.capture-open` and call one handler.

**Mobile (≤820px)** — replace the spacer span at `:472` in place:

```html
<button class="mobile-chrome-capture capture-open" id="captureBtnMobile" type="button"
        aria-label="Capture a question" aria-haspopup="dialog" aria-expanded="false">+</button>
```

`aria-hidden="true"` is removed (invalid on a focusable element). No test references the spacer;
`tests/smoke/aria-live.spec.js:15-16` asserts one `[aria-live]` but is scoped to
`/tools/question-bank-practice.html`.

CSS is a **new rule inside** the existing `@media(max-width:820px)` block (`:276-293`), after
`:288`. It must declare `font:inherit` — buttons do not inherit font, and UA defaults would render
the `+` in Arial 13.33px on a `ButtonFace` grey block, visibly wrong in `[data-theme="dark"]`:

```css
.mobile-chrome-capture{display:inline-flex;align-items:center;justify-content:center;
  min-width:44px;min-height:44px;border:none;border-radius:9px;padding:8px 12px;
  background:var(--primary-light);color:var(--primary-dark);font:inherit;font-weight:700;
  line-height:1;cursor:pointer}
```

This mirrors `.menubtn` (`:285`), which declares `font:inherit` for the same reason.

`:280` must not be touched — `spa-shell-a11y.test.mjs:47` anchors on the literal
`.mobile-chrome{position:sticky`, requiring `position:sticky` first. Delete the now-unused
`.mobile-chrome-spacer` rule at `:288`; that is safe because the `:280`→`:296` slice inspected by
`spa-shell-a11y.test.mjs:49-52` asserts only `/#routeStatus\{display:none\}/`, at `:284`.

**Desktop (≥821px)** — new sibling between `:464` (`.search-wrap` close) and `:465`
(`#modeCompanion`), inside `aside#side`, `id="captureBtnDesk"`. Clear of the `RESIDENT_REBRAND`
needles at `:456` (`<h1>Inpatient Psychiatry</h1>`), `:457` (`<div class="by">…</div>`), `:474`
(banner sentence), and `:9` (meta description); and clear of `#mPath`/`#mLib` on `:459`, pinned
character-for-character by `spa-shell-a11y.test.mjs:34-35`. (The `.modetoggle` **wrapper** is not
pinned; its inner buttons are.) `resident_section.py`'s needle list and its
`apply_verified_replacements` call are untouched by #321.

### B. Capture sheet

One dialog, both mounts:

1. **Prompt** (P1). 2. **`<textarea maxlength="280">`** — the strongest structural PHI control;
280 chars holds a question, not a narrative. 3. **Disclosure line**, always visible.
4. **Save / Cancel**, save runs the P2 interstitial. 5. **Unrouted captures** with per-item delete
plus **Erase all captures**.

`role="dialog"` `aria-modal="true"` with its **own** focus trap — do not reuse `.tl-sheet`
(`visual-regression.spec.js:130-133` Shift+Tab-cycles it). **z-index 50**: above `.tl-sheet` (40)
and `.tl-sheet-backdrop` (39), below `.skip-link` (100, the stylesheet maximum).

### C. Triage card

**Placement:** inside `renderHome()`, at **`:1512`** — immediately after the `hm-grid` closes
(`:1511`) and before "Continue where you left off". That is the "what do I do right now" zone;
untriaged captures are the most time-sensitive item on the page. It sits well above the calib
panel (`:1531-1544`), so the two new home cards do not compete.

**Click handling must use the existing delegation**, not inline handlers: `window.__afterSpecial`'s
`__home__` branch (`:1604-1608`) dispatches `.hm-li` clicks on `data-act` / `data-practice` /
`data-pt` / `data-f`. The full-rerender idiom is already established at `:1606` —
`root.outerHTML=window.renderHome(); window.__afterSpecial('__home__');` — with a second path at
`:1363`. Reuse it; do not hand-roll a third.

Calls the existing `runSearch()` (`:1006`). **`runSearch` is not extracted.** It closes over
module-scope `SI`/`VOCAB` (`:996`) and calls `tok()` (`:998`) and `idf()` (`:1005`) in the shell's
un-IIFE'd top-level script. The triage card lives in the shell, where those bindings are in scope.

**Required edit — the cold-load race.** `SI === null` means *"failed"* **or** *"not yet
resolved."* `:961` `openByFile('__home__',{replace:true})` → `renderHome()` runs in the same
handler that races a 473–483 KB fetch, and the success callback re-renders nothing. Without a hook
the card paints "matching unavailable" on nearly every cold load and never corrects. Add the hook
the `topic_meta.json` fetch already uses:

```js
if(document.getElementById('hmRoot')&&window.renderHome)renderHome();
```

**Exact target: `:1002`, a single-line statement.** The insertion point is the second `.then`
callback body, whose literal text is `{ SI=d; VOCAB=Object.keys(d.postings).sort(); }`. Append the
hook inside those braces — do **not** add a new `.then`, and do **not** target the `.catch` by
pattern: `:1003` is the search `.catch`, but **`:990` is a nav-fetch `.catch` added by #321** just
twelve lines above. `search-index.json` appears exactly once in the file and is the unambiguous
anchor.

Three routes:

- **Open the matched page** — `show()` on the top hit.
- **Review this topic** — call `seedSRS(f)`. The `topicHasQuiz()` guard is **already the first
  statement inside `seedSRS`** (`:576`) — that placement *was* PR #291's fix, so the caller adds
  no guard. The caller's obligation is the inverse: **check `topicHasQuiz(f)` (`:575`) for
  *display* and hide the button when false**, so no control is shown that silently no-ops. This
  matters: `runSearch` returns hits from `SI.docs` including tool pages and non-topic content, so
  many top hits are not quiz-bearing.
- **Ask my attending** — clipboard, stamped (P4).

### D. PHI heuristic — CONSUME, do not create

**This section changed: #318 landed the infrastructure this spec originally proposed.**

`common.py:509-512` now reads:

```python
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
    "/*__PHI_HEURISTIC__*/": "phi_heuristic.js",
}
```

`phi_heuristic.js` (12 lines) is deliberately multi-line so its dup-probe signature —
`function looksLikePhi(t){`, **25 chars** — stays short and stable. The marker sits at
`spa_index.html:976`:

```
975:  /* Shared PHI heuristic (looksLikePhi) — consumed by the ward question-capture feature. */
976:  /*__PHI_HEURISTIC__*/
```

`function looksLikePhi` is a hoisted declaration at top level of the same script block that holds
`show()`, `renderHome`, and `runSearch` — **callable from anywhere in the shell, including code
textually above line 976.** The capture handler calls it directly. **No build-pipeline change is
required by this feature.**

`sp-interview.html` was correctly **not** migrated: its suite reads the **source** HTML and
`eval()`s it (`tests/smoke.test.js:4-17`), then reads `window.__SP_TEST__` (`:1130`) which
references `looksLikePhi` by identifier; `inject_shared_snippets` only expands into
`out_dir/tools/*.html` + `out_dir/index.html` (`common.py:539-545`), never source. A marker there
throws `ReferenceError` and takes down six CI files.

**Two landmines for any PR touching this area:** `tests/parallel-ceilings.test.mjs:15` pins
`EXPECTED_MARKER_COUNT = 2` and `:27-35` `assert.deepEqual`s `qa-baseline.json`. Both must be
bumped **in the same diff** as any change to `SNIPPET_MARKERS` or the baseline. This feature
changes neither.

---

## Data and storage

**Key:** `cw_capture_v1`. Namespace-compliant (`check-static-site.mjs:301` tools / `:337` shell).
Written as a **string literal at every call site** — the house convention from PR #316 Task 9.

*Correction to the previous draft:* the `computed-key` soft finding is emitted **once per file**,
not per call site (`check-static-site.mjs:311-312`, `:338-339`, classified at `:72`). `index.html`
is **already** one of the counted files — it carries `LS()` at `:1173` and `safeLS()` at `:1419` —
so a shell-only feature has **unbounded** headroom against the `qa-baseline.json` ceilings
(`ms3: 6`, `res: 9`). The ceiling binds only a newly shipped `tools/*.html`, which this feature
does not add. Literal keys remain the convention, not a build constraint.

```json
{ "v": 1, "items": [ { "id": "c_lp3k9q",
  "text": "why clozapine and not another antipsychotic here",
  "at": 1754400000000, "ctx": "t_psychosis.md", "triaged": false } ] }
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | local, random, non-sequential |
| `text` | string | **≤280 chars, capped at write, re-clamped at read** |
| `at` | number | epoch ms |
| `ctx` | string \| null | route slug at capture time — a `nav.json` filename, not learner input |
| `triaged` | bool | set when any route is taken; triaged evict first |

**`ctx` rule for special routes.** `window.__afterContent` (`:1170`) writes `cw_last` but does not
fire on the `special` branch (`:861-868` calls `__afterSpecial` at `:866`). On `__home__` — where
the triage card lives — `currentItem.f` is `'__home__'` and `cw_last` holds the *previous* page.
**Rule: `ctx` is null when `currentItem.k === 'special'`.** Never fall back to `cw_last`.

**Cap:** 50 items, FIFO, triaged-before-untriaged.

**Not exported.** `exportStudy()` (`:1421-1432`) builds an explicit payload of 6 named `safeLS()`
calls plus 2 derived summaries and 3 metadata fields — 11 keys total, no iteration. A new key is
excluded by construction. T5 pins it. The schema **is** `clerkship-study-v2` (`:1439`) and the
payload carries a 7th `calib` key — the exclusion guarantee is unaffected.

**Not a ledger.** One key, one writer, one reader, bounded. No overlap with `cw_qb_v1`,
`cw_srs_v1`, or `cw_calib_v1`. The `deck#`/`cw_srs_v1` failure class (PR #291) came
from one flat namespace with four writers where the id prefix was the only partition.

---

## Privacy and clinical boundaries

**P1 — Point-of-entry warning.** Pattern from `_prototypes/brief-psych/rp-brief-psych.html:320`.
Audience-neutral:

> **The question, not the patient.** No names, initials, room or bed numbers, dates, or MRNs —
> write what you want to understand, not who you saw. Stays on this device.

Textarea `aria-label`: `"Your question, no patient identifiers"`.

**P2 — Interstitial on save.** `looksLikePhi()` runs before every write. On a hit, save is held
and a `role="alertdialog"` offers **Edit** / **No patient details — save**, mirroring
`sp-interview.html:950-954` but re-worded (sp-interview's override asserts "It's fictional"; a ward
capture is not fictional, so the override asserts absence of identifiers).

**The room/bed pattern is capture-local, not shared.** The shared `PHI_PATTERNS` in
`phi_heuristic.js:8` is byte-identical to `sp-interview.html:222` and
`sp-interview.preview.html:224`; `ward-capture.test.mjs` T3b pins the first two, and adding a
seventh pattern would require editing all three in one diff while the unpinned preview copy could
still drift. So the capture handler applies its own additional test alongside the shared one:

```js
var WARD_LOC = /\b(?:bed|room|rm)\s*#?\s*\d+/i;
if (looksLikePhi(text) || WARD_LOC.test(text)) { /* hold — P2 interstitial */ }
```

This is not merely a workaround — it is the more correct scoping. "Room 302" is a PHI signal in a
ward capture and a legitimate utterance in a simulated interview; the two surfaces should not share
that rule. The shared file stays untouched, T3b stays green, and no third-copy risk is created.

**Stated limitation:** the heuristic is a speed bump, not a filter. It detects no names, and
deliberately does not flag bare small numbers, because a psychiatry question is full of legitimate
ones ("QTc over 500", "lithium 1.2"). **The structural controls — the 280-char cap, no transmit,
the stamped clipboard — contain the risk.** There is no automated PHI check in build or CI.

**P3 — Always-visible disclosure**, permanent because storage is on by default:

> Saved on this device only, never sent anywhere. Erase all captures below.

**P4 — Stamped clipboard.** The one sanctioned egress, following
`decisional-capacity-module.html:139` (a fixed line inside the payload builder so every copy path
carries it):

> Questions from the unit, brought to supervision. Written by a trainee for teaching discussion —
> contains no patient information.

**P5 — Erase.** Per-item delete plus **Erase all captures** behind `confirm()`.

**Attestation.** P1–P4 are new learner-facing copy outside the attestation surface. Mitigation:
add an `index.html` entry to `13_Faculty_Resources/reviewed.json`. Extra ledger entries beyond the
manifest are already tolerated — 29 exist — so this is additive and cannot break
`validate_attestation_consistency.py`.

---

## Failure and recovery behavior

| Condition | Behavior |
|---|---|
| `localStorage` throws (Safari private, quota) | Sheet opens; save shows "Couldn't save on this device" and offers the clipboard path. Never a silent drop. |
| `search-index.json` in flight | Loading state, then re-render via the `:985` hook. Not conflated with failure. |
| `search-index.json` failed | Captures + delete + clipboard; states matching unavailable. |
| `topic_meta.json` failed | **"Review this topic" hidden.** `topicHasQuiz()` against empty `TOPIC_META` returns `false` — a safe no-op. (Not the `srsDropPhantomTopics()` rule; that guards emptiness because it **deletes** cards and would wipe every legitimate `TOPIC#` card, `:570`.) Hiding is UX, not safety. |
| Store corrupt | Reset to `{v:1,items:[]}`; do not throw past the reader. |
| `text` >280 on read | Clamp on read as well as write. |

---

## Accessibility

- Both mounts `<button>`, ≥44×44, `aria-haspopup="dialog"`, `aria-expanded` maintained.
- Sheet `role="dialog"` `aria-modal="true"`, labelled by its heading; focus to the textarea on open.
- **R2 — two-invoker rule.** Record the invoking element on open; return focus to it on close only
  if still `isConnected` **and** visible, else to `#content`. Set `aria-expanded` on the recorded
  invoker only; reset both on close. This is the bug class `spa-shell-a11y.test.mjs:61-77` pins for
  `.tl-sheet`, worsened here by a viewport that can cross 820px mid-dialog. Pinned by T11b.
- Own focus trap; **z-index >40**. the SW update toast (`.sw-toast`, z-31,
  `role="status"`) appends **two focusable buttons at the end of `document.body`** — outside the
  dialog and after `#content` in tab order. The trap must not assume it is the last focusable
  region in the document.
- Interstitial `role="alertdialog"`.
- `#mobileTitle` gains no children — `visual-regression.spec.js:141-142` asserts
  `toHaveText('Learning Path')` exactly.
- **No new `aria-live` region.** Announcements route through `announceRoute()`, call count pinned
  ≥5 (`spa-shell-a11y.test.mjs:26-27`).

---

## Testing and verification

**Harness constraint:** `build_and_check.sh:47` runs `node --test "$LIB"/tests/*.test.mjs`
**before** `build_deploy.py` at `:54`. Root tests read **source** and must never touch built
output or browser APIs.

**Node — extend the existing `tests/ward-capture.test.mjs`** (40 lines, created by #318, holds T3
and T3b). Add:
- T4. Cap: 51 writes → 50 items, triaged evicted first; 400-char input → 280 stored.
- T5. **Static** assertion over the `exportStudy` payload literal (`spa_index.html:1422-1426`):
  does not contain `cw_capture_v1`. Not an execution test — `exportStudy` needs `Blob`,
  `URL.createObjectURL`, `document.body`. Expected schema string: `clerkship-study-v2`.
- T11. The P1 prompt contains the literal `"No names"`.
- T11b. Focus-return guarded on the recorded invoker being `isConnected` (source regex, mirroring
  `spa-shell-a11y.test.mjs:67-71`).

**T7 / T8 — extend `tests/shell-copy.test.mjs` (112 lines, on main), do not duplicate.** It
implements both guards generically: `AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`
(`:21`, asserted `:69`) and a `RESIDENT_REBRAND` needle-collision check (`:54-67`, asserted `:80`).

**But its extraction scope is narrow and will not pick up capture copy for free.** `extractShellCopy()`
matches exactly one shell pattern — `/<p class="sub st-a2hs">([^<]*)<\/p>/` at `:30`, **non-global,
first match only** — plus single-quoted `.innerHTML=` / `.textContent=` / `setAttribute('aria-label',…)`
literals from `sw_register.js`. Two consequences: (a) the P1–P4 strings must be added to the
extractor explicitly, and (b) **never add a second `<p class="sub st-a2hs">`** — the non-global
regex would silently shadow it and the guard would pass while the copy went unchecked.

If #321 has not merged when this is built, author T7/T8 in `ward-capture.test.mjs` and migrate.

**No T6.** "String literal at each call site" is already enforced on the built artifact by
`check-static-site.mjs:337` (namespace) and `:338-339` (computed-key). A source regex would be
weaker, in a weaker harness.

**Python — `test_common.py`:** no additions. #318 landed the snippet tests, including
`test_all_snippet_signatures_are_short_and_unique` (`:402-412`), which is stronger than the
originally-proposed T2b.

**Playwright — `tests/smoke/ward-capture.spec.js`**, registered in the **`nav-ms3`** project's
`testMatch` array (`playwright.config.js:41`) — the only project carrying shell-behaviour specs at
MS3 baseURL, and invoked in CI at `ci.yml:186`. Projects use explicit arrays, not directory globs;
an unregistered spec is **silently skipped**.
- T9. `#captureBtnMobile` visible and clickable at 320 and 390 px; `#captureBtnDesk` at 1280 px —
  each on `__home__`, a md page, a tool route, and Learning Path (the four route classes; tool and
  special are where `.tl-dock` dies).
- T10. Existing `mobile shell ergonomics` suite green — `:100`/`:152`/`:155`, `:114-117`, `:145`,
  `:184-190`.
- T12. A capture whose top hit is non-quiz-bearing renders **no** "Review this topic" button and
  creates no `cw_srs_v1` entry.
- **`page.route` is safe in `nav-ms3`** — verified two ways: main sets
  `serviceWorkers: 'block'` at top-level `use` (`playwright.config.js:41`) and `nav-ms3`'s own
  `use` (`:48`) does not override it; and `communication-practice.spec.js`, already in that
  project's `testMatch`, uses `.route(` at 6 call sites today. Precedent, not theory. The standing
  prohibition is narrower than the earlier draft implied: do not combine `page.route` with a
  `serviceWorkers: 'allow'` opt-in.

**Visual baselines:** required — the desktop mount is inside `aside#side`, changing
`sidebar-desktop.png` and `sidebar-mobile.png`. Run "Refresh visual baselines"
`workflow_dispatch` after merge — Ubuntu/Chromium, never locally.

---

## Expected tracked-file boundary

```
13_Faculty_Resources/_automation/site_build/spa_index.html
13_Faculty_Resources/reviewed.json                            (add index.html entry)
tests/ward-capture.test.mjs                                   (extend; created by #318)
tests/smoke/ward-capture.spec.js                              (new)
tests/smoke/playwright.config.js                              (register in nav-ms3 testMatch)
tests/shell-copy.test.mjs                                     (extend extractShellCopy)
docs/superpowers/specs/2026-08-05-ward-question-capture-design.md
```

Explicitly **not** touched: `common.py`, `phi_heuristic.js`, `test_common.py`,
`tests/parallel-ceilings.test.mjs`, `qa-baseline.json` (#318 landed all of it — this feature is a
pure consumer), `check-static-site.mjs`, `_prototypes/sp-interview/**`, `resident_section.py`,
`site_manifest.json`, `build_deploy.py`, any tool HTML.

`_headers`/CSP is a verified no-op: `build_deploy.py:354` emits `default-src 'self'; …`;
`navigator.clipboard.writeText` is not CSP-governed and the feature adds no network origin.

---

## Sequencing

Build in a worktree off `origin/main` (`git worktree add .worktrees/<name> origin/main -b <branch>`);
the checkout is on `fix/table-scroll-desktop-affordance-v2` and is behind. **Re-derive every anchor
in the worktree before editing** — this document has been re-anchored twice.

~~1. Snippet infrastructure~~ — **landed as #318.** This feature now consumes it.

1. **Capture + sheet + storage** — mounts, PHI stack, T4/T5/T9/T10/T11/T11b (+T7/T8 if #321 has
   not merged).
2. **Triage card** — the `:985` re-render hook, `runSearch` routing, display-side `topicHasQuiz`,
   T12.

The agreed merge order is satisfied: the offline shell, calibration ledger, and offline CI have all
landed, so these two steps rebase onto a settled shell rather than forcing anything to rebase onto
them. PR-B (phase policy) and the qbank capsule are parked behind this feature.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A learner types a patient identifier anyway | High | P1–P5. **Accepted residual: no name detection, and no room/bed detection until the deferred pattern PR.** |
| Clipboard payload reaches the wrong channel | Medium | P4 stamp on every copy path; one click, user-initiated. |
| MMC residents receive MS3-authored copy | Medium | T7/T8 (or `shell-copy.test.mjs`). Residual: no separate MMC review record — flagged, not solved. |
| `sp-interview.preview.html` PHI copy drifts | Medium | Pre-existing gap from #318; T3b pins 2 of 3 copies. Not this feature's to fix — the capture-local `WARD_LOC` pattern avoids touching the shared file entirely. Flagged for a standalone PR. |
| ~~`offline.spec.js` never runs in CI~~ | **Resolved** | Closed by #322 — `ci.yml:234-237` adds "Check 4: offline shell — service worker" → `npx playwright test --project=offline`. Noted here because editing `ci.yml` in this repo must satisfy **four** contract layers (SP-suite ordered-command pin ×2 sites, `validate_scheduled_workflows.py` step inventory, whole-workflow SHA-256 digest, execution-boundary rules). This feature touches no workflow file. |
| Capture sheet collides with the SW update toast | Medium | sheet at z-50 (toast is 31, `spa_index.html:332`); toast appends two focusable buttons as the **last children of `document.body`** (`sw_register.js:34`) with **no focus management** — `role="status"` only. The trap must not assume it owns the end of the tab order. Toast is suppressed on `?tool=` routes (`sw_register.js:24`) and on faculty preview (`:18`), so it cannot appear over a tool iframe. |
| New spec silently skipped by Playwright | Medium | Register in `nav-ms3:41`; observe T9/T10 failing before they pass. |
| Sidebar row changes visual baselines | Low | Expected; `workflow_dispatch` post-merge. |
| Captures accumulate untriaged | Low | 50-item FIFO cap; count surfaced on home. |

*Removed from this table:* "a computed-key call site breaks the deploy." Verified false for a
shell-only feature — see *Data and storage*.

---

## Natural next steps

- **Stamp `reflection-and-pif-set.html:151` `copyAll()`.** A shipped free-text tool with clipboard
  egress and no supervised-draft stamp — one line.
- **The deferred PHI-pattern PR:** add `/\b(?:bed|room|rm)\s*#?\s*\d+/i` to all three copies and
  extend T3b to `sp-interview.preview.html`, closing both the detection gap and the drift hole.
- **Vocabulary-assisted capture.** `search-index.json` ships 7,643 postings tokens and 175
  synonyms. A type-ahead lets a learner pick curriculum terms instead of typing prose —
  structurally PHI-free, guaranteed `runSearch` hit, clipboard payload that is a topic list rather
  than a transcript. Ship beside the free-text field once there is data on what learners type.
- **Convert the sp-interview suite off `eval(source)`**, then consolidate its `PHI_PATTERNS` and
  the preview copy onto the marker — retiring T3b.
- **A real PHI check in CI.** `phi_heuristic.js` is the natural seed for a repo-scanning variant.
