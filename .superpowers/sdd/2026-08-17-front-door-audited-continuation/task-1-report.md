# Task 1 — schema, safety-kit, completion, date, and event contracts

Status: COMPLETE

## Outcome in plain language

The Front Door now reads old saved progress safely and writes it back in the format the existing
site understands. Its week-selection buttons now have a distinct meaning from setup buttons, and
the exam fallback handles older non-Monday rotation dates. The curriculum registry also fails the
build if the reviewed five-protocol safety kit loses required evidence, review, documentation, or
step safeguards.

## RED evidence

Before production changes, the following command was run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
node --test tests/fd-progress-compat.test.mjs tests/fd-state.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
```

Observed failures were the intended missing contracts:

- 12 new SafetyKit negative controls were accepted (for example wrong count, duplicate/current-ref
  membership, safety level, evidence, steps, documentation, and review status).
- The schema runner reported only the previous six registries; `curriculum.json` was absent.
- New JS tests failed because `fdProgressDoneMap`, `fdProgressToggle`, and
  `fdRotationStartForWeek` did not exist; Path still emitted `data-fd-week`; Continue preview did
  the same.

## GREEN verification

Focused green run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_curriculum.py
node --test tests/fd-progress-compat.test.mjs tests/fd-state.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
```

Result: 39 curriculum tests passed; 21 registry-schema tests passed; all seven root registries
validated; curriculum reported `6 weeks, 40 week items, 81 pages placed, 18 excluded`; and 74
focused Node tests passed.

Full root regression:

```bash
node --test tests/*.test.mjs
```

The sandbox attempt had 958 passes plus eight known `listen EPERM` smoke-server-launcher failures.
The same command with approved localhost permission passed 966/966 tests, 0 failures.

## Changed files

- `curriculum.schema.json` and `validate_registry_schemas.py`: curriculum is the seventh schema
  pair, and its root rejects unknown properties.
- `validate_curriculum.py`: optional fixture paths for `topic_meta.json` and
  `evidence_registry.json`; exact current five kit refs; unique/high/reviewed/evidence/steps/doc
  checks with all violations collected.
- Schema and curriculum tests: regression cases for root/schema fields and every independently
  required safety-kit failure.
- `fd_state.js`: legacy progress projection/toggle functions, local-Monday rotation-start
  derivation, and non-Monday start-date countdown fallback.
- `fd_today.js` and `fd_path.js`: strict boolean completion reads and `data-fd-view-week` for
  browsing/preview actions.
- Front Door tests: legacy compatibility, date fallback, Path/preview attribute split.

## Self-review

- Checked whitespace with `git diff --check` before the LFS metadata scan. No diff whitespace
  errors were reported.
- Confirmed the changed Front Door snippets remain ES5-only (`var`/functions; no `let`, `const`,
  or arrows) and contain no generated `_build` edits.
- Confirmed the stored exam date remains first priority and that `cw_progress_v1` writes preserve
  `{done:true, at:YYYY-MM-DD}` rather than booleans.
- Corrected one stale comment that described the old `data-fd-week` preview contract.
- The broad Git status/diff metadata scan encounters the known sandbox Git-LFS temporary-object
  permission failure for pre-existing audio pointers. Targeted tests and the approved full Node
  suite were unaffected; no media files were touched.

## Concrete next option

Proceed with Task 2, which can now project the hardened curriculum contract into the per-site
payload without changing the live shell.

## Potential innovative follow-up

Add a small build-time report that prints each safety-kit protocol's evidence ID and review date
next to this validator's pass line, giving faculty a readable release receipt without duplicating
clinical content.

## Round 1 review follow-up

Finding: two remaining validator descriptions still said "six" after curriculum became the
seventh registry/schema pair.

Fix: updated the `validate_root()` docstring and `--root` help text to say "seven".

Evidence: `python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py` passed
21/21 tests after the wording-only correction.
