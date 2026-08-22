# Task 7 report — complete learner-journey browser verification

Status: COMPLETE LOCALLY — functional browser, publication, and contract gates are green; Ubuntu
visual-baseline refresh remains an explicit controller handoff

## Outcome in plain language

The browser suite now tests the interface learners actually use: Today, Library, Path preview,
Reader, search, Safety, Progress, capture, governance notices, and the faculty preview boundary.
It verifies the complete MS3 and resident journeys without depending on the retired sidebar DOM.
The tests preserve the exact curriculum, safety, accessibility, no-PHI, governance, and
faculty-authority contracts. Four obsolete sidebar/topic screenshots were removed; no replacement
images were generated on macOS.

## Starting state and genuine RED

- Verified starting HEAD: `810bb8ae664720e56beb98152a69aaf36f3124e8`.
- An initial connection-refused run after a short-lived server exited was classified as invalid
  environment evidence, not product RED.
- Against controlled current MS3/resident/faculty builds, the legacy learner smoke suite produced:

  ```text
  69 tests: 45 passed, 17 failed, 7 did not run
  ```

  The failures were retired sidebar selectors, obsolete governance/faculty shell assumptions,
  stale copy/URL expectations, and the old Interview Room port default. Existing exact navigation,
  capture, and aria-live coverage continued to pass.
- The first new Front Door run produced a genuine `6 passed, 8 failed` across 14 tests. It exposed
  two real mobile target widths plus test-fixture defects in a broad safety selector and a
  non-adjacent Reader pair. Those causes were separated before implementation.
- The broad governance/browser batch then produced `54 passed, 6 failed` across 60 tests. One
  failure was a real deterministic race: if governance became ready while markdown was still
  pending, the eventual Reader reused an obsolete unavailable notice.

## Two rollback-sized production fixes

### `3685c5f fix(frontdoor): meet mobile touch targets`

- Strict focused source RED: 2 tests, 0 passed, 2 failed.
- The smallest CSS change gives the base mobile `.fd-searchbtn` and
  `.fd-actionbar .fd-btn--ghost` rules a 44px minimum width, using the existing mobile rule and no
  palette, content, or layout redesign.
- Focused GREEN: 2/2. The source assertion was subsequently hardened to parse exact base
  selector-list membership, so a descendant or pseudo-class rule cannot create a false green.
- Real Chromium at 390x844, both audiences:
  - search: 28x44 before, 44x44 after;
  - Reader Back: 38.0156x47.6875 before, 44x47.6875 after;
  - viewport/scroll width remained 390/390, and the expanded search control does not overlap the
    adjacent brand or header actions.

### `f37f57a fix(frontdoor): reconcile delayed governance notices`

- A deferred-markdown regression reproduced a stale unavailable notice even after the reviewed
  receipt became ready.
- The Reader now resolves the governance notice immediately before mount. It adds no polling,
  fetch, or store and preserves stale-response exits.
- Focused resource/controller/governance GREEN: 98/98. Coverage includes delayed reviewed,
  pending-high, pending-compact, and truly unavailable branches.
- Real built Chromium on both audiences mounted the fresh receipt
  `Reviewed by Joshua Moss, MD · 2026-06-29` with no unavailable notice.
- Both exact production diffs received independent approval with no Critical or Important finding.

## Task 7 browser migration

- Added `front-door.spec.js` to both learner projects. Its seven tests per audience cover first-run
  Today/Library, focus order and non-mutating Path preview, Reader adjacency/history, keyboard
  search and focus restoration, Safety/theme/Progress, malformed-protocol failure behavior, and
  390x844 reduced-motion/action-bar/header geometry.
- The malformed-protocol test exercises the real built browser path, asserts the exact
  owner-approved failure sentence, and derives every expected crisis resource from the built
  template. It does not duplicate a contact value.
- Kept exact route inventory separate from deduplicated Library projection:
  - navigation crawl: 98 MS3 / 106 resident routes;
  - rendered unique Library refs: 81 MS3 / 90 resident.
- Governance examples are chosen from the rendered Library intersection. Search uses an exact
  deterministic result and still asserts accessible badge, ranking, and deduplication behavior.
- Faculty tests preserve status/history, iframe origin/path/query, exact-revision token,
  no-mutation, dirty-navigation, conflict, receipt, and mobile preview-rail locks.
- Capture tests pin the exact `.cap-warn` no-PHI sentence and keep faculty preview free of learner
  capture controls.
- Interview Room now derives its default from configured MS3 `/tools/`; the required explicit
  `SP_INTERVIEW_BASE_URL=http://127.0.0.1:4200/tools/` command remains documented.
- Visual coverage is deterministic resident Front Door Today/Reader at desktop and mobile, with
  frozen time and seeded state. The four semantic expected files are:
  - `front-door-today-desktop.png`
  - `front-door-reader-desktop.png`
  - `front-door-today-mobile.png`
  - `front-door-reader-mobile.png`

## GREEN evidence

### Focused browser and source gates

```text
Front Door, both learner projects: 14/14 passed
Governance + Front Door, both learner projects: 28/28 passed
Faculty console: 27/27 passed
Hardened mobile selector contracts: 2/2 passed
```

### Validators and non-browser suites

```text
Registry schemas: 7/7 OK
topic_meta: 72 records OK
Curriculum: 6 weeks, 40 week items, 81 pages, 17 excluded
Attestation: 88 manifest entries, 22 facultyReview entries
Tool governance: MS3 22, resident 24
Common Python suite: 53/53 passed
Root Node suite: 1060/1060 passed
SP Interview prototype: 15/15 canonical suite files passed via tests/run-all.sh
```

The audited literal `node --test _prototypes/sp-interview/tests` command is incompatible with
Node 22 directory execution and reports a missing module. The repository's canonical
`_prototypes/sp-interview/tests/run-all.sh` runner passed every suite file; this is command drift,
not a product failure. An ordinary sandbox root run also hit the known eight loopback `listen
EPERM` cases; the authorized real-loopback run passed 1060/1060.

### Sequential publication builds

```text
MS3: build OK; nav 98; content markdown 76; tools 22; JSON 15;
     Front Door 81 refs; static QA hard 0 / soft 7 / info 4;
     LFS 105 real files / 0 pointers

Resident: build OK; nav 106; content markdown 82; tools 24; JSON 17;
          Front Door 90 refs; static QA hard 0 / soft 10 / info 6;
          LFS 105 real files / 0 pointers
```

Both builds reran the 1060-test root suite successfully. The existing fail-soft Anki path used the
committed package because `genanki` is unavailable. The MS3 build also retained its known media
report: 5/17 linked videos available and 12 broken embeds stripped.

### Real Playwright functional matrix

The required functional command used real Chromium and an explicit `/tools/` Interview Room base.
Because localhost 4200 was already occupied by an existing Python process in this managed
worktree, the exact current builds were served on controlled ports 4300/4301/4302; that unrelated
listener was inspected read-only and never stopped.

```text
nav-ms3:         96/96 passed (10 files)
nav-res:         70/70 passed (7 files)
faculty-console: 27/27 passed (1 file)
interview-room:  23/23 passed (1 file)
offline:           1/1 passed (1 file)
TOTAL:          217/217 passed in 31.4s
```

The separate hosted LFS project reported 2/2 skipped because neither deploy URL was supplied.
That local-project skip is distinct from product health; both authoritative builds verified all
105 media files and zero pointers.

## Visual and manual handoff

- The visual project lists four deterministic tests, one for each semantic file above.
- No visual test was executed and no baseline was generated locally, because baselines must be
  Ubuntu/Chromium artifacts.
- The obsolete `sidebar-desktop`, `sidebar-mobile`, `topic-desktop`, and `topic-mobile` PNGs are the
  only baseline deletions. No PNG was added.
- A controller must push the eventual branch and dispatch **Refresh visual baselines** on Ubuntu,
  then inspect and commit those four generated Front Door images.
- Browser-plugin manual evidence remains controller-only and was not claimed here. The full real
  Playwright functional suite was executed.

## Exact Task 7 file boundary

- `tests/smoke/front-door.spec.js` (new)
- `tests/smoke/{README.md,aria-live.spec.js,faculty-console.spec.js,governance-warnings.spec.js}`
- `tests/smoke/{nav-crawl.spec.js,playwright.config.js,visual-regression.spec.js,ward-capture.spec.js}`
- `tests/spa-shell-a11y.test.mjs` (test-only selector hardening)
- four obsolete PNG deletions under `tests/smoke/baseline/`
- this report

No clinical fact, faculty decision, governance record, crisis-resource value, credential, PHI,
media object, generated `_build` output, or unrelated source was edited. Nothing was pushed,
dispatched, merged, or deployed.

## Residual risk and concrete next best option

There is no local functional or publication blocker. The remaining release evidence is the
Ubuntu/Chromium visual refresh and controller review of its four semantic diffs. The next best
option is to push these audited commits to a branch, dispatch that workflow, and review only the
four new Front Door baselines before any merge decision.

## Potential innovative follow-up

Have the Ubuntu workflow emit a tiny machine-readable visual receipt containing each semantic
baseline name, viewport, frozen clock, seed-state hash, and screenshot SHA-256. Reviewers could
then detect stale state or accidental local-platform images before looking at pixel diffs.

## Final-review Round 1 — browser coverage gaps

Status: COMPLETE LOCALLY — all three Important test gaps reproduced and closed; one separate live
CSS defect received its own rollback-sized production commit

### 1. Sampled routes now reject the real Front Door fallback

The former sample check looked only for legacy `.error` markup or fewer than 80 characters. A
temporary request failure for sampled `t_mood.md` rendered the real
`.fd-fallback[role="alert"]` with 84 characters, yet the old test passed 1/1. The fallback check
now runs immediately after every sampled route settles and before the tool early-return branch.
Under the identical request mutation, the repaired test failed with
`t_mood.md: Front Door fallback rendered`; after removing the mutation, the focused MS3/resident
run passed 2/2.

### 2. Live Reader wide-table accessibility was restored

The functional learner suite now opens `pg_interview.md` at 390x844 and proves the actual table:

- lives in the current `.fd-article__body` Reader with no fallback;
- opens through its section button;
- is an overflowing `.table-scroll.is-scrollable` region;
- carries `role="region"`, `tabindex="0"`, and `aria-label="MSE Structure table"`;
- exposes its visible scroll cue; and
- remains contained within the document width.

The first live run was genuine RED on both audiences: all region/label/tabindex/containment checks
passed, but the existing cue was hidden. Root-cause tracing found that the unchanged
`display:block` rule was scoped only to legacy `.md-body`, while Front Door mounts the same table
under `.fd-article__body`. A focused exact-selector source contract independently failed 0/1.

Commit `9696f45 fix(frontdoor): restore wide-table scroll cues` makes only one selector-list
compatibility change so the existing cue rule also matches `.fd-article__body`; it changes no
style value, palette, markup, content, or other layout rule. That patch was intentionally treated
as partial after a fresh controller probe showed the live viewport still had
`overflowX: visible`, `clientWidth: 308`, `scrollWidth: 328`, and an immovable `scrollLeft: 0`.
The raw live table also lacked the shared border, padding, header background, and spacing rules.

The strengthened browser test then failed 0/2 because the region could not scroll internally,
and an exact selector-parser test for every shared table mechanic failed 0/1. Commit
`dd750ee fix(frontdoor): contain live reader tables` extends only the existing selector lists to
the live `.fd-article__body` wrapper: shell positioning/margin, viewport overflow/touch/border/
background, max-content table sizing/margin, overflow gradient, base cells and header, and mobile
cell widths. It changes no CSS value, palette, markup, or content. The parser passed 1/1 and rebuilt
Chromium passed 2/2 across MS3 and resident, proving computed horizontal overflow is scrollable,
`scrollLeft` actually changes, the cue is visible, keyboard semantics remain exact, and the page
itself stays contained.

### 3. Reader visuals now wait for stable governance

The Reader screenshot readiness path now requires the visible reviewed receipt for `t_mood.md`
and zero unavailable notices, in addition to the Reader body, no Front Door fallback, and loaded
fonts. A screenshot-free deferred-governance mutation proved the gap and the fix:

- old helper: returned while the unavailable notice was visible (`1/1` false-green
  characterization);
- repaired helper with governance held: timed out waiting for the reviewed receipt (`0/1`),
  proving it refuses the unstable frame;
- delayed response released: waited for the reviewed receipt, observed zero unavailable notices,
  and passed `1/1`.

The temporary mutation test was removed. The visual project still lists exactly four tests and
the same four semantic names. No visual comparison ran and no baseline PNG was created.

### Round 1 GREEN evidence

```text
Sequential MS3 build: OK; root 1061/1061; QA hard 0 / soft 7 / info 4;
                      LFS 105 real files / 0 pointers
Sequential resident build: OK; root 1061/1061; QA hard 0 / soft 10 / info 6;
                           LFS 105 real files / 0 pointers
Full learner Chromium projects: 168/168 passed in 20.4s
  nav-ms3: 97/97 (10 files)
  nav-res: 71/71 (7 files)
Fresh authorized root suite: 1061/1061 passed
Visual list: 4 tests / 1 file; no execution or snapshot update
```

The ordinary sandbox root invocation again produced only the known eight loopback `listen EPERM`
failures (`1053 passed, 8 failed`); the authorized loopback run passed 1061/1061. Ports 4300 and
4301 were controlled local build servers; the pre-existing port-4200 process remained untouched.

Round 1's final test/report-only boundary is `tests/smoke/nav-crawl.spec.js`,
`tests/smoke/visual-regression.spec.js`, and this report. The wide-table browser test is already in
the separate `dd750ee` production/focused-test commit with `spa_index.html`,
`tests/spa-shell-a11y.test.mjs`, and `tests/smoke/front-door.spec.js`; the earlier cue-only
`9696f45` commit contains only `spa_index.html` and its focused source contract. No clinical fact,
governance record, faculty decision, crisis-resource value, credential, PHI, media object, or
generated `_build` output was committed. Nothing was pushed, dispatched, merged, or deployed; the
Ubuntu four-baseline handoff remains.

## Ubuntu visual-baseline review remediation — Round 2

Status: COMPLETE LOCALLY — the first Ubuntu baselines were rejected after direct inspection; all
three Important visual/runtime defects and the one Minor receipt-wrap defect have genuine RED/GREEN
coverage. The four currently tracked PNGs remain intentionally unapproved until the Ubuntu workflow
regenerates them from this repaired source.

### 1. Narrow headers reflow instead of colliding

Both 390px Ubuntu images showed the brand, search field, shortcut hint, and Week control painting
over one another. A real-browser regression that inspects the painted bounds of each control failed
on MS3 and resident before production changes. It now exercises Today and Reader at 320, 360, 390,
561, 600, 601, 640, and 641px, plus the longer browse-mode `Set week` state at 601 and 641px,
and proves that:

- brand, search, Week, Safety, and theme controls do not intersect;
- every control stays inside the viewport and is at least 44 by 44px;
- the brand name plus search icon remain visible and the search label retains at least 44px;
- the keyboard shortcut hides only at the narrow breakpoint;
- the header ends before main content and the document does not overflow.

The shell now uses a two-row grid at 640px and below: brand/search remain in row one and the three
utilities occupy a right-aligned second row. The search icon no longer flex-collapses, and the brand
receives the same mobile touch-height contract as the other controls. A stale one-row assertion was
removed only after the stronger multi-width/multi-surface test was green. Independent review then
found a 561px readability cliff: the old flex row left only 14.8px of MS3 search label visible while
restoring the shortcut. The widened regression failed 0/2 before the breakpoint moved from 560 to
600px. A second boundary review then reproduced a subtler false green at 601px: the normal fixture
showed the short `Week 1` label, while browse mode's canonical `Set week` label compressed Search
below the 44px readability contract. The explicit browse-mode fixture failed 0/2 before the final
breakpoint moved to 640px and passed across both audiences afterward; 641px remains the proven
single-row boundary.

### 2. Same-route hydration no longer steals initial focus

The Today desktop image contained a page-sized blue focus ring because asynchronous topic/search
hydration rendered Today a second time and the old boolean announcement state mistook that refresh
for navigation. A delayed-search-index browser test failed before the fix with `#content` focused
and `:focus-visible` immediately after hydration.

The first repair distinguished same-route hydration from a real route, but independent review found
two false-green edges: hydration still detached an already-focused header or Today control, and Back
from a still-loading resource could be mistaken for the previously announced route. Both reproduced
across MS3 and resident (`0/4`) before the final production change.

The runtime now records the active route as ref plus pathname/query and carries an explicit pending
navigation-focus state until that route actually renders. The hydration path is explicitly tagged,
does not replace the chrome, and restores the semantic identity, selection, and focus of any Today,
search, or capture control whose subtree must refresh. The final tests prove:

- first load leaves main unfocused;
- the exact focused Search node remains connected across search-index hydration;
- a recreated Today Capture control regains focus after topic metadata hydration;
- Back from a held `welcome.md` response focuses the restored Today main; and
- releasing and fully settling the stale response cannot remount Reader or displace Today.

### 3. Capture occupies layout space instead of covering content

The Ubuntu images also showed the fixed global Capture launcher covering Today cards and Reader
text. Browser geometry reproduced real overlap at 320, 390, and 1280px. The stable mount now appears
immediately before main as an in-flow, right-aligned utility row. Its existing launcher node,
delegated click handler, focus-return contract, every-route visibility, 44px target, and Reader
action-bar separation remain unchanged; no capture JavaScript changed.

The repaired test proves the launcher and content never overlap on Today or Reader at all three
widths, the mount precedes main, the target remains usable, and no horizontal overflow is added.

### 4. Reviewed dates stay readable on mobile

The mobile Reader receipt split the ISO date after `2026-07-`. The date is now emitted as semantic
`<time datetime="YYYY-MM-DD">` markup with only that date kept on one line. Source and real-browser
tests prove the exact receipt contract, one rendered date fragment, and unchanged reviewer/date
meaning at a real 320px viewport; the rest of a long receipt remains free to wrap.

### Round 2 RED and GREEN evidence

```text
RED source:  spa-shell accessibility 11 passed / 1 failed (brand touch height)
RED browser: 5 failed / 0 passed across the two audiences
             (header x2, hydration focus x2, capture overlap x1)
RED receipt: surface governance 26 passed / 1 failed (semantic nonbreaking date)
Independent-focus RED: 0/4 (focused hydration x2, interrupted Back x2)
Breakpoint-cliff RED: 0/2 at 561-600px
Browse-boundary RED: 0/2 at 601/641px with the canonical Set week state

GREEN initial visual browser: 5/5
GREEN independent focus browser: 4/4
GREEN final responsive/focus/receipt browser: 8/8
GREEN focused source: fd shell/wire/accessibility/governance 102/102
Full learner Chromium projects: 175/175 passed, 0 failed/skipped/errors
  nav-ms3: exact crawl 98/98
  nav-res: exact crawl 106/106
Sequential MS3 build: OK; root 1062/1062; QA hard 0 / soft 7 / info 4;
                      81 placed refs / 22 governed tools; LFS 105 / 0 pointers
Sequential resident build: OK; root 1062/1062; QA hard 0 / soft 10 / info 6;
                           90 placed refs / 24 governed tools; LFS 105 / 0 pointers
```

A fresh-origin resident browser-plugin inspection at 390px independently showed two clean header
rows, visible brand/search content, an in-flow Capture row above content, `BODY` retaining initial
focus, no document overflow, and zero console warnings/errors. A previously opened origin had a
service-worker-cached old stylesheet; the fresh origin and both rebuilt Playwright projects avoid
that stale-cache false signal.

### Round 2 exact boundary and handoff

Production changes are limited to `frontdoor/frontdoor.css` and `spa_index.html`. The class
inventory documents the corrected in-flow Capture contract. Focused regressions live in
`front-door.spec.js`, `frontdoor-runtime.spec.js`, `governance-warnings.spec.js`,
`ward-capture.spec.js`, `fd-shell-boot.test.mjs`, `spa-shell-a11y.test.mjs`, and
`surface-governance-ui.test.mjs`, plus this report. No clinical fact, crisis data, governance
record, faculty decision, palette value, media, credential, PHI, or generated `_build` output
changed.

The concrete next step is to commit and push this rollback-sized repair, dispatch **Refresh visual
baselines** on Ubuntu/Chromium, inspect all four replacement images, and explicitly rerun hosted CI
because the baseline workflow's generated commit uses `[skip ci]`. Do not merge until that visual
review and CI run are green.

Potential follow-up: add a test-only `data-fd-ready` receipt that becomes stable only when resource,
governance, metadata hydration, and post-processing have settled. Screenshot readiness and future
artifact receipts could share that one deterministic signal rather than assembling separate waits.
