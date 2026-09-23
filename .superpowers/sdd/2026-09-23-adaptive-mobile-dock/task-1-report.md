# Task 1 report — Pure dock model and shell markup

## Status

Implemented and verified. The shell now has a pure five-item dock model and an HTML renderer. The controller reserves a distinct meaning for the forward-action attribute so the repo-wide emitted-attribute contract remains green; click dispatch remains for Task 2.

In plain language, the model decides what the four fixed buttons say for standard and APP learners, then supplies either the current primary action or a Library browse button for the raised center slot. The renderer turns that decision into five buttons and escapes any supplied text before putting it into HTML.

## Files

- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js` — added `fdDockModel(state)` and `fdDock(state)` using ES5 syntax.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js` — reserved `data-fd-dock-forward` in the handled-attribute list with the unique semantic `forward contextual dock action`.
- `tests/fd-shell.test.mjs` — added standard/APP destinations, contextual fallback, five-button layout, and escaping coverage.
- `tests/fd-action-contract.test.mjs` — added the emitted dock attribute to the contract inventory.

## TDD evidence

Model and renderer RED:

```text
$ node --test tests/fd-shell.test.mjs
ReferenceError: fdDockModel is not defined
✖ tests/fd-shell.test.mjs
ℹ pass 0
ℹ fail 1
exit_code=1
```

After implementing the model and renderer, the focused file passed (25 tests). After adding the five-button and escaping assertion, it passed again (26 tests).

Controller vocabulary RED:

```text
$ node --test tests/fd-action-contract.test.mjs
✖ every data-fd attribute emitted after Task 3 has one controller meaning
AssertionError: data-fd-dock-forward is emitted but unhandled
ℹ pass 8
ℹ fail 1
exit_code=1
```

After reserving the attribute and its semantic, focused tests passed:

```text
$ node --test tests/fd-shell.test.mjs tests/fd-action-contract.test.mjs
ℹ tests 35
ℹ pass 35
ℹ fail 0
exit_code=0
```

Full root Node suite:

```text
$ node --test tests/*.test.mjs
ℹ tests 2502
ℹ pass 2485
ℹ fail 0
ℹ skipped 17
exit_code=0
```

The 17 skipped checks require built `_build/ms3` / `_build/res` artifacts, which are absent in this worktree. `git diff --check` passed.

## Self-review

- The model follows the requested four item destinations and standard/APP labels. APP maps its structural slot to Library and never emits a Path destination.
- The center slot follows the two leading destinations and uses `data-fd-dock-forward` only when both a dock action and its `sourceId` are supplied; otherwise it offers the Library browse fallback.
- All interpolated item and context labels/values pass through `fdEsc`.
- The navigation landmark has the requested accessible name, and every slot renders as a button.
- Existing `fdAppMode` logic is reused, preserving its support for APP invitation and role state.
- The controller vocabulary change only records the attribute and its unique semantic. No selector or dispatch branch was added.

## Concerns and next option

The dock is not mounted yet, and `data-fd-dock-forward` has no click-dispatch behavior yet; this is the planned Task 2 seam. The concrete next option is to mark the learner-facing primary actions with stable source IDs and wire forwarding. A possible later improvement is to make the contextual slot retain its chosen action through transient rerenders, provided that does not persist or replace the current dock-action contract.

## Sequencing note

The first full-suite run found that the emitted-attribute inventory rejected the new forward hook before Task 2 could add dispatch. The parent task owner ruled that Task 1 should reserve the emitted attribute and its unique controller meaning now, while leaving selector/dispatch/forwarding behavior to Task 2. The inventory and vocabulary were updated accordingly, and the final full suite is green.

## Review fix — class inventory (round 1)

Updated `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` with the dock's known
markup hierarchy, accessible nav label, button roles, standard/APP destination labels, and center
action fallback. The three dock classes are marked as having no stylesheet rule yet. The entry
explicitly leaves responsive visibility, geometry, and interactive styling unspecified for later
tasks.

Changed files:

- `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- `.superpowers/sdd/2026-09-23-adaptive-mobile-dock/task-1-report.md`

Verification:

```text
$ node --test tests/fd-shell.test.mjs tests/fd-action-contract.test.mjs
ℹ tests 35
ℹ pass 35
ℹ fail 0
exit_code=0

$ git diff --check
(no output)
exit_code=0
```
