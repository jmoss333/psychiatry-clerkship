# Task 5 report — atomic governed Front Door cutover

Status: COMPLETE

## Outcome in plain language

The shared learner site now boots directly into the governed Front Door. Today, Path, Library,
Reader, and internal Progress all run through one controller and one stable shell; the retired
sidebar, dashboard, mode companion, and standalone Learning Path no longer compete with it.
Device-local due work, exact session resume, question capture, progress/mastery, placement,
personalized plan, and export remain available without changing their canonical stores or
clinical/safety wording. Both the MS3 and resident publish gates pass from the same atomic change.

## Starting state and genuine RED evidence

- Verified the requested clean starting HEAD was
  `6066c24b93e05efa96c79f5c5375a785b877f3bd`.
- Before production work, the new `fd-due` and shell-survival suites failed 0/9 because
  `fd_due.js` did not exist and the old body/boot still owned the page.
- The first full root run after the cutover exposed 17 failures: nine expected structural-test
  migrations and eight known sandbox `listen EPERM 127.0.0.1` launcher failures. After migrating
  the nine structural consumers, only the eight environment failures remained; the authorized
  loopback run passed.
- The first MS3 build found a genuine stale publish-gate coupling: static QA still required six
  maps removed with the legacy shell. The build failed with six hard findings. A regression was
  added before narrowing the inventory to the two live literal maps,
  `PRACTICE_LABELS` and `PRACTICE_PAGE_TOOLS`.
- Self-review added a delayed-hydration regression before the fix: 12/13 shell-boot tests passed,
  while a late metadata response could erase a nested placement or plan view inside Progress.
- Integration review added a real faculty-preview regression before the fix: 9/10 resource tests
  passed, while the initial governed tool performed zero preflights instead of one. The adapter
  had assigned `currentItem` too early, triggering the legacy same-tool early return. The final
  test executes the shipped resource controller and real preview/live adapters together and also
  proves preview navigation does not write the learner's `cw_last` bookmark.
- Exact visual-contract review found that the new main landmark omitted `.fd-main`, so its shipped
  width and page-padding rules would not apply. The shell-survival suite failed 12/13 before the
  class was added and returned to green afterward.

## Implemented shell and preservation inventory

- The source body has exactly one `.fd-shell`, one `<main id="content" class="fd-main">`, one
  route-status live region, one governance mount, and one set of overlay/nudge mounts.
- Exactly one `fdWire` controller is mounted on the stable root. Today, Path, Library, Reader,
  internal Progress, search, and sheet rendering are independently guarded. Stable root/window
  delegates replace rerender-fragile one-time handlers and avoid duplicate listeners.
- Task 4's live `getState` and `renderTransient` contracts are active. Transient chrome,
  completion, theme, overlay, and nudge updates preserve the exact mounted Reader/iframe when
  requested. The mobile `.fd-actionbar` remains outside and after `</article>`.
- `fd_due.js` supplies zero-safe due counts/labels, the exact
  `?tool=question-bank-practice.html&resume=1` route, valid-capsule resume, and escaped capture
  triage using the existing no-PHI purpose text.
- Normal learner resource opens update `currentItem` and `cw_last`, announce/focus the route, and
  retain the exact query. Faculty preview continues through the existing same-origin preflight,
  exact-revision query check, iframe load, and status receipt, while leaving learner bookmarks
  untouched.
- Reader mounts retain `marked.parse`, topic practice scaffolds, quiz state, feedback, table and
  collapsible enhancements, governance notices, history/back behavior, and route focus.
- Progress remains an internal Reader destination reached from Today, not a fourth tab. Mastery,
  calibration thresholds, weak topics, device-local exam date, placement, saved plan, anonymous
  export, and originating-tab Back behavior remain delegated and live. Delayed data hydration
  refreshes only the root `#pgRoot`, never a nested placement/plan view.
- The root state owns only Front Door progress routing; completion remains the legacy object map.
  The following canonical stores are pinned and preserved:
  `cw_progress_v1`, `cw_srs_v1`, `cw_quiz_v1`, `cw_qb_v1`, `cw_calib_v1`,
  `cw_pretest_v1`, `cw_plan_v1`, `cw_sess_v1`, `cw_capture_v1`, `cw_last`,
  `cw_study_id`, `cw_qb_focus`, and `cw_shelf_date`. `cw_frontdoor_v1` does not duplicate them.
- Theme initialization/control, service-worker registration, governance/faculty receipts, SRS
  seeding and phantom cleanup, capture limits and PHI heuristic, calibration, pretest, plan, and
  export semantics remain in the live shell.

## Learning Path retirement and test migration

Removed:

- `01_Six_Week_Curriculum/learning-path.html` — retired active standalone source.
- `tests/smoke/mode-companion.spec.js` — retired companion-only journey; replaced at this boundary
  by the live-shell/controller/surface contracts in `fd-shell-boot.test.mjs`.

Active Learning Path consumers were removed from build/nav/rebrand, curriculum, governance,
tool-count, prototype-CI, and smoke configuration/visual consumers. Expected inventories are now
MS3 22 governed tools and resident 24, while placed references remain MS3 81 and resident 90.
The historical `13_Faculty_Resources/reviewed.json` ledger entry is deliberately unchanged;
plans/archives and generic question-bank “learning-path” semantics also remain historical or
generic rather than active surface consumers.

Structurally migrated root tests are `calib-wiring`, `fd-action-contract`, `fd-inject`,
`fd-resource`, `parallel-ceilings`, `phase-chip`, `resume-card`, `shell-copy`,
`spa-shell-a11y`, `srs-home-counters`, `surface-governance-ui`, and `ward-capture-store`.
`calib-panel`, `mastery-weakflag`, `phase-wiring`, and `qbank-due-first` were inspected and already
remained valid against the retained pure functions. Smoke config, visual baseline routing, and the
ward-capture route were repointed only as required for retirement; Task 7 owns the complete
browser-journey rewrite.

The injected snippet inventory now includes `FD_DUE` and atomically moves the ceiling from 16 to
17. The CSS class inventory records 196 `fd-*` names (39 planned contract names plus 157 element
and modifier names), including the 20 Task 5 due/resume/capture/Progress classes.

## Final GREEN evidence

Focused cutover/resource verification:

```bash
node --test tests/fd-due.test.mjs tests/fd-shell-boot.test.mjs tests/fd-resource.test.mjs
# 28 passed, 0 failed
```

Validators and contract suites:

- Registry schemas: all seven live registries valid; schema tests 21/21.
- Topic metadata: 72 topics valid.
- Attestation consistency: 88 manifest items and 22 faculty-review entries aligned.
- Tool governance: MS3 22 / resident 24; validator tests 27/27. The existing five-file legacy
  metadata warning remains a warning.
- Curriculum: six weeks, 40 week items, 81 placed pages, 17 excluded; tests 46/46.
- Common injection tests: 53/53; surface-governance tests: 43/43.
- `_prototypes/sp-interview/tests/run-all.sh`: `ALL SUITES PASSED`; CI/build contract 47/47.
- Authorized full root suite: 1033/1033, zero failures, skips, or cancellations.

Sequential publication gates were rerun after the final production fixes:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- MS3: PASS; 81 placed refs, 22 governed tools, static QA hard failures 0, LFS 105 media files
  with no pointer stubs. Seven existing soft findings remain.
- Resident: PASS; 90 placed refs, 24 governed tools, new Front Door resident rebrand/artifact
  assertions pass, static QA hard failures 0, LFS 105 media files with no pointer stubs. Ten
  existing soft findings remain.
- Each final build's embedded root run also passed 1033/1033.

## Frozen palette and known debt

`tests/fd-contrast.test.mjs` is byte-unchanged and passes 2/2. No palette value changed, and this
report makes no blanket WCAG-AA claim. Dark mode enforces 52/52 pairs with zero exceptions. Light
mode enforces 41 pairs and retains these exact 11 design-inherited debts:

1. `fd-text-dim` on `fd-bg`: 3.85.
2. `fd-text-dim` on `fd-surface`: 4.26.
3. `fd-text-dim` on `fd-surface-warm`: 4.20.
4. `fd-text-dim` on `fd-selected`: 3.62.
5. `fd-text-dim` on `fd-chip`: 3.63.
6. `fd-text-dim` on `fd-callout`: 4.03.
7. `fd-terracotta` on `fd-bg`: 3.88.
8. `fd-terracotta` on `fd-surface`: 4.29.
9. `fd-terracotta` on `fd-surface-warm`: 4.22.
10. `fd-olive` on `fd-bg`: 4.23.
11. `fd-on-accent` on `fd-terracotta`: 4.29.

## Boundaries and residual risk

- No crisis data/copy, clinical facts, credentials, PHI, media, LFS objects, generated `_build`
  output, or substantive governance state changed. Capture/no-PHI wording and the historical
  review ledger remain exact.
- The approved Front Door palette is unchanged. Task 6, not this change, owns shell crisis
  injection/copy and the remaining safety/accessibility contracts.
- The source-level, root, prototype, validator, static-QA, and both-audience build contracts are
  green. The full rendered Playwright journey and Ubuntu/Chromium visual-baseline refresh remain
  intentionally deferred to Task 7; the small Task 5 smoke edits only remove/repoint retired
  structural consumers.
- Legacy CSS outside the new namespaced Front Door block remains for retained Reader/Progress
  content, but its competing runtime boot and duplicate listeners are retired.

## Concrete next option

Proceed to Task 6 as its own rollback-sized commit: finish shell crisis injection and the planned
safety/accessibility contracts without reopening this shell/state cutover.

## Potential innovative follow-up

Add a build-generated “shell continuity receipt” that hashes the active controller count,
listener/action vocabulary, canonical store allow-list, preview query contract, and mounted
resource identity checks for each audience. Reviewers could then detect a duplicated boot,
unexpected storage fork, or preview-policy drift from one deterministic artifact before browser
testing begins.

## Review-remediation round — 2026-08-17

Status: COMPLETE

An independent runtime review of Task 5 required changes before acceptance. This round started
from the requested clean Task 5 commit `eda84723c1b34c90f8ca00c479c7f4dcfe966d94` and used new
behavioral tests before production edits. In plain language, completion now updates everywhere on
the same click; old bookmarked route names reach the right Front Door view; the page keeps its
layout, capture control, title, and keyboard focus across navigation; and shared Progress wording
now makes sense on both learner sites.

### Remediation RED evidence

The consolidated focused Node run initially reported 103 tests, 96 passing and seven failing.
Those failures covered legacy-alias state/initial/delegated routing, replacement-theme focus,
Week-to-setup focus, capture-versus-search modal arbitration, and shared Progress copy. The first
real-Chromium matrix then exposed the remaining runtime-only failures. Each review finding had a
direct failing contract before its production change:

1. Completion remained one action behind, the two same-ref completion controls could cross-match,
   and mobile lost its required child `<span>`. The failing runtime test also pinned desktop,
   mobile, rail, persisted reload, and exact article/iframe identity through mark and unmark.
2. `__home__`, `__path__`, and `__start__` could become fake resource requests or mixed
   setup/Reader state. Pure/runtime tests failed across initial URL, delegated action/link,
   same-origin message, popstate, reload, Back, and Forward while retaining an unrelated `case`
   query and the last real `cw_last` bookmark. `__progress__` remained canonical.
3. Today, Reader, Progress, placement, and plan mutations could drop `.fd-main`; unscoped legacy
   `main`/`aside` rules also leaked into the new shell. A Chromium computed-style and DOM-class
   contract failed before scoping the old rules and preserving the main class.
4. Capture was not a stable learner-route control. The six-route/two-breakpoint smoke matrix failed
   before the persistent launcher landed. A separate Reader → Today → save regression proved the
   stale bug directly: the new capture inherited `orientation.md` instead of `ctx: null`, even
   though `cw_last` correctly remained `orientation.md`.
5. Theme and Week rerenders lost ordinary focus, and capture plus Command/Control-K produced two
   dialogs. Focus/controller tests failed for the replacement theme button and setup heading; a
   deterministic browser RED observed two dialogs plus `.fd-search`. The final modal regression
   also pins one Escape closing only capture and restoring its connected invoker.
6. Browser titles stayed stale across tabs, successful resources, Progress, placement, and saved
   plan. The Chromium title matrix failed before title ownership was added to each successful
   destination without changing faculty-preview receipts or query state.
7. Shared learner-visible Progress/plan text still contained `clerkship`, `Shelf`, and
   `shelf-blueprint` wording. The expanded semantic copy extraction failed until those phrases
   became resident-neutral `learning activity`/`exam` copy while the machine schema stayed exactly
   `clerkship-study-v2`.

Artifact self-review then caught one more active-surface remnant: phase policy still said “Set an
exam date on Start-here.” Its behavioral suite produced the expected 35/36 RED before the label was
changed to “Set an exam date in Progress”; the focused phase/copy rerun passed 43/43.

### Implemented remediation

- Completion derives from the just-patched controller state, updates desktop and mobile controls
  by both ref and scope, refreshes the rail immediately, preserves the mobile span, and never
  replaces the mounted article or iframe.
- All legacy aliases normalize through one route decision. Home maps to Today, Path to Path, and
  completed Start to internal Progress; incomplete Start remains on the appropriate role/week
  setup screen. Normalization uses replace-history, preserves unrelated query parameters, and
  never fetches or bookmarks a special slug.
- The stable `<main id="content">` retains `.fd-main` through every base/internal mutation. Old
  sidebar/main CSS is limited to direct `.layout` children so it cannot restyle Front Door rails.
- One stable global capture launcher remains present on Today, Path, Library, Reader, and Progress
  at both breakpoints, while Today alone retains capture triage and faculty preview exposes no
  launcher. Special views explicitly own `currentItem`, so capture context is never inherited from
  a prior Reader and the real learner bookmark remains unchanged.
- Theme restores focus to the replacement theme control; Week focuses the setup heading; the
  independent capture sheet suppresses Front Door modal shortcuts and owns the top-layer Escape.
- Learner titles reset for tabs/setup and update after successful resources plus Progress,
  placement/results, and plan. Faculty-preview title/query/status/preflight behavior is unchanged.
- Shared Progress, plan, export, blueprint, and phase-policy prose is audience-neutral. The
  coordinated storage/export identifiers, including `cw_shelf_date` and schema
  `clerkship-study-v2`, are deliberately unchanged.
- The stale `fd_wire.js` comment now describes the active single controller, and the stable
  capture modifier was added to the class inventory without changing the 196-class count.

### Final review GREEN evidence

- Focused controller/resource/shell/capture/copy suites: 98/98; phase-policy plus copy: 43/43.
- Registry/topic/curriculum/attestation/tool-governance/common validators all pass; common
  injection remains 53/53. Tool governance remains MS3 22 / resident 24 with the same five-file
  legacy metadata warning.
- `_prototypes/sp-interview/tests/run-all.sh`: `ALL SUITES PASSED`.
- Authorized full root suite: 1040/1040. The sandbox-only run reproduced exactly the eight known
  `listen EPERM 127.0.0.1` launcher failures; the authorized loopback run had zero failures.
- Fresh Chromium against the built artifacts: MS3 runtime plus capture 27/27; resident runtime
  7/7 and the same resident six-route/two-breakpoint capture matrix 20/20.
- Sequential final publication gates passed after the last copy fix. MS3: 81 placed refs, 22
  governed tools, 105 real LFS media files, hard QA 0, soft 7. Resident: 90 placed refs, 24
  governed tools, 105 real LFS media files, hard QA 0, soft 10. Search quality passed 9/9 for each.
- Resident artifact inspection confirms the MMC header/title rebrand, stable capture launcher,
  neutral learning-activity/exam prose, Progress phase destination, and unchanged
  `clerkship-study-v2` machine schema.

### Files and boundaries

Production changes are limited to `frontdoor/fd_wire.js`, `phase_policy.js`, and `spa_index.html`.
Contract/test documentation changes are limited to `CLASS-INVENTORY.md`, `fd-shell-boot`,
`fd-wire`, `phase-policy`, `shell-copy`, Playwright config, rewritten ward-capture smoke, and the
new runtime smoke suite. This report is the only ignored SDD artifact force-added with the round.

No crisis data/copy, clinical facts, faculty content or approval state, historical
`reviewed.json`, palette/contrast contract, media/LFS objects, generated `_build`, credentials,
or PHI changed. `tests/fd-contrast.test.mjs` remains byte-exact and all 11 inherited light-mode
palette-debt values remain unchanged. Task 6 safety/copy scope remains unopened. The residual risk
is the intentionally
deferred full Task 7 browser-journey/Ubuntu visual-baseline refresh; this round ran a compact real
browser action matrix on both built audiences but did not regenerate visual baselines.

## Review-remediation Round 2 — 2026-08-17

Status: COMPLETE

This narrowly scoped second review started from the requested clean commit
`6cd9bffe73fa19571abf7f452cc032c91957bb0d` and closed the only two adjudicated live findings.
In plain language, saving or removing a captured question now updates Today immediately without
breaking the Capture button or keyboard focus, and an old Home bookmark now stays on Today after
the browser immediately reloads its cleaned-up URL.

### Round 2 RED evidence

- The new controller-state test produced the expected 48/49 RED: direct
  `?page=__home__&case=reload` rendered Today and replaced the URL, but the saved Front Door state
  remained `tab: library` with `openId: orientation.md`; resolving the canonical URL again reopened
  that stale Reader.
- The new real-Chromium matrix produced the expected 0/4 RED across MS3 and resident. The initial
  Home case failed on both sites with the stale stored Reader after reload. Capture wrote its first
  item, but the cross-script `specialRefresh` lookup threw before textarea focus or Today refresh;
  search hydration also caught that same lookup failure and discarded its index.
- The capture regression pins the actual browser outcomes rather than source text: a known indexed
  `psychosis` capture gains both Open and Review actions without reload; save, delete, and erase
  update Today in the same session; there is no page error or error console; textarea focus returns
  after save; Cancel and Escape restore the exact still-connected launcher; and only one launcher
  exists. The retained ward-capture matrix separately keeps faculty-preview hiding, route and
  breakpoint persistence, PHI interstitial, Reader-to-Today null context, `cw_last`, and export
  exclusion under test.

### Implemented Round 2 remediation

- `spa_index.html` now declares one outer no-op `specialRefresh` dispatcher before metadata,
  search-index, and capture callers can run. After the single `fdWire` controller is ready, that
  same dispatcher receives the controller-aware Today/Progress refresh implementation. No second
  controller or listener path was added.
- `fdRenderCapture` now reconciles its mount idempotently: hidden/setup/faculty states clear it;
  learner app states keep the existing launcher node, remove only accidental duplicates, and create
  a launcher only when none exists. Its `aria-expanded` state and `capInvoker` identity therefore
  survive successful refreshes.
- Initial legacy alias handling now saves the already-normalized controller state before replacing
  the history route. Home therefore persists Today/no `openId`, unrelated query parameters remain,
  and the last real `cw_last` bookmark is unchanged. Existing Path, Start, Progress, delegated,
  message, popstate, Back/Forward, and reload contracts remain green.
- The faculty-preview behavioral test's extraction boundary moved from the retired local refresh
  declaration to the adjacent stable `fdOpenRef` declaration. Its governed preflight, iframe load,
  ready receipt, exact query, and no-bookmark assertions are unchanged and green.

### Round 2 GREEN evidence

- Focused affected Node suites (`fd-wire`, `fd-resource`, ward capture, and shared shell copy):
  69/69. The new alias persistence test is included in the full root count.
- Focused new Chromium cases: 4/4 across `nav-ms3` and `nav-res`. The wider built-artifact runtime
  and retained capture matrix passed 38/38: all nine runtime cases on both audiences plus the 20
  MS3 route/breakpoint/PHI/context/export/faculty-preview capture cases.
- Authorized full root suite: 1041/1041. The sandbox-only run reproduced the same eight known
  loopback `listen EPERM 127.0.0.1` launcher failures; the authorized run passed them all.
- Validators remain green: all seven registry schemas plus 21/21 schema tests; 72 topic metadata
  entries; 88 manifest and 22 faculty-review consistency entries plus 27/27 tests; curriculum at
  six weeks, 40 week items, 81 placed pages, 17 excluded plus 46/46 tests; tool governance at MS3
  22/resident 24 plus 27/27 tests and the unchanged five-file legacy metadata warning.
- `_prototypes/sp-interview/tests/run-all.sh` again ended `ALL SUITES PASSED`, including its 47/47
  CI/build contracts.
- Sequential publication gates passed after the production fix. MS3 remains 81 placed refs and 22
  governed tools; resident remains 90 placed refs and 24 governed tools. Both have static QA hard
  failures 0, search-quality 9/9, and 105 real LFS media files with no pointer stubs. Existing soft
  findings remain seven for MS3 and ten for resident.

### Round 2 files, boundaries, and residual risk

Production changes are limited to `frontdoor/fd_wire.js` and `spa_index.html`. Tests are limited to
`fd-wire.test.mjs`, the existing faculty-preview slice boundary in `fd-resource.test.mjs`, and two
behavioral cases in `frontdoor-runtime.spec.js`; this report is the only ignored SDD artifact added.

No crisis or clinical copy/data, faculty content or approval state, historical `reviewed.json`,
palette/contrast contract, media/LFS objects, generated `_build`, credentials, PHI, Task 6 work, or
the independently rejected Mark-as-read finding changed. There was no push, merge, deploy, or
visual-baseline regeneration. Residual risk remains the already-deferred full Task 7 journey and
Ubuntu visual-baseline refresh, not either Round 2 runtime contract.

Concrete next option: proceed to Task 6 as a separate rollback-sized safety/accessibility change.

Potential innovative follow-up: add a tiny development-only continuity observer that records the
current controller generation, launcher node identity, and last refresh reason. It could turn a
future cross-script callback or accidental node replacement into an immediate deterministic test
receipt without exposing learner data.

## Review-remediation Round 3 — 2026-08-17

Status: COMPLETE

This final narrow review started from the requested clean commit
`8323b2091ba33b19c5fb9c59499931385fc438c4` and closed one confirmed focus-continuity defect. In
plain language, the Capture dialog now keeps the keyboard inside itself while its saved-question
list and Today page refresh, and closing a dialog opened from the Today card returns the learner to
the newly rendered equivalent `+ Capture` button instead of dropping focus on the page.

### Round 3 RED evidence

- Three new built-browser behaviors were added before production code. The authorized Chromium
  matrix produced the expected 0/6 RED across MS3 and resident: save followed by Escape did not
  focus the recreated Today-card launcher; Delete left the textarea unfocused and the next Tab
  outside the modal; Erase All did the same. The first sandbox attempt could not launch Chromium
  because macOS denied its MachPort rendezvous, so it was not counted as behavioral evidence.
- The card test proves the original `.fd-capture__new` node is disconnected by the successful
  Today refresh, the replacement is a different live node, the textarea remains focused after
  save, and Escape must focus that replacement. The mutation tests focus the real Delete and Erase
  All controls, then require `#capText` plus a subsequent Tab inside `.cap-sheet`.
- Each case also checks for one global launcher and no browser page error or error-console entry.
  The mutation cases retain exact connected-global-launcher focus on close.

### Implemented Round 3 remediation

- One `capRefreshAfterMutation` path now owns save, delete, and erase refreshes. It rebuilds the
  in-dialog list, performs the existing controller-aware special refresh, and restores focus to
  the still-mounted textarea in a `finally` block. No new controller, listener, dialog policy, or
  storage path was introduced.
- `capClose` still prefers the exact connected invoker. When the recorded invoker is specifically
  a disconnected Today-card capture button, it resolves the current semantic equivalent before
  using the existing main-region fallback. If the card no longer exists, the fallback behavior is
  unchanged. The stale two-invoker comment now describes the actual global-versus-recreated-card
  lifecycle.

### Round 3 GREEN evidence

- Focused source-level resource/controller/shell/capture/copy tests: 74/74.
- Focused rebuilt-artifact Chromium cases: 6/6 across `nav-ms3` and `nav-res`. The wider runtime
  plus retained ward-capture matrix passed 44/44, covering immediate capture/search updates,
  exact global-launcher identity, route/breakpoint persistence, PHI interstitial, Reader-to-Today
  null context with preserved `cw_last`, export exclusion, faculty-preview hiding, Home aliases,
  modal arbitration, and document titles.
- The authorized full root suite passed 1041/1041 in each sequential publication gate. The initial
  sandbox-only MS3 gate reproduced exactly the eight known `listen EPERM 127.0.0.1` launcher
  failures while its other 1033 tests passed; the authorized rerun had zero failures.
- All registry, topic metadata/safety, attestation, curriculum, tool-governance, and common
  injection validators passed, including schema 21/21, topic safety 6/6, attestation 27/27,
  curriculum 46/46, tool governance 27/27, and common 53/53. The five-file legacy metadata warning
  is unchanged.
- `_prototypes/sp-interview/tests/run-all.sh` ended `ALL SUITES PASSED`.
- Sequential builds passed: MS3 remains 81 placed refs and 22 governed tools with QA hard 0 / soft
  7; resident remains 90 placed refs and 24 governed tools with QA hard 0 / soft 10. Both passed
  search quality 9/9 and LFS inspection with 105 real media files and no pointer stubs.

### Round 3 files, boundaries, and residual risk

Production changes are limited to `spa_index.html`; behavioral coverage is limited to the existing
`frontdoor-runtime.spec.js`; this report is the only SDD artifact updated. No crisis or clinical
copy/data, faculty content or approval state, historical `reviewed.json`, palette/contrast values,
media/LFS objects, generated `_build`, credentials, PHI, Task 6 policy, route/storage schema, or
faculty-preview contract changed. There was no push, merge, deploy, dependency change, or visual
baseline regeneration. The known Task 7 full-journey/Ubuntu visual-baseline work remains the only
deferred residual risk.

Concrete next option: accept this rollback-sized focus fix and proceed to Task 6 without reopening
Task 5 state, routing, or capture-data behavior.

Potential innovative follow-up: give refreshable controls an audience-neutral semantic focus key
that the shell can resolve after any render. That could generalize this safe card-invoker recovery
to future dynamically rendered controls without retaining stale DOM nodes or learner data.

## Review-remediation Round 4 — 2026-08-17

Status: COMPLETE

This final asynchronous-focus review started from the requested clean commit
`d030dc1cea0383d37f867615cfb5da89ca79a431`. In plain language, a slow search-index response can
now improve a captured question's Today-card actions without silently moving the learner's
keyboard focus out of the open Capture dialog.

### Round 4 RED evidence

- A real-browser test holds `search-index.json` at the request boundary, opens Capture, saves the
  known indexed question `psychosis` while matching is unavailable, and proves the unmatched card
  and focused textarea before releasing the response. This uses an explicit promise-controlled
  route rather than a timeout or timing race.
- The unmodified built artifacts then produced the expected 0/2 RED across MS3 and resident. Once
  hydration added the same-session matching action, the exact connected textarea was no longer
  active inside `.cap-sheet`, and the next Tab also landed outside the modal on both sites. Match
  hydration itself succeeded and there were no page errors or error-console entries.

### Implemented Round 4 remediation

- The existing controller-aware `specialRefresh` dispatcher now records an active connected
  capture-sheet element before rendering and restores that exact element in a `finally` block when
  it remains connected inside the same sheet. This covers search/topic hydration and future users
  of the one shared refresh path without adding a refresh, controller, or listener.
- Round 3's mutation helper remains unchanged: it still selects `#capText` only when save, delete,
  or erase has replaced list content. No focus trap policy, route, storage, capture data, or
  matching behavior changed.

### Round 4 GREEN evidence

- Focused source-level resource/controller/shell/capture/copy tests: 74/74.
- The deterministic rebuilt-artifact hydration test passed 2/2 across `nav-ms3` and `nav-res`:
  matching appeared in the same session, the exact textarea remained connected and focused, the
  next Tab stayed within `.cap-sheet`, Escape restored the exact connected global launcher, one
  launcher remained, and browser error collection stayed empty.
- The wider runtime plus retained ward-capture matrix passed 46/46, including Round 3 card/global,
  delete/erase, aliases, PHI/context/export, faculty-preview, modal, layout, and title contracts.
- Each sequential authorized publication gate passed the full root suite at 1041/1041. MS3 remains
  81 placed refs / 22 governed tools / QA hard 0 soft 7; resident remains 90 placed refs / 24
  governed tools / QA hard 0 soft 10. Both passed search quality 9/9 and LFS inspection with 105
  real media files and no pointer stubs.
- Registry, topic metadata/safety, attestation, curriculum, tool-governance, and common injection
  validators all passed with their prior counts. The five-file legacy metadata warning is
  unchanged. `_prototypes/sp-interview/tests/run-all.sh` ended `ALL SUITES PASSED`.

### Round 4 files, boundaries, and residual risk

Production changes are limited to `spa_index.html`; browser coverage is limited to
`frontdoor-runtime.spec.js`; this report is the only SDD artifact updated. No crisis or clinical
copy/data, faculty content or approval state, historical `reviewed.json`, palette/contrast values,
media/LFS objects, generated `_build`, credentials, PHI, Task 6 dialog policy, route/storage
schema, or faculty-preview behavior changed. There was no push, merge, deploy, dependency change,
or visual-baseline regeneration. The known Task 7 full-journey/Ubuntu visual-baseline work remains
the deferred residual risk.

Concrete next option: accept this shared refresh-boundary fix and proceed to Task 6 without further
Task 5 capture-focus changes.

Potential innovative follow-up: add a development-only focus-continuity assertion around every
asynchronous shell hydration callback. It could fail immediately when an open modal loses its
active descendant, while logging only element semantics and never learner-entered content.
