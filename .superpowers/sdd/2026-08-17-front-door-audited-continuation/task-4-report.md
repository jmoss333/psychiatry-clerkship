# Task 4 report — routed controller and resource adapter

Status: COMPLETE

## Outcome in plain language

The next Front Door now has a tested routing and interaction engine behind the existing site. It
can decide what a click or keyboard action means, restore routed state, open governed pages and
tools, manage dialogs and progress, and preserve preview/query safeguards. The existing sidebar,
body, render boot, and visible experience remain fully active; the new controller is injected but
deliberately not installed until the later atomic cutover.

## Starting state and RED evidence

- Verified the requested starting HEAD was
  `36b2c86baac3a20985b9ff7ae05bbc02ccd21f80` and the non-media worktree was clean.
- The pre-change Front Door baseline passed 238/238 focused tests.
- Before creating `fd_wire.js`, ran:

```bash
node --test tests/fd-wire.test.mjs tests/fd-resource.test.mjs tests/fd-action-contract.test.mjs
```

All three new test files failed for the intended reason: `ENOENT` for the missing
`frontdoor/fd_wire.js`. No production controller code existed at that point.

- Self-review later found that pure auto-advance selected the next resource but the runtime had
  not opened it. A targeted test was added first and failed with `actual []`,
  `expected ['b.md']`; the minimal effect/adaptor fix then made it pass.

## GREEN evidence

```bash
node --test tests/fd-wire.test.mjs tests/fd-resource.test.mjs \
  tests/fd-action-contract.test.mjs tests/parallel-ceilings.test.mjs
# 34 passed, 0 failed

python3 13_Faculty_Resources/_automation/site_build/test_common.py
# 53 passed, 0 failed

node --check 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js
# passed
```

The full root suite first reproduced the expected sandbox limitation: 999 passed and the eight
smoke-server-launcher cases failed only with `listen EPERM 127.0.0.1`. The approved loopback rerun
passed. The final post-review root result is recorded as 1010/1010 in the commit handoff.

Sequential builds both passed:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- MS3: static QA hard failures 0; LFS preflight 105 media files, no pointer stubs.
- Resident: static QA hard failures 0; LFS preflight 105 media files, no pointer stubs.
- Both generated artifacts contain `fdResolveState`, `fdDispatch`, `fdResourceRequest`, and
  `fdOpenResource`; neither contains an unexpanded `FD_WIRE` marker.
- Existing soft QA notes remain: metadata coverage, legacy tool metadata, and computed-key
  advisories. They are not new hard failures.

## Route and action preservation inventory

- Mechanically scanned all post-Task-3 `frontdoor/fd_*.js` renderers after removing comments.
  Every emitted `data-fd-*` attribute maps to one pinned controller meaning; planned Progress and
  Try-now actions are also reserved.
- Routed state gives `page`, `tool`, and `tab` URL values precedence over saved state. Existing
  rotations with no saved Front Door role use the first injected site role and skip setup.
- `data-fd-week` remains setup-only. `data-fd-view-week` changes only the Path preview and never
  writes rotation; setup/adopt writes use the existing local-Monday helper.
- Navigation, item preview sheets, and safety protocols remain distinct. Escape closes search,
  then sheet, then nudge; unread protocols receive an exactly 8-second nudge.
- Slash, command-K, digits, arrows, search Enter, typing suppression, Tab trapping, invoker
  capture, connected-focus restoration, live search input, auto-advance, week-end return, and
  `cw_theme` updates are covered.
- `cw_progress_v1` retains its legacy object shape and SRS seeding path. No unnamespaced storage
  key was introduced.
- Markdown uses `content/<slug>`, `marked.parse`, governance notice, and the Reader. Tools use the
  governed iframe suffix. `case`, `scenario`, `resume`, `reviewItem`, `reviewKey`, and
  `reviewToken` survive routing. Active faculty preview delegates wholesale to the existing
  governed `show` path; mismatches use the existing lock notice and do not load content.

## Changed files

- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`: pure state/dispatch/resource
  decisions plus the opt-in browser controller and governed resource adapter.
- `13_Faculty_Resources/_automation/site_build/common.py`: registers `FD_WIRE` last.
- `13_Faculty_Resources/_automation/site_build/spa_index.html`: adds the final inert marker after
  the other Front Door modules.
- `tests/parallel-ceilings.test.mjs`: atomically raises the snippet-marker ceiling to 16.
- `tests/fd-wire.test.mjs`, `tests/fd-resource.test.mjs`, and
  `tests/fd-action-contract.test.mjs`: routing, runtime, accessibility, query/governance, and
  mechanical action-contract coverage.
- This report.

## Self-review and concerns

- Confirmed the source is ES5-style and audience-neutral, and that the only literal storage keys
  are namespaced `cw_*` keys.
- Confirmed `fdWire` is never called by `spa_index.html`; the old `fetch('nav.json')` boot and
  `<aside id="side">` remain in place. There is no visual swap, retirement, or learner-visible
  behavior change in this task.
- Confirmed no generated `_build` file, media, clinical/crisis content, credential, or unrelated
  source is in the intended diff. Builds generated ignored artifacts only.
- `git diff --check` is clean.
- Residual risk is intentionally deferred: the controller is unit/integration tested but dormant,
  so the complete visual browser journey will only exist after Task 5 mounts it. That cutover
  should retain a one-commit rollback point and rerun the browser accessibility journey.

## Concrete next option

Proceed with Task 5's atomic body/render-boot swap after a fresh diff review, then exercise both
audience builds and browser journeys without changing the routing/governance contracts established
here.

## Potential innovative follow-up

Generate a small build-time action-contract receipt from rendered `data-fd-*` attributes and the
controller semantic table. Hashing that receipt per audience would make a newly emitted but
unwired action fail before cutover and give reviewers a one-line proof that both sites share the
same interaction vocabulary.
