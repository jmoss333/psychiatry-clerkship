# Task 6 report — shell safety surfaces and accessibility contracts

Status: COMPLETE — owner-approved copy integrated; all required verification gates are green

## Outcome in plain language

The Front Door shell now has one build-controlled crisis-resource insertion point, and either a
missing or duplicate insertion point stops the build. Safety protocols now distinguish reviewed,
pending review, and missing/malformed data instead of letting absent data look like a normal empty
protocol. The owner-approved missing-protocol sentence is defined once by the controlled browser
global, passed through live shell state, and escaped by the renderer. Dialog semantics, nested
keyboard behavior, and mobile 44px controls are pinned by tests. Crisis contact values still come
only from `crisis_resources.json` through `crisis_block.py`.

## Starting state and genuine RED

- Verified starting HEAD: `878bf39bdbdd691953c18d04b9ed40e86d99e19b`.
- Before production edits:

  ```bash
  node --test tests/crisis-block.test.mjs tests/fd-sheet.test.mjs tests/spa-shell-a11y.test.mjs
  # 57 tests: 47 passed, 10 failed
  ```

- The failures proved the absent shell marker/injection and strict marker-count checks, no explicit
  pending-review state, missing data rendering as a normal empty protocol, no required
  owner-controlled failure input, and incomplete mobile target coverage.
- One test-only contact-token extraction defect was corrected before production work; it had
  treated an incidental single digit as a crisis contact. The final scan derives canonical
  `contact` and `alsoAvailable` signatures and formatting variants from the data, without spelling
  any contact value in the test.
- On 2026-08-17, the repo owner supplied and approved the exact audience-neutral missing-protocol
  sentence recorded in the Task 6 brief. Before wiring that copy into production, a live-boundary
  test exercised controlled browser global → `fdLiveState` → malformed protocol renderer and
  failed solely because the global did not yet exist:

  ```bash
  node --test tests/fd-sheet.test.mjs
  # 40 tests: 39 passed, 1 failed
  # failure: controlled browser global absent
  ```

## Mechanical implementation

- Added exactly one inert shell `<!-- crisis-block-html -->` marker inside a `<template>`.
- Added `crisis_block.inject_required_html_file`, used after shared snippets are injected. The
  helper requires exactly one marker, expands it from canonical data, rejects any unexpanded
  marker, and aborts on zero or duplicates. Final MS3 and post-rebrand resident marker assertions
  run before each page-contract/static-QA boundary.
- Passed the rendered crisis block from the inert template into protocol state. No crisis value is
  duplicated in shell source or tests.
- Added a strict protocol classifier:
  - reviewed requires reviewed state plus 3–5 non-empty steps and documentation;
  - pending requires non-reviewed state plus 3–5 non-empty steps and documentation;
  - absent, empty, malformed, wrong-length, or partially missing data takes only the failure branch.
- The failure branch escapes the one owner-approved shell constant, omits normal protocol steps,
  documentation, review labels, and the full-page action, and retains the canonical crisis block.
  It still throws if that controlled input is absent; no fallback or second production copy exists.
- Preserved the existing labelled modal dialogs and Task 5 controller behavior. Added regression
  coverage for search-first nested Escape order, trapping before Escape, final-overlay focus
  restoration, and 44px mobile primary/navigation/dialog targets.
- Added only two semantic classes, `.fd-sheet__pending` and `.fd-sheet__failure`, using existing
  palette tokens. The class inventory is synchronized at 198 distinct `fd-*` selectors.

`crisis_block.py` is one implementation file beyond the brief's enumerated list. The strict helper
belongs there so both rendering and required-marker enforcement share the canonical crisis module;
the audience build scripts invoke those contracts at their final shell boundaries.

## GREEN evidence

Focused Task 6 suite after implementation and final documentation review:

```bash
node --test tests/crisis-block.test.mjs tests/fd-sheet.test.mjs tests/fd-wire.test.mjs tests/spa-shell-a11y.test.mjs
# 110 passed, 0 failed

node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs
# 15 passed, 0 failed; 11 accepted inherited light debts, 0 dark exceptions
```

Authorized full root run (loopback tests require permission in this sandbox):

```bash
node --test tests/*.test.mjs
# 1053 passed, 0 failed
```

The ordinary sandbox run produced only the known eight `listen EPERM` launcher failures; the same
suite passed 1053/1053 with loopback permission.

Sequential publication gates:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- MS3: PASS; shell marker expanded, 81 placed refs, static QA hard failures 0, full LFS gate 105
  media files with no pointer stubs, and `build_and_check: ms3 OK`.
- Resident: PASS; shell marker expanded, 90 placed refs, static QA hard failures 0, full LFS gate
  105 media files with no pointer stubs, and `build_and_check: res OK`.
- Source marker count is one; both generated indices have zero unexpanded markers and one inert
  crisis template. Source and both generated indices contain exactly one failure-copy definition,
  each matching the owner-approved byte hash. Generated output is ignored and was not hand-edited.
- `git diff --check`: PASS.

## Independent-review remediation

The first mechanical review was not approved and identified four gaps. A second production RED
was captured at 105/109 before remediation:

1. Reviewed and pending protocols with 1, 2, or more than 5 steps could render normally; reviewed
   malformed data could receive the faculty-attested line.
2. Strict shell expansion ran before shared snippets and the tests bypassed that ordering, so a
   late marker was not proven impossible in either final audience artifact.
3. The contact-source guard did not scan `alsoAvailable`, formatting variants, or every Front Door
   module that can feed a safety surface.
4. Nested sheet/search behavior was pinned structurally but lacked an executable end-to-end
   controller harness.

The final focused suite proves 3–5-step cardinality for both review states; real shared-pass
ordering for clean, zero, duplicate, MS3-late, and resident-late markers; data-derived contact and
alternate-contact formatting variants across every Front Door module; and the exact sheet →
Command-K search → first Escape/refocus sheet → second Escape/one invoker restore sequence. The
full root and both sequential builds were rerun after these fixes.

## Frozen palette and boundaries

No palette value changed, and this report makes no WCAG-AA claim. `fd-contrast` remains green with
the exact 11 accepted light-mode design debts and zero dark-mode exceptions.

No clinical fact, faculty review state, crisis-resource record, media/LFS object, credential, PHI,
generated `_build` output, or unrelated file was edited. Task 5's runtime focus, capture, preview,
storage, and routing contracts remain green. Nothing was pushed, merged, or deployed.

## Owner approval and residual risk

The previously missing owner input is resolved: the exact audience-neutral sentence was supplied
verbatim in the Task 6 brief and integrated without paraphrase. An executable boundary test pins
the production text by SHA-256 without introducing a second learner-visible copy, proves it flows
through live state, and confirms build-rendered canonical crisis resources remain present.

There is no open Task 6 blocker. The 11 inherited light-palette contrast debts remain explicitly
accepted baseline debt; Task 6 neither changes those colors nor claims they meet AA. Static QA also
continues to report the pre-existing soft warnings documented by each build, with zero hard
failures.

## Concrete next best option

Begin Task 7 from the committed Task 6 boundary, first reading its brief and reproducing its RED
contracts. Keep any palette-debt remediation separate so the safety-surface commit and its exact
owner-approved copy remain independently auditable.

## Potential innovative follow-up

Generate a small build receipt for each audience containing only marker count, canonical crisis
resource-data hash, and protocol-state contract version. Static QA could compare the receipts and
catch future shell/data drift without copying or exposing any contact text.
