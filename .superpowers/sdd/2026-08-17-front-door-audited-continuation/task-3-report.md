# Task 3 report — reader type and overlay semantics

## RED evidence

Before production changes, ran:

```bash
node --test tests/fd-tokens.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-search.test.mjs tests/fd-sheet.test.mjs
```

Result: 123 passed, 6 failed for the intended missing contracts: reader completion suffix,
labelled search dialog, labelled sheet/dialog controls, compact named theme toggle, reader body
typography, and portal-safe focus styling. A follow-up focused RED confirmed the renamed nudge
dismiss label before its final implementation.

## GREEN evidence

```bash
node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-search.test.mjs tests/fd-sheet.test.mjs
# 132 passed, 0 failed

node --test tests/*.test.mjs
# first sandbox run: 968 passed; 8 launcher cases failed only with listen EPERM on 127.0.0.1
# loopback-enabled rerun: 976 passed, 0 failed

git diff --check
# clean
```

## Changed files

- `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js`
- `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- `tests/fd-tokens.test.mjs`
- `tests/fd-reader.test.mjs`
- `tests/fd-shell.test.mjs`
- `tests/fd-search.test.mjs`
- `tests/fd-sheet.test.mjs`
- `.superpowers/sdd/2026-08-17-front-door-audited-continuation/task-3-report.md`

## Plain outcome

Long-form reader content is now legible and consistently styled. Search and sheet overlays declare
their dialog semantics, icon-only controls have names, and done reader-navigation rows announce
`Completed` without pretending to be toggles. The old shell remains live and inactive.

## Concerns

The approved Clinical Warm palette was not changed. Its 11 allowlisted light-mode contrast debts
remain; this task does not claim WCAG AA conformance. Dialog focus trapping, focus restoration,
and theme-state wiring remain controller work for Task 4.

## Next option

Proceed with Task 4's delegated controller so these pre-wired actions receive focus lifecycle,
keyboard, routing, and persisted-theme behavior.

## Innovative follow-up

Once the controller exists, add a small development-only accessibility contract harness that opens
each overlay and verifies its computed accessible name, focus containment, and focus return in one
browser journey.
