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

---

## Review remediation — 2026-08-17

Status: COMPLETE

### Plain outcome

The dormant controller is now hardened for the later cutover. Faculty preview rejects prohibited
actions before they can change state or storage; pages and tools mount only after the fresh
destination exists; late page responses cannot replace a newer route; browser Back and Forward
restore meaningful state; search and nested dialogs retain correct keyboard focus; and markdown
gets one owned page title. The currently visible legacy shell is still the only active shell.

### Genuine RED evidence

Starting from clean review HEAD `162b93ebaa2e379460bd0b17dadb28e65a670678`, the regression tests
were written before the production fixes. The first focused run produced 27 passes and 9 intended
failures:

- duplicate markdown title (`2 !== 1`);
- late markdown response returned true and overwrote the new route;
- replacement search input did not regain focus/caret;
- nested overlay close did not restore the original opener;
- resource effect received the old/undefined host before render;
- Escape in a focused search input did not close search;
- preview actions changed state/rendered before the lock;
- no initial `history.replaceState` snapshot existed; and
- Progress popstate used the generic resource path.

Exact command:

```bash
node --test tests/fd-wire.test.mjs tests/fd-resource.test.mjs
# RED: 27 passed, 9 failed
```

During exact legacy comparison, one more regression was added before its production adjustment:

```bash
node --test --test-name-pattern="faculty preview popstate|faculty preview rejects" \
  tests/fd-wire.test.mjs
# RED: 1 passed, 1 failed — same exact-revision popstate incorrectly showed the lock
```

That comparison resolved the only apparent policy ambiguity: theme remains allowed during faculty
preview, and a same exact-revision popstate remains allowed. Tab/resource/search/safety/Home and
global navigation shortcuts remain locked before mutation. A popstate that leaves the pinned
revision uses the existing lock path.

### Per-finding GREEN evidence

1. **Preview lock:** a table-driven controller test covers tab, resource open, search, safety,
   Home, Arrow, digit, and slash actions. It asserts unchanged state, render, route, resource, and
   storage; it separately pins the allowed `cw_theme` toggle and exact-revision popstate behavior.
2. **Lifecycle/currentness:** tool mounting records `render` before resource open and verifies the
   fresh `#content` host. Deferred markdown resolves stale and returns false without replacing the
   new host. Progress click and popstate use the internal Progress adapter only.
3. **History:** an in-memory history test verifies initialization with `replaceState`, meaningful
   snapshots, preserved `case=c1`, no duplicate Today push, and Today -> page -> Today across Back
   and Forward with stale `openId` cleared.
4. **Live search:** a real replacement-node harness types multiple characters and proves the new
   input regains focus and the exact selection range after each whole-shell render.
5. **Escape:** focused search-input Escape closes search before typing-control shortcut suppression;
   the global digit/arrow/slash suppression contract remains green.
6. **Nested focus:** search -> preview and Kit <-> protocol replace DOM nodes, focus each new
   dialog, skip disconnected nested nodes, and restore the stable connected root opener only on
   final close.
7. **Headings:** real `# Source Heading` markdown produces only the Reader/manifest H1 while
   retaining the introduction, later H2, and body.

Focused final verification:

```bash
node --test tests/fd-wire.test.mjs tests/fd-resource.test.mjs \
  tests/fd-action-contract.test.mjs tests/parallel-ceilings.test.mjs
# 44 passed, 0 failed

node --check 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js
# passed

python3 13_Faculty_Resources/_automation/site_build/test_common.py
# 53 passed, 0 failed
```

The sandboxed full root suite first reproduced the approved baseline limitation: 1,011 passed and
8 localhost launcher tests failed with loopback `EPERM`. The authorized loopback rerun passed.
After the final exact-preview adjustment, the definitive root result was 1,020/1,020.

Sequential publication gates were rerun after all production changes:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- MS3: PASS, static QA hard failures 0, LFS preflight 105 media files/no pointer stubs.
- Resident: PASS, static QA hard failures 0, LFS preflight 105 media files/no pointer stubs.
- The existing metadata/computed-key notices remain soft baseline advisories.

### Exact review-fix files

- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- `tests/fd-resource.test.mjs`
- `tests/fd-wire.test.mjs`
- `.superpowers/sdd/2026-08-17-front-door-audited-continuation/task-4-report.md`

No Task 5 shell, activation call, marker/ceiling, palette, `_build` output, media, clinical/crisis
content, or unrelated source is part of this fix. Listener destruction, ES5 style,
audience-neutral logic, namespaced storage, governed preview/resource helpers, and the live legacy
boot remain pinned by tests.

### Residual risk and next option

Residual risk remains the intentional Task 4 boundary: the controller is still dormant, so its
complete browser journey cannot run against the production shell until Task 5 atomically mounts
it. The concrete next best option is an independent review of this fix commit, followed by Task 5
as a separate rollback-sized commit with both audience browser journeys.

An innovative follow-up would add a deterministic navigation-generation trace in non-production
browser tests. By deliberately resolving page fetches in shuffled order, it could continuously
prove that only the latest route may write the Reader host as future resource types are added.
