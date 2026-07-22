# Structural CI Server Contract Design

**Date:** 2026-07-18
**Scope:** Replace the label-sensitive localhost-server assertion in the SP Interview CI contract.

## Problem

`_prototypes/sp-interview/tests/ci-build-contract.test.mjs` currently locates the smoke-test server step by searching for the human-readable label `Serve built sites on localhost`. Renaming that label caused CI to fail even though the workflow still started and checked every required server correctly. The contract is checking prose instead of behavior.

## Goals

- Verify the exact localhost surface mapping:
  - port `4200` serves `_build/ms3`;
  - port `4201` serves `_build/res`;
  - port `4202` serves `faculty-console`.
- Reject any additional active server command that competes for a required port.
- Verify the readiness loop checks the same three ports and fails closed inside each per-port iteration when any server is unavailable.
- Verify the Interview Room and faculty-console browser projects run only after server readiness.
- Keep the existing managed-SP gate ordering and `SP_INTERVIEW_BASE_URL` contract.
- Make workflow-step labels irrelevant to the test result.

## Non-goals

- Do not change application, server, build, or deployment behavior.
- Do not add a YAML parser or another dependency.
- Do not extract a shared server-startup script in this PR.
- Do not broaden the change into unrelated CI cleanup.

## Design

Add a small, dependency-free validator inside `ci-build-contract.test.mjs`. It accepts workflow text and checks exact executable lines in both single-line `run: <command>` steps and indentation-bounded block scalars rather than the step name. The narrow run-step reader recognizes `|`, `|-`, `|+`, `>`, `>-`, and `>+`, with or without the optional list-item dash before `run:`; it is not a general YAML or shell parser. Commented commands and prefix or suffix lookalikes do not count.

For each required port, the validator will require exactly one active `python3 -m http.server` invocation and require it to equal the approved command:

```text
python3 -m http.server 4200 --directory _build/ms3 &
python3 -m http.server 4201 --directory _build/res &
python3 -m http.server 4202 --directory faculty-console &
```

It will also require the outer readiness loop to enumerate `4200 4201 4202`, verify the nested bounded retry loop and its matching `done`, and require the fail-closed guard after the retry loop but before the matching outer `done`. The exact active `exit 1` must remain inside that guard, and the `Servers ready` marker must follow the completed outer loop. Both exact Playwright commands for `interview-room` and `faculty-console` must occur in later run blocks.

The existing test will call this validator on the real workflow. It will retain the current managed-SP/build ordering assertions and `SP_INTERVIEW_BASE_URL` assertion.

## Regression strategy

The test suite will prove the validator is label-independent and structurally strict:

- replacing the server-step label with arbitrary wording still passes;
- deleting any port-to-directory command fails;
- swapping a required directory fails;
- adding a competing active server mapping on a required port fails;
- omitting a port from the readiness loop fails;
- moving the fail-closed guard after the outer per-port loop fails;
- moving either browser project before readiness fails.

These mutations operate on an in-memory copy of the workflow and never change the checked-in workflow file.

## Error behavior

Each failed contract assertion will name the missing or misordered structural requirement. This keeps CI output actionable without coupling it to a step title.

## Verification

- Demonstrate a red test before implementing the validator.
- Run `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs`.
- Run `bash _prototypes/sp-interview/tests/run-all.sh` with locked `sp-proxy` dependencies installed.
- Run `node --test tests/*.test.mjs`.
- Confirm a clean diff check and push the resulting commits to PR #236.

## Acceptance criteria

- The contract no longer searches for `Serve built sites on localhost`.
- Exact one-owner-per-port mappings, nested readiness coverage, and fail-closed loop placement are enforced.
- Browser-check ordering remains enforced.
- An arbitrary future label-only edit cannot fail this contract.
- All targeted and broader local gates pass.
