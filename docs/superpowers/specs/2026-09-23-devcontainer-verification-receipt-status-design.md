# Dev Container Verification Receipt and VS Code Status Design

**Date:** 2026-09-23  
**Status:** Proposed for implementation  
**Scope:** Development tooling only; no clinical content, deployment configuration, credentials, or production behavior

## Purpose

Give a developer one deliberate VS Code action that proves the current repository revision in the supported Dev Container and leaves a small, machine-readable record of what was proved. Surface that record in VS Code without allowing an old success to look current.

The feature is evidence, not an automatic assertion that the repository is healthy. Container creation continues to run only the fast bootstrap/runtime checks. The several-minute full gate remains an explicit action.

## User experience

Inside the Dev Container, VS Code exposes a task named **Verify Dev Container**. Running it refreshes container-native dependencies, executes `bash bin/verify-devcontainer.sh`, and records the attempt.

A status-bar item shows one of three states:

| State | Meaning | Display |
|---|---|---|
| Verified | The latest receipt passed, names the current `HEAD`, and the tracked tree is unchanged | Green check and short commit |
| Failed | The latest receipt failed while testing the current `HEAD` | Red error and short commit |
| Stale | No receipt exists, the receipt names another commit, or tracked files changed after the attempt | Gray clock and concise reason |

Clicking the item runs **Verify Dev Container**. Its tooltip gives the receipt path, recorded time, runtime versions, and the reason for any failed or stale state. It never claims that skipped deploy-only LFS coverage, deployment, provider behavior, clinical correctness, faculty approval, or native accessibility was proved.

## Chosen architecture

### 1. One verifier owns attempt receipts

`bin/verify-devcontainer.sh` remains the authoritative composition of the runtime contract, full repository gate, and nonvisual Playwright smoke suite. It gains a receipt option used by the VS Code task.

Before the authoritative checks, the task refreshes each locked dependency lane inside Linux so a host-side `npm install` cannot leave macOS native binaries such as `esbuild` in the mounted workspace. The refresh uses the existing lockfiles and bootstrap commands; it does not update dependencies.

The receipt writer records both outcomes:

- success only after the runtime contract, `bin/verify.sh`, and nonvisual smoke suite all exit zero;
- failure from an error trap, including the current stage and exit code;
- atomic replacement so readers never observe partial JSON.

The receipt is written beneath ignored `output/devcontainer/`. A new attempt first records an in-progress state or removes the previous current-attempt result so an interrupted run cannot leave a prior green result looking current. An interrupted or terminated attempt resolves to stale, never verified.

### 2. Receipt schema

The versioned JSON record contains no learner, patient, clinical, credential, environment-variable, path, or command-output data.

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "commit": "40-character Git object ID",
  "startedAt": "UTC ISO-8601 timestamp",
  "completedAt": "UTC ISO-8601 timestamp",
  "stage": "complete",
  "exitCode": 0,
  "runtimes": {
    "node": "v22.x.x",
    "python": "Python 3.11.x",
    "bash": "5.x.x",
    "playwright": "1.63.0"
  },
  "proof": {
    "runtimeContract": "passed",
    "fullGate": "passed",
    "nonvisualSmoke": "passed",
    "deployLfsBrowserCoverage": "not-proved-without-deploy-url"
  }
}
```

Failed receipts use `status: "failed"`, retain the tested commit and runtime data, name the failed stage, and store the nonzero exit code. They do not copy test output. In-progress records use `status: "running"`; the status evaluator renders them gray.

### 3. One status evaluator defines freshness

A small Node command reads the receipt and derives a normalized status object. Both tests and the VS Code extension consume this command, so color semantics do not drift into two implementations.

Evaluation order is fail-closed:

1. Unreadable, malformed, unsupported-schema, missing, or `running` receipt: stale/gray.
2. Receipt commit differs from `git rev-parse HEAD`: stale/gray, regardless of recorded outcome.
3. Tracked worktree or index differs from `HEAD`: stale/gray, regardless of recorded outcome.
4. Current clean commit with `status: failed`: failed/red.
5. Current clean commit with complete passed proof fields: verified/green.
6. Any unknown combination: stale/gray.

Untracked and ignored files do not by themselves make the receipt stale because dependency directories, builds, smoke artifacts, private research returns, and the receipt itself are intentionally untracked. They may still make a verification attempt fail; a pass describes the actual attempted environment.

### 4. Repository-owned Dev Container extension

A minimal JavaScript VS Code extension is stored with the Dev Container tooling. It:

- activates only for this workspace inside the Dev Container;
- invokes the status evaluator without a shell and parses its bounded JSON output;
- uses VS Code theme colors for green, gray, and red rather than hard-coded palette values;
- refreshes when the receipt changes, when the window regains focus, and on a low-frequency timer so a commit or tracked edit cannot leave green visible indefinitely;
- opens the named task when clicked;
- exposes no network, webview, terminal-text parsing, credential, or repository-write capability.

The extension is packaged reproducibly during the container image build using a pinned packaging tool and installed locally during container setup. It is not published to or downloaded from the VS Code Marketplace at runtime. Failure to install the extension fails setup visibly; it does not affect repository builds or production sites.

### 5. VS Code task

`.vscode/tasks.json` defines exactly one repository task for this feature:

- label: `Verify Dev Container`;
- shell command: the receipt-enabled Dev Container verifier;
- group: test, default test task;
- presentation: dedicated, revealed terminal output;
- no `runOn: folderOpen` or equivalent automatic execution.

The verifier already refuses to run outside the container through `CLERKSHIP_DEVCONTAINER=1`. The task therefore cannot create a misleading host-Mac receipt.

## Known gate findings and boundaries

The first real Dev Container run on 2026-09-23 exposed four environmental/repository conditions:

- mounted host `node_modules` contained macOS `esbuild`; a Linux `npm ci` repaired both affected suites;
- the theme-boot census walked ignored `.worktrees/` and treated old worktree copies as current source;
- the primary checkout held an incomplete private research-return directory;
- an independent smoke run passed 66 tests, skipped two deploy-only LFS checks, and failed two browser cases.

This feature must not manufacture green around those conditions. Dependency refresh and excluding repository-management directories from the source census are in scope because they are deterministic Dev Container isolation defects. The private missing research return is not reconstructed or hidden; it remains a local red gate until its owner restores or deliberately resolves it. Browser failures remain red unless a reproducible defect is independently fixed.

## Testing strategy

Implementation follows red-green TDD.

1. Receipt tests prove passed, failed, running, malformed, unsupported, old-commit, and dirty-tracked-tree behavior.
2. Shell integration tests run the verifier against controlled fake gates and prove:
   - every stage must pass before a green receipt;
   - the failing stage and exit code are recorded;
   - a terminated/incomplete run cannot retain a green receipt;
   - receipt replacement is valid JSON and atomic.
3. Task contract tests pin the exact label, container-only command, manual execution, and receipt location.
4. Extension unit tests pin state-to-label/color/tooltip mappings and fail-closed handling.
5. Container contract tests pin local extension packaging and installation without secret or host-control mounts.
6. The final proof rebuilds/reopens the Dev Container, runs **Verify Dev Container**, compares the receipt commit with `HEAD`, and observes the status-bar transitions for current, stale, and failed fixtures.

The final report separates a successfully implemented evidence mechanism from the repository gate result. A red real run is a working status system with a failing repository, not a green verification.

## Security and privacy

- No PHI, psychiatric disclosures, learner data, clinical prose, prompts, logs, or free text enter the receipt.
- No secrets or environment values are serialized.
- The extension has no network client and invokes fixed executable/argument arrays, never interpolated shell input.
- The task does not run automatically on folder open.
- The extension is repository-owned and container-local; no new Marketplace plugin is trusted.
- The existing warning that VS Code may forward host Git/SSH credentials remains unchanged.

## Acceptance criteria

- **Verify Dev Container** is visible only in the intended workspace and remains manually invoked.
- A passing full run creates a schema-valid receipt for the exact clean tracked commit.
- A failed current-commit attempt is red and cannot leave an earlier green result visible.
- Changing `HEAD` or tracked files turns a prior result gray without rerunning verification.
- Returning to the exact clean verified commit returns green only when the passed receipt still names it.
- Clicking the status item launches the task.
- The status bar and receipt never overclaim deploy-only LFS, production, provider, clinical, approval, or native-accessibility evidence.
- Existing unrelated dirty and untracked user files are preserved.

## Explicit non-goals

- Automatic full verification when the container opens.
- CI attestation, cryptographic signing, remote upload, deployment approval, or merge authorization.
- A general-purpose VS Code extension or support outside this repository's Dev Container.
- Repairing private research content, clinical content, or unrelated browser/product defects merely to obtain green status.
- Treating a receipt as proof after the commit or tracked tree changes.
