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
