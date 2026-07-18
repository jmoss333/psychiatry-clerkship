# Tested Smoke-Server Launcher Design

**Date:** 2026-07-18
**Status:** Approved 2026-07-18
**Scope:** Replace the inline CI server-startup and readiness shell with one directly tested launcher used automatically by CI and optionally by local developers.

## Context

The smoke-test job currently starts three Python HTTP servers and polls their ports inside `.github/workflows/ci.yml`. A structural contract test then interprets that YAML to verify port mappings, readiness-loop nesting, failure behavior, and browser-test ordering.

That contract is safer than matching a human-readable workflow label, but it duplicates the operational logic: the workflow contains the behavior while the test reconstructs what the behavior means. A directly tested launcher makes the executable script the source of truth and lets the workflow contract focus only on invocation and ordering.

## Goals

- Start the three required static review surfaces with these default mappings:
  - port `4200` serves `_build/ms3`;
  - port `4201` serves `_build/res`;
  - port `4202` serves `faculty-console`.
- Wait until every server is alive and accepting HTTP requests.
- Fail closed if prerequisites, startup, liveness, or readiness checks fail.
- Stop every process started by the launcher when startup fails.
- Leave successful servers running for the existing Playwright steps.
- Run automatically in GitHub CI without requiring a manual faculty action.
- Support optional, conflict-free local testing through environment overrides.
- Test the launcher by executing it against real temporary static sites.
- Reduce the CI contract to launcher invocation, ordering, and absence of duplicate inline startup logic.

## Non-goals

- Do not run Playwright from the launcher.
- Do not change any browser-test project, build command, deployment setting, application, curriculum content, or serverless function.
- Do not add a YAML parser, shell framework, process supervisor, or third-party dependency.
- Do not create a persistent local development server manager.
- Do not emit or upload a JSON readiness artifact in this increment.

## Chosen approach

Add a dependency-free Bash launcher at:

```text
tests/smoke/start-local-servers.sh
```

CI will call it from the repository root:

```bash
bash tests/smoke/start-local-servers.sh
```

The script owns startup, process tracking, readiness polling, diagnostics, and failure cleanup. It exits successfully after all three servers are ready, leaving them alive for subsequent workflow steps.

This keeps the existing smoke-test sequence intact while moving executable behavior out of YAML and into a unit that can be run and tested directly.

## Launcher interface

### Default configuration

| Surface | Port variable | Default port | Directory variable | Default directory |
|---|---|---:|---|---|
| MS3 site | `SMOKE_MS3_PORT` | `4200` | `SMOKE_MS3_DIR` | `_build/ms3` |
| Resident site | `SMOKE_RES_PORT` | `4201` | `SMOKE_RES_DIR` | `_build/res` |
| Faculty console | `SMOKE_FACULTY_PORT` | `4202` | `SMOKE_FACULTY_DIR` | `faculty-console` |

CI will use the defaults. Local tests may override ports and directories without changing the production contract.

Directory overrides may be absolute or repository-root-relative. Relative paths are resolved from the repository root, regardless of the caller's original working directory.

Additional bounded controls:

- `SMOKE_READY_ATTEMPTS`, default `15`;
- `SMOKE_READY_DELAY_SECONDS`, default `1`;
- `SMOKE_READY_PATH`, default `/`;
- `SMOKE_SERVER_STATE_DIR`, optional caller-owned directory for PID and log files.

If no state directory is supplied, the launcher creates a unique temporary directory. If one is supplied, the launcher creates it when absent and refuses to overwrite an existing PID manifest.

All port values must be distinct integers from 1 through 65535. Attempt and delay values must be nonnegative numeric values, with at least one readiness attempt.

### Commands and output

Normal invocation starts and verifies the servers.

`--print-config` prints the resolved surface, port, and directory mappings and exits without starting a process. Direct tests use this to prove the default CI contract without occupying ports.

On success, the launcher prints stable diagnostic lines containing:

- the state-directory path;
- the three process IDs;
- a final `Servers ready` message.

The state directory contains one log per server and a PID manifest. This gives tests a deterministic cleanup mechanism and gives local users an explicit record of what was started. The launcher also prints a ready-to-copy `kill` command for optional local cleanup.

## Startup and failure behavior

The launcher uses strict Bash error handling and performs work in this order:

1. Confirm it is running from a repository root containing the three configured directories.
2. Confirm `python3` and `curl` are available.
3. Validate port, retry, delay, path, and state-directory inputs.
4. Confirm the configured ports are distinct and not already occupied on loopback.
5. Create or validate the state directory and initialize empty process tracking.
6. Start one `python3 -m http.server` process per surface, bound to `127.0.0.1`, with output redirected to its own log.
7. Capture each process ID immediately.
8. For each surface, repeatedly verify both process liveness and `curl -fsS` readiness at its configured URL.
9. Write the PID manifest and print success diagnostics only after all three surfaces are ready.

An exit, interrupt, missing prerequisite, dead child process, occupied port, or readiness timeout before success triggers one cleanup path. That path terminates every process already started by the launcher, waits for termination, prints relevant server logs, and exits nonzero.

After success, the cleanup trap is disabled so the servers remain available to later Playwright workflow steps. GitHub-hosted runner cleanup owns final job teardown. Local users can stop the printed process IDs when finished.

## CI integration

The smoke job keeps its current build and Playwright-install steps. The inline block that starts three Python servers and polls their readiness is replaced with one step:

```yaml
- name: Start local review servers
  run: bash tests/smoke/start-local-servers.sh
```

The navigation, Interview Room, faculty-console, LFS, and visual Playwright steps remain unchanged. `SP_INTERVIEW_BASE_URL` remains `http://localhost:4200/tools/`.

No environment override is set in CI, so the launcher defaults are the deployed contract.

## Test design

### Direct launcher tests

Add `tests/smoke-server-launcher.test.mjs`, which is included by the existing root command:

```bash
node --test tests/*.test.mjs
```

The tests use temporary directories containing distinct marker `index.html` files and dynamically allocated loopback ports. They execute the real Bash launcher and verify:

- `--print-config` reports exactly the default 4200/MS3, 4201/resident, and 4202/faculty mappings;
- a successful launch serves the correct marker content from all three configured URLs;
- the success output and PID manifest identify three live processes;
- missing directories fail before startup;
- invalid (including overflow-sized), duplicate, or occupied ports fail closed;
- a child process that exits during startup is detected;
- an unreachable readiness path times out using shortened test-only retry settings;
- a termination signal during startup triggers the same complete cleanup path;
- partial failures terminate every process started by the launcher;
- test cleanup always terminates successful test servers and removes temporary artifacts.

The tests may place a controlled `python3` wrapper earlier in `PATH` to simulate child death while delegating normal Python operations to the real interpreter. This is test-only dependency injection; the launcher retains its ordinary `python3` interface.

### CI contract tests

Refactor `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` so server-specific assertions verify only that:

- the workflow invokes `bash tests/smoke/start-local-servers.sh` exactly once;
- the invocation follows both site builds and Playwright installation;
- the Interview Room and faculty-console projects occur after the launcher invocation;
- `SP_INTERVIEW_BASE_URL` remains correct;
- CI does not override any launcher port, directory, readiness, or state variable;
- no active inline `python3 -m http.server` command remains in the workflow;
- relabeling the workflow step cannot affect the result.

The direct launcher tests own mappings, loop nesting, readiness behavior, cleanup, and alternate local ports. The CI contract no longer reconstructs those internals from YAML.

### Documentation

Update `tests/smoke/README.md` with:

- the optional local launcher command;
- the default URLs;
- an override example using conflict-free ports;
- how to stop the process IDs printed by the launcher.

## Files in scope

- Add `tests/smoke/start-local-servers.sh`.
- Add `tests/smoke-server-launcher.test.mjs`.
- Modify `.github/workflows/ci.yml`.
- Modify `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`.
- Modify `tests/smoke/README.md`.
- Add the implementation plan under `docs/superpowers/plans/` after this design is approved.

## Security and curriculum safety

- Servers bind only to `127.0.0.1`; they are not exposed to the network.
- The launcher serves existing generated/static directories read-only through Python's HTTP server behavior.
- No credentials, API keys, PHI, faculty attestations, learner state, or curriculum content are created or modified.
- Environment overrides affect only local smoke-server process configuration.

## Acceptance criteria

- CI starts all three review surfaces by invoking the launcher automatically.
- Default port-to-directory mappings remain 4200/MS3, 4201/resident, and 4202/faculty console.
- All three surfaces must be live before Playwright begins.
- Startup failures stop partial processes and make CI fail.
- Successful startup leaves the servers alive for later workflow steps.
- The launcher works with temporary local ports and directories.
- The direct launcher tests cover success, configuration, occupied ports, child death, signal handling, timeout, and cleanup.
- The CI workflow contains no duplicate inline server-startup/readiness implementation.
- Existing root, managed-proxy, Interview Room, attestation, site-build, and browser-smoke gates pass.

## Future innovative extension

A later increment could emit a small JSON readiness report containing each surface, URL, PID, startup duration, and final state. CI could upload that artifact on failure to make server-startup diagnosis immediate. It is intentionally excluded from this implementation.
