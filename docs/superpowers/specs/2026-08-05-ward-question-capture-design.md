# Ward Question Capture — design

**Date:** 2026-08-05
**Status:** Design — awaiting review
**Author:** Joshua Moss, MD (with Claude Code)
**Canonical repository:** `Psychiatry-Clerkship-Library`
**Primary audience:** MS3 learners (`une-ms3-psychiatry`) **and** MMC general-psychiatry residents (`mmc-psychiatry-residents-sanford`) — shared copy, both sites, phase 1
**Line anchors verified against:** `origin/main` @ `6a00a36` (2026-08-05), re-verified after an adversarial pass that found five §C anchors carrying stale-branch numbers (off by 31). Anchors below are `origin/main`.

---

## Plain-language summary

A learner on the unit hears something they don't understand. Right now the only place that
question can go is their own memory, and it is gone by the time they sit down. This adds one
button, present on every page, that opens one text box. What they type stays on their device.
At their next study session the hub matches each captured question to a page in the curriculum
and offers three routes: open the page, schedule the topic for review, or copy the list to bring
to their attending.

The whole design question is not "can we build a text box." It is **how a free-text field earns
its place in a repository whose top governance rule is a PHI firewall.** That is what most of
this document is about.

---

## Problem

1. **The highest-frequency learning moment on the ward has no capture surface.** The hub is a
   study-session tool; the ward question arrives 6 hours earlier, standing up, holding a phone.
2. **No existing surface can hold it.** `spa_index.html:273` — `.mobile-chrome{display:none}`
   outside `@media(max-width:820px)`; `aside#side` becomes an off-canvas drawer with `inert` +
   `aria-hidden` at `:786`; `.tl-dock`/`.tl-bar` are torn down by `__clearDock()` on **every**
   `show()` (`:860`) and never remounted on the `special` (`:861-868`) or `tool` (`:869-878`)
   branches. There is no route-and-breakpoint-persistent element in the shell today.
3. **The repo has already written the rule this feature must satisfy.**
   `docs/superpowers/plans/2026-08-04-tools-quick-wins.md:17` — *"any new free-text input must
   carry a 'no patient information' style warning."* PR #316's own commit body: *"this repo's PHI
   firewall is its top governance rule."*
4. **What is actually novel here is narrower than it first appears — and one existing tool is a
   closer precedent than expected.** `02_Clinical_Skills/Reflection_PIF/reflection-and-pif-set.html`
   already ships free text + `localStorage` persistence + **clipboard egress** (`:151` `copyAll()`
   → `navigator.clipboard.writeText(assemble())`, button at `:177`) — and its copy path carries
   **no stamp**. So "persist + copy out" is precedented. What is genuinely new in `cw_capture_v1`
   is **global availability on every route** and **storage on by default** (reflection is
   off-by-default at `:118`). The design must earn those two properties specifically, and should
   fix reflection's unstamped copy path as a follow-on rather than pretend it doesn't exist.
5. **The only PHI heuristic in the repository is trapped inside one tool.**
   `_prototypes/sp-interview/sp-interview.html:221-223` — `PHI_PATTERNS` + `looksLikePhi()`,
   CI-covered by 4 fixtures at `_prototypes/sp-interview/tests/smoke.test.js:112`, reachable by
   nothing else. A third copy exists in `sp-interview.preview.html`.
6. **New shell copy escapes attestation entirely.** `site_manifest.json` has no shell entry, so
   `validate_attestation_consistency.py` (888 lines) never iterates `index.html`. A new
   learner-facing prompt would ship with no faculty-review record while the clinical content two
   clicks away is hard-gated.

---

## Decisions approved with the user

- **Ship the persistent, always-available free-text box.** Decided 2026-08-05.
- **Both sites, shared copy.** One string set ships verbatim to UNE MS3s and MMC residents.
  Consequence: **zero audience tokens** in any capture string — no "MS3", "clerkship", "student",
  "shelf", "resident", or institution name. Enforced by test T7. Rationale:
  `resident_section.py:116-127` rebrands the **built** `index.html` by literal string replacement
  through `common.apply_verified_replacements`. Note the real failure mode: that function records
  only needles that are **absent** (`common.py:411-415`), so a missing needle aborts the build,
  but new copy that *collides* with a needle mis-brands **silently**. Silent mis-branding is the
  risk; the abort is the safety net that does not cover it.
- **Storage is on by default.** "Persistent" was explicit. This departs from reflection's
  off-by-default opt-in, paid for with an always-visible disclosure line rather than a one-time
  dismissible consent (P3).

---

## Goals

- One capture affordance reachable on **every route at every breakpoint**, ≤2 taps from any page.
- Capture works **fully offline**, with no dependency on the service worker or the search index.
- Captured text **never leaves the device** except by an explicit, single, user-initiated action.
- Every captured item can be routed to something the hub can actually serve.
- The PHI heuristic becomes a **shared, single-sourced, build-injected** asset.

## Non-goals

- No transcription, dictation, microphone, or photo capture.
- No sync, account, server, or cross-device anything.
- No new event ledger. One new key; reads the existing search index.
  (`cw_practice_events_v1`, designed at `plans/2026-08-01-audit-remediation-ws3-learning-loop.md:868`,
  remains the single home for practice events. Capture is not a practice event.)
- No free-text card in Daily Review. Captures route to real `TOPIC#` cards or nowhere.
- No change to `clerkship-study-v1`. The export is an explicit allow-list
  (`spa_index.html:1419-1423`); the new key is excluded by construction.
- **No migration of `sp-interview.html` to the shared marker in this spec.** See §D.

---

## Approaches considered

**A. Fixed-position floating action button.** Rejected on evidence.
`tests/smoke/visual-regression.spec.js:114-117` clicks `#drawerBackdrop` at
`{x: asideBox.x + asideBox.width + 10, y: 10}` — a fixed top-right element intercepts it. A
bottom-right FAB collides with `.tl-dock` (`:305`) on desktop and `.tl-bar` (`:329`) on mobile.

**B. Reuse `.tl-bar` as a persistent mobile home.** Rejected. `visual-regression.spec.js:145`
asserts `.tl-bar` `toHaveCount(0)` on Learning Path — the bar is *required* absent. `:100`,
`:152`, `:155` pin `.tl-bar__item[data-tool]` to exactly 3 @320px and 4 @390px.

**C. Two mount points: the existing empty mobile spacer + a new sidebar row — selected.**
`spa_index.html:461` is `<span class="mobile-chrome-spacer" aria-hidden="true"></span>`, sized
`min-width:44px;min-height:44px` (`:288`), occupying grid column 3 of
`minmax(44px,auto) minmax(0,1fr) minmax(44px,auto)` (`:280`). It exists purely to balance
`#menuBtn`. Because the button's max-content (~24px) is below the 44px floor, the resolved track
width is 44px either way — so `visual-regression.spec.js:184-190`
(`documentElement.scrollWidth <= clientWidth` at 320px) is unaffected.

**Note on baselines:** the 4 visual baselines are *element* screenshots of `aside#side`
(`visual-regression.spec.js:70`) and `#content` (`:86`, height-clamped at `:81-85`).
`.mobile-chrome` (`spa_index.html:458`) is a **sibling** of `#content` and is captured by neither.
The mobile mount therefore needs no baseline refresh because it is **outside the capture region**
— not because it is zero-delta. The desktop mount **is** inside `aside#side` and **will** change
`sidebar-desktop.png` and `sidebar-mobile.png`.

---

## Design

### A. Mount points

Two buttons, **distinct ids** (a shared id would be invalid HTML and would make `aria-expanded`
and focus-return ambiguous — see A11y R2). Both carry class `.capture-open` and call one handler.

**Mobile (≤820px)** — replace `spa_index.html:461` in place:

```html
<button class="mobile-chrome-capture capture-open" id="captureBtnMobile" type="button"
        aria-label="Capture a question" aria-haspopup="dialog" aria-expanded="false">+</button>
```

`aria-hidden="true"` is removed (invalid on a focusable element). No test references the spacer or
its `aria-hidden`; `tests/smoke/aria-live.spec.js:15-16` asserts exactly one `[aria-live]` but is
scoped to `/tools/question-bank-practice.html`, not the shell.

CSS is a **new rule inside** the existing `@media(max-width:820px)` block (`:276-293`), after
`:288`. It must declare, at minimum — buttons do not inherit font, and UA defaults would otherwise
render the `+` in Arial 13.33px on a `ButtonFace` grey block that is visibly wrong in
`[data-theme="dark"]`:

```css
.mobile-chrome-capture{display:inline-flex;align-items:center;justify-content:center;
  min-width:44px;min-height:44px;border:none;border-radius:9px;padding:8px 12px;
  background:var(--primary-light);color:var(--primary-dark);font:inherit;font-weight:700;
  line-height:1;cursor:pointer}
```

This mirrors `.menubtn` (`:285`), which declares `font:inherit` for the same reason.

`spa_index.html:280` must not be touched — `tests/spa-shell-a11y.test.mjs:47` anchors on the
literal `.mobile-chrome{position:sticky`, requiring that selector with `position:sticky` first.
The now-unused `.mobile-chrome-spacer` rule at `:288` should be **deleted** (no element will carry
the class). Deleting it is safe: the `:280`→`:296` slice inspected by `spa-shell-a11y.test.mjs:49-52`
asserts only `/#routeStatus\{display:none\}/`, which lives at `:284`, before `:288`.

**Desktop (≥821px)** — new sibling inserted between `:453` and `:454`, inside `aside#side`, with
`id="captureBtnDesk"`. It must sit clear of the build-frozen literals: `:445`, `:446`, `:463`
(all `RESIDENT_REBRAND` needles) and `:448`'s inner buttons `#mPath`/`#mLib`, pinned
character-for-character by `spa-shell-a11y.test.mjs:34-35`. (The `.modetoggle` **wrapper** at
`:448` is not pinned; its inner buttons are.)

Desktop usage is expected to be near-zero; the mount exists so the affordance is not
breakpoint-conditional and so laptop keyboard users have a path.

### B. Capture sheet

One dialog, reused by both mounts:

1. **Prompt** (attested-copy surface, P1).
2. **`<textarea maxlength="280">`** — the single most effective structural PHI control. 280
   characters holds a question and does not hold a narrative.
3. **Disclosure line**, always visible, not dismissible.
4. **Save / Cancel.** Save runs the PHI interstitial (P2) before writing.
5. **List of unrouted captures**, per-item delete, plus **Erase all captures**.

`role="dialog"` `aria-modal="true"`, with its **own** focus trap. Do **not** reuse `.tl-sheet` —
`visual-regression.spec.js:130-133` Shift+Tab-cycles that sheet and asserts the last
`.tl-sheet__item` is focused.

### C. Triage card

Rendered on `__home__`. For each untriaged capture the shell calls the existing `runSearch()`
(`spa_index.html:986-1012`). **`runSearch` is not extracted.** It closes over module-scope `SI` /
`VOCAB` (`:976`) and calls `tok()` (`:978`) and `idf()` (`:985`) inside the shell's un-IIFE'd
top-level script. The triage card lives in the shell, where those bindings are in scope.

**Required edit — the cold-load race.** `SI === null` means *"failed"* **or** *"not yet
resolved."* The success `.then` at `:982-983` sets `SI`/`VOCAB` and re-renders nothing, while
`:944` `openByFile('__home__',{replace:true})` → `:865` `renderHome()` runs in the same handler,
racing a 473–483 KB fetch. Without a hook the triage card paints "matching unavailable" on nearly
every cold load and never corrects. Add the same re-render hook the `topic_meta.json` fetch
already uses at `:480` / `:570`:

```js
if(document.getElementById('hmRoot')&&window.renderHome)renderHome();
```

appended to the `search-index.json` success `.then` at `:982`.

Three routes per capture:

- **Open the matched page** — `show()` on the top hit.
- **Review this topic** — call `seedSRS(f)`. The `topicHasQuiz()` guard is **already inside**
  `seedSRS` (`spa_index.html:565`, `if(!topicHasQuiz(file))return;`) — that placement *was* PR
  #291's fix. The caller adds no guard. The caller's obligation is the inverse: **do not offer
  the route when it would no-op.** Check `topicHasQuiz(f)` for *display* and hide the button when
  false, so the learner is never shown a control that silently does nothing. This matters more
  than it sounds: `runSearch` returns hits from `SI.docs` (`:1005-1011`) including tool pages and
  non-topic content, so a large fraction of top hits are not quiz-bearing topics.
- **Ask my attending** — clipboard, stamped (P4).

Degradation: if `SI` is null after the fetch settles, the card renders captures with delete +
clipboard only and states matching is unavailable. Capture itself never depends on the index.

### D. PHI heuristic promoted to a shared snippet

`SNIPPET_MARKERS` (`common.py:509-511`) gains a second entry:

```python
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
    "/*__PHI_HEURISTIC__*/": "phi_heuristic.js",
}
```

`phi_heuristic.js` sits **next to `common.py`** in `13_Faculty_Resources/_automation/site_build/`
— the path derives from `__file__` at `common.py:521` and `:588`.

**`sp-interview.html` is NOT migrated in this spec.** Its test suite reads the **source** HTML,
regex-extracts the main `<script>`, and `eval()`s it
(`_prototypes/sp-interview/tests/smoke.test.js:4-17`), then reads `window.__SP_TEST__`
(`sp-interview.html:1130`), which references `looksLikePhi` by identifier. `inject_shared_snippets`
only expands into `out_dir/tools/*.html` + `out_dir/index.html` (`common.py:539-545`) — never the
source. Replacing `:222-223` with a marker throws `ReferenceError` at eval time and takes down
`smoke.test.js`, `parity.test.mjs`, `marcus.test.js`, `ray.test.js`, `leak.test.mjs`, and
`review-filter.test.mjs`, all driven by `run-all.sh` from `ci.yml:130`. A third copy in
`sp-interview.preview.html` (reproducibility-checked by `run-all.sh:12`) compounds it.

Instead: the shell gets the marker; sp-interview keeps its inline copy; **test T3b pins the two
byte-identical** so they cannot drift. Consolidating sp-interview is a follow-on that must first
convert its suite off `eval(source)` — out of scope here.

**`_snippet_signature` — correct behavior.** `common.py:564-568` scans **every** line, `strip()`s
it, and returns the first whose stripped form starts with `function `. Position and indentation
are irrelevant (`sm2_apply_grade.js` opens with a 12-line block comment). The real constraint is
only that **at least one such line exists anywhere**, else `sig` is `None` and `page_contract_failures`
at `:616` silently disables double-injection detection.

**Fragility to design around:** the probe is the **whole stripped line**, matched by
`t.count(sig) > 1`. The sp-interview body is a one-liner, so a verbatim lift yields a
~120-character exact-substring probe that any later re-wrapping of `phi_heuristic.js` would
silently invalidate — degrading the check to a no-op with no signal. **Therefore: write
`phi_heuristic.js` with a short, stable `function looksLikePhi(t){` opening line and the body on
following lines.** T2 pins that the probe is non-`None`; T2b pins that it is under 60 characters.

---

## Data and storage

**Key:** `cw_capture_v1`. Written as a **string literal at every call site, never via a variable**
— PR #316 Task 9 established this so the gate's regex can verify it statically. This is not
optional here: `check-static-site.mjs:338-339` classifies non-literal keys as `computed-key`,
which is **baselined** in `qa-baseline.json` (`ms3: 6`, `res: 9`) and **hard-fails the deploy when
exceeded** (`:38`). One computed call site breaks the build.

```json
{
  "v": 1,
  "items": [
    {
      "id": "c_lp3k9q",
      "text": "why clozapine and not another antipsychotic here",
      "at": 1754400000000,
      "ctx": "t_psychosis.md",
      "triaged": false
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | local, random, non-sequential |
| `text` | string | **≤280 chars, hard-capped at write, re-clamped at read** |
| `at` | number | epoch ms |
| `ctx` | string \| null | route slug at capture time — a `nav.json` filename, not learner input |
| `triaged` | bool | set when any route is taken; triaged items evict first |

**`ctx` rule for special routes.** `window.__afterContent` (`:1167`) writes `cw_last` but does
**not** fire on the `special` branch (`:861-868`, which calls `__afterSpecial` at `:866`). So on
`__home__` — the one route where the triage card lives — `currentItem.f` is `'__home__'` and
`cw_last` still holds the previous page. **Rule: `ctx` is null when `currentItem.k === 'special'`.**
Never fall back to `cw_last`; a stale slug is worse than none.

**Cap:** 50 items, FIFO, triaged-before-untriaged.

**Not exported.** `exportStudy()` (`:1418-1429`) is an explicit 6-key allow-list. T5 pins it.

**Not a ledger.** One key, one writer, one reader, bounded. It does not overlap `cw_qb_v1`,
`cw_srs_v1`, or `cw_practice_events_v1`. The `deck#`/`cw_srs_v1` failure class (PR #291) came from
one flat namespace with four writers where the id prefix was the only partition.

---

## Privacy and clinical boundaries

Five independent layers; none load-bearing alone.

**P1 — Point-of-entry warning.** Pattern from `_prototypes/brief-psych/rp-brief-psych.html:320`.
Audience-neutral:

> **The question, not the patient.** No names, initials, room or bed numbers, dates, or MRNs —
> write what you want to understand, not who you saw. Stays on this device.

Textarea `aria-label`: `"Your question, no patient identifiers"`.

**P2 — Interstitial on save.** `looksLikePhi()` runs before every write. On a hit the save is held
and a `role="alertdialog"` offers **Edit** / **No patient details — save**, mirroring
`sp-interview.html:950-954` but re-worded (sp-interview's override asserts "It's fictional"; a ward
capture is not fictional, so the override asserts absence of identifiers).

**One pattern added** to the six inherited: `/\b(?:bed|room|rm)\s*#?\s*\d+/i`. Ward captures
reference locations in a way an interview transcript does not, and `\b\d{6,}\b` misses "room 302".

**Stated limitation, plainly:** this is a speed bump, not a filter. It does not detect names, and
it deliberately does not flag bare small numbers, because a psychiatry question is full of
legitimate ones ("QTc over 500", "lithium 1.2", "haldol 5 mg"). **The structural controls — the
280-char cap, no transmit, and the stamped clipboard — are what contain the risk.** There is no
automated PHI check anywhere in build or CI (`ci.yml` has 20+ steps, zero PHI steps;
`check-static-site.mjs:21-38` HARD and `:39+` SOFT enumerate every check, PHI among none), so this
runtime heuristic plus the copy is the entire enforcement surface.

**P3 — Always-visible disclosure**, permanent rather than dismissible because storage is on by
default:

> Saved on this device only, never sent anywhere. Erase all captures below.

**P4 — Stamped clipboard.** The one sanctioned egress, user-initiated, following
`decisional-capacity-module.html:139` (a fixed line inside the payload builder so **every** copy
path carries it):

> Questions from the unit, brought to supervision. Written by a trainee for teaching discussion —
> contains no patient information.

Note for the follow-on: `reflection-and-pif-set.html:151` `copyAll()` has **no** equivalent stamp.
That is a real gap in a shipped tool, surfaced by this review.

**P5 — Erase.** Per-item delete plus **Erase all captures** behind `confirm()`.

**Attestation.** Every string in P1–P4 is new learner-facing copy outside the attestation surface
(`site_manifest.json` has no shell entry). Mitigation: add an `index.html` entry to
`13_Faculty_Resources/reviewed.json`. Extra ledger entries beyond the manifest are already
tolerated and unenforced — **29** exist today — so this is additive and cannot break
`validate_attestation_consistency.py`.

---

## Failure and recovery behavior

| Condition | Behavior |
|---|---|
| `localStorage` throws (Safari private, quota) | Sheet opens; save shows "Couldn't save on this device" and offers the clipboard path. Never a silent drop. |
| `search-index.json` still in flight | Card renders in loading state, then re-renders via the `:982` hook. Not conflated with failure. |
| `search-index.json` fetch failed | Captures + delete + clipboard; states matching unavailable. |
| `topic_meta.json` fetch failed | **"Review this topic" is hidden.** `topicHasQuiz()` against an empty `TOPIC_META` returns `false` — a safe no-op, not a hazard. (This is *not* the `srsDropPhantomTopics()` rule; that function guards emptiness because it **deletes** cards and would wipe every legitimate `TOPIC#` card on a failed fetch — `:568-570`.) Hiding the control is UX, not safety. |
| Store corrupt / not an object | Reset to `{v:1,items:[]}`; do not throw past the reader. |
| `text` >280 on read (hand-edited store) | Clamp on read as well as write. |

---

## Accessibility

- Both mounts are `<button>`, ≥44×44, `aria-haspopup="dialog"`, `aria-expanded` maintained.
- Sheet is `role="dialog"` `aria-modal="true"`, labelled by its heading; focus moves to the
  textarea on open.
- **R2 — two-invoker rule.** The dialog records the invoking element on open and returns focus to
  **that** element on close, only if it is still `isConnected` **and** visible; otherwise focus
  moves to `#content`. `aria-expanded` is set on the recorded invoker only, and reset on both
  buttons on close. This is the exact bug class `spa-shell-a11y.test.mjs:61-77` pins for
  `.tl-sheet` (unconditional re-focus of a stale `sheetInvoker`), made worse here by a viewport
  that can cross 820px while the dialog is open. Pinned by T11b.
- Own focus trap — do **not** reuse `.tl-sheet` (`visual-regression.spec.js:130-133`).
- Interstitial is `role="alertdialog"`.
- `#mobileTitle` gains no children — `visual-regression.spec.js:141-142` asserts
  `toHaveText('Learning Path')` exactly.
- **No new `aria-live` region in the shell.** Announcements route through `announceRoute()`, whose
  call count is pinned at ≥5 (`spa-shell-a11y.test.mjs:26-27`).

---

## Testing and verification

**Harness constraint that shapes all of this:** `build_and_check.sh:47` runs
`node --test "$LIB"/tests/*.test.mjs` **before** `build_deploy.py` at `:54`. Root tests therefore
read **source** (`spa_index.html`, `phi_heuristic.js`) and must never touch built output or
execute browser APIs.

**Python — `test_common.py`** (mirror `TestSharedSnippets`, `:371-434`)
- T1. `/*__PHI_HEURISTIC__*/` expands; idempotent; unexpanded marker fails the page contract;
  duplicated marker fails it.
- T2. `_snippet_signature('phi_heuristic.js')` is not `None`.
- T2b. That signature is <60 chars — guards the one-liner-probe fragility (§D).

**Node — `tests/ward-capture.test.mjs`** (source-only, deploy blocker)
- T3. `phi_heuristic.js`, evaluated standalone, passes the 4 sp-interview fixtures
  (`_prototypes/sp-interview/tests/smoke.test.js:112`) plus `"room 302"` → true,
  `"QTc over 500"` → false, `"lithium level 1.2"` → false.
- T3b. **Drift guard:** the `PHI_PATTERNS` array literal in `phi_heuristic.js` is byte-identical
  to the one in `sp-interview.html:222`. Fails the moment either is edited alone.
- T4. Cap enforcement: 51 writes → 50 items, triaged evicted first; 400-char input → 280 stored.
- T5. **Static** assertion over the `exportStudy` payload literal (`spa_index.html:1419-1423`):
  it does not contain `cw_capture_v1`. Not an execution test — `exportStudy` needs `Blob`,
  `URL.createObjectURL`, and `document.body`, none available under bare `node --test`.
- T7. **Audience-token ban:** the capture copy block matches none of
  `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford`, case-insensitive.
- T8. No new capture string collides with a `RESIDENT_REBRAND` needle (`resident_section.py:116-125`)
  — a collision mis-brands **silently**, since `apply_verified_replacements` only reports absent
  needles (`common.py:411-415`).
- T11. The P1 prompt contains the literal `"No names"`.
- T11b. Focus-return: the close handler is guarded on the recorded invoker being `isConnected`
  (regex over source, mirroring `spa-shell-a11y.test.mjs:67-71`).

*(No T6. "`cw_capture_v1` appears as a string literal" is already enforced on the built artifact by
`check-static-site.mjs:337` (namespace) and `:338-339` + `qa-baseline.json` (computed-key ratchet).
A source-regex duplicate would be a weaker check in a weaker harness.)*

**Playwright — `tests/smoke/ward-capture.spec.js`**
**Requires adding the file to a project's `testMatch` array in `tests/smoke/playwright.config.js`**
— projects use explicit arrays (`:41`, `:46`, `:51`, `:56`, `:61`, `:66`), not directory globs, so
an unregistered spec is **silently skipped**.
- T9. `#captureBtnMobile` visible and clickable at 320 and 390 px; `#captureBtnDesk` at 1280 px —
  each on `__home__`, a md page, a tool route, and Learning Path. Those are the four route classes,
  and the tool and special branches are exactly where `.tl-dock` dies.
- T10. Existing `mobile shell ergonomics` suite unchanged and green — `:100`/`:152`/`:155`
  (`.tl-bar__item[data-tool]` counts), `:114-117` (backdrop click point), `:145` (`.tl-bar` absent
  on Learning Path), `:184-190` (no 320px horizontal overflow).
- T12. A capture whose top hit is a non-quiz-bearing page renders **no** "Review this topic"
  button, and creates no `cw_srs_v1` entry.

**Visual baselines:** required. The desktop mount is inside `aside#side`, changing
`sidebar-desktop.png` and `sidebar-mobile.png`. Run "Refresh visual baselines" `workflow_dispatch`
after merge — Ubuntu/Chromium, never locally.

---

## Expected tracked-file boundary

```
13_Faculty_Resources/_automation/site_build/spa_index.html
13_Faculty_Resources/_automation/site_build/common.py
13_Faculty_Resources/_automation/site_build/phi_heuristic.js          (new)
13_Faculty_Resources/_automation/site_build/test_common.py
13_Faculty_Resources/reviewed.json                                    (add index.html entry)
tests/ward-capture.test.mjs                                           (new)
tests/smoke/ward-capture.spec.js                                      (new)
tests/smoke/playwright.config.js                                      (register the new spec)
docs/superpowers/specs/2026-08-05-ward-question-capture-design.md     (this file)
```

Explicitly **not** touched: `check-static-site.mjs` (no new rule needed — existing namespace check
plus the computed-key ratchet already cover it), `_prototypes/sp-interview/**` (see §D),
`resident_section.py`, `site_manifest.json`, `build_deploy.py`, any tool HTML.

`_headers` and CSP are a verified no-op: `build_deploy.py:354` emits
`default-src 'self'; … script-src 'self' 'unsafe-inline'; connect-src 'self' https://sp-interview-proxy.netlify.app`.
`navigator.clipboard.writeText` is not CSP-governed and the feature adds no network origin.

---

## Sequencing

Build in a worktree off `origin/main` (`git worktree add .worktrees/<name> origin/main -b <branch>`),
never by copying from the working tree — the checkout is on `fix/table-scroll-desktop-affordance-v2`
and is behind `main`. **Re-derive every line anchor in the worktree before editing**; an
adversarial pass on this document's first draft found five §C anchors off by exactly 31 lines from
that stale base.

1. **Snippet infrastructure alone** — `phi_heuristic.js` + `SNIPPET_MARKERS` + marker in
   `spa_index.html` + T1/T2/T2b/T3/T3b. No learner-visible change; mergeable on its own.
2. **Capture + sheet + storage** — mounts, PHI stack, T4/T5/T7/T8/T9/T10/T11/T11b.
3. **Triage card** — the `:982` re-render hook, `runSearch` routing, display-side `topicHasQuiz`,
   T12.

Step 1 must not be bundled: it touches the build contract and deserves to fail alone.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A learner types a patient identifier anyway | High | P1–P5. **Accepted residual: the heuristic cannot detect names.** Knowing residual, not oversight. |
| Clipboard payload reaches the wrong channel | Medium | P4 stamp on every copy path; one click, user-initiated; no auto-copy. |
| MMC residents receive MS3-authored copy | Medium | T7 bans audience tokens; T8 guards collisions. Residual: MMC has no separate review record — flagged, not solved. |
| A computed-key call site breaks the deploy | Medium | String literals only; `qa-baseline.json` counts are exact ceilings (`ms3: 6`, `res: 9`). |
| Snippet probe silently degrades on reformat | Medium | T2b caps the signature length; short stable `function` opening line. |
| New spec file silently skipped by Playwright | Medium | `playwright.config.js` is in the boundary; T9/T10 must be observed failing before they pass. |
| Sidebar row changes visual baselines | Low | Expected; refresh via `workflow_dispatch` post-merge. |
| Captures accumulate untriaged | Low | 50-item FIFO cap; count surfaced on home. |

---

## Natural next steps

- **Stamp `reflection-and-pif-set.html:151` `copyAll()`.** A shipped free-text tool with clipboard
  egress and no supervised-draft stamp — a real gap this review surfaced, fixable in one line.
- **Vocabulary-assisted capture.** `search-index.json` ships 7,643 postings tokens and 175
  synonyms. A type-ahead over that vocabulary lets a learner pick curriculum terms instead of
  typing prose — structurally PHI-free, guaranteed `runSearch` hit, and a clipboard payload that is
  a list of topics rather than a transcript of the ward. Ship beside the free-text field once
  there is data on what learners actually type.
- **Convert the sp-interview suite off `eval(source)`**, then consolidate its `PHI_PATTERNS` and
  `sp-interview.preview.html` onto the shared marker — retiring T3b.
- **Aggregate capture themes into didactics.** Most-captured topics across a cohort are a direct
  signal for what to teach. Needs no new storage.
- **A real PHI check in CI.** There is none today. `phi_heuristic.js` is the natural seed for a
  repo-scanning variant over tracked content files.
