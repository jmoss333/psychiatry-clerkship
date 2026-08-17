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
