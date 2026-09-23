# Dev Container Verification Receipt and VS Code Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual VS Code task that performs the complete Dev Container verification, records a commit-bound machine-readable attempt receipt, and shows verified, failed, or stale state in the container's VS Code status bar.

**Architecture:** The existing `bin/verify-devcontainer.sh` remains the only authoritative gate composer. A small Node module owns receipt creation, atomic writes, schema validation, and freshness evaluation; the shell verifier and a repository-owned VS Code extension consume that one contract. The extension is packaged as a local VSIX in the container image and reads status through a fixed no-shell child process.

**Tech Stack:** Bash 5, Node.js 22 ESM/CommonJS, `node:test`, Python 3.11 `unittest`, VS Code Extension API, pinned `@vscode/vsce@4.0.0`, Dev Containers, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-23-devcontainer-verification-receipt-status-design.md`

## Global Constraints

- Scope is development tooling only; do not change clinical content, attestation, deployment settings, analytics defaults, credentials, or production behavior.
- The full verification remains manual. Do not add `runOn: folderOpen`, `postCreateCommand` execution of the full gate, or any equivalent automatic trigger.
- A verified state requires a schema-valid passed receipt, receipt commit equal to `HEAD`, and no tracked worktree or index changes.
- A failed receipt is red only for the same clean tracked commit; old-commit or dirty-tree receipts are gray.
- Unreadable, missing, malformed, unsupported, incomplete, or unknown state fails closed to gray.
- Receipt data contains no PHI, learner data, clinical text, prompts, logs, secrets, environment values, or command output.
- The extension has no network, webview, credential, free-form shell, or repository-write capability.
- Use synthetic fixtures only. Preserve every unrelated dirty or untracked user file.
- Keep `CLAUDE.md` and `AGENTS.md` byte-identical after documentation changes.
- Never regenerate visual baselines locally. The final smoke proof is nonvisual and must state that deploy-only LFS checks remain unproved without deploy URLs.
- Shared-output MS3 and resident builds must remain sequential through the existing scripts.

## Review Focus

1. A `passed` receipt missing even one required proof field must render gray, never green; Task 2 adds this malformed-success test.
2. A failed receipt for the previous commit must render gray rather than alarming red for the new commit; Task 2 adds the precedence test.
3. Either an unstaged tracked edit or a staged tracked edit after success must render gray; Task 2 exercises both Git states through the CLI.
4. Terminating verification after it writes `running` must leave a gray in-progress receipt, never the previous green result; Task 3 kills a controlled fixture process and evaluates the residue.
5. If the extension's evaluator child process times out, exits nonzero, or emits malformed JSON, the item must remain visible and gray without crashing the extension host; Task 4 tests all three branches.

---

## File map

### New files

- `.devcontainer/install-dependencies.sh` — one lockfile-only dependency installation routine shared by container creation and explicit full verification.
- `bin/devcontainer-receipt.mjs` — receipt schema, atomic writer, Git freshness evaluator, and CLI.
- `tests/devcontainer-receipt.test.mjs` — receipt model and real-Git CLI tests.
- `.vscode/tasks.json` — manual **Verify Dev Container** task.
- `.devcontainer/receipt-status/package.json` — local VS Code extension manifest and pinned packaging dependency.
- `.devcontainer/receipt-status/package-lock.json` — exact `@vscode/vsce` dependency graph.
- `.devcontainer/receipt-status/extension.cjs` — status-bar lifecycle, evaluator invocation, refresh triggers, and task command.
- `.devcontainer/receipt-status/presentation.cjs` — pure state-to-status-bar presentation mapping.
- `.devcontainer/receipt-status/README.md` — short local-extension description required by VSIX packaging.
- `tests/devcontainer-status-extension.test.mjs` — presentation, manifest, timeout/error fallback, and package/install contracts.

### Modified files

- `13_Faculty_Resources/_automation/site_build/test_common.py` — exclude repository-management worktree directories from the source census.
- `.devcontainer/post-create.sh` — delegate locked installation and install the local VSIX.
- `.devcontainer/Dockerfile` — build the local VSIX and retain it at a fixed image path.
- `.dockerignore` — admit only the local extension files needed by the Docker build.
- `bin/verify-devcontainer.sh` — parse receipt/refresh options, record stages and outcomes, and retain existing gate order.
- `tests/runtime-contract.test.mjs` — pin the shared installer, task, verifier receipt behavior, and container packaging.
- `.gitignore` — ignore only `/output/devcontainer/`.
- `README.md` — document the task, receipt, and manual behavior.
- `CLAUDE.md` and `AGENTS.md` — document freshness colors and evidence boundaries with byte parity.

---

### Task 1: Make container dependency installation and source census deterministic

**Files:**
- Create: `.devcontainer/install-dependencies.sh`
- Modify: `.devcontainer/post-create.sh:1-20`
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py:204-268,347-412`
- Modify: `tests/runtime-contract.test.mjs:158-174`
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py`
- Test: `tests/runtime-contract.test.mjs`

**Interfaces:**
- Produces: `.devcontainer/install-dependencies.sh` with no arguments; exit `0` only after the Python venv, all four npm lanes, and locked Chromium are container-native and installed.
- Produces: `_SKIP_DIRS` containing both `.worktrees` and `worktrees` so later full verification examines the current source tree, not repository-management clones.
- Consumes: existing lockfiles and `PLAYWRIGHT_BROWSERS_PATH`; updates no dependency versions.

- [ ] **Step 1: Add the failing worktree-census regression test**

Add this method to `TestThemeInit` before the live-tree parity test:

```python
    def test_boot_census_ignores_repository_management_worktrees(self):
        with tempfile.TemporaryDirectory() as root:
            for directory in (".worktrees", "worktrees"):
                nested = os.path.join(root, directory, "old-branch")
                os.makedirs(nested)
                with open(os.path.join(nested, "stale.html"), "w", encoding="utf-8") as fh:
                    fh.write("<html><head><script>"
                             "localStorage.getItem('cw_theme');"
                             "document.documentElement.setAttribute('data-theme','stale');"
                             "</script></head></html>")

            labels = [label for label, _ in _boot_census(root)]
            self.assertEqual(labels, ["common.py:THEME_INIT"])
```

- [ ] **Step 2: Run the Python test and verify RED**

Run:

```bash
python3 13_Faculty_Resources/_automation/site_build/test_common.py
```

Expected: FAIL in `test_boot_census_ignores_repository_management_worktrees` because both stale HTML files appear in the census.

- [ ] **Step 3: Add the failing shared-installer contract test**

Replace the bootstrap token test in `tests/runtime-contract.test.mjs` with assertions that `post-create.sh` invokes the shared installer and that the installer contains every locked lane:

```js
test('container bootstrap and explicit verification share every locked dependency lane', () => {
  const bootstrap = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  const installerPath = resolve(ROOT, '.devcontainer/install-dependencies.sh');
  assert.match(bootstrap, /bash \.devcontainer\/install-dependencies\.sh/);
  assert.ok(existsSync(installerPath));

  const installer = readFileSync(installerPath, 'utf8');
  for (const token of [
    'requirements.txt',
    'requirements-dev.txt',
    'PyYAML==6.0.2',
    'npm --prefix metrics ci',
    'npm --prefix sp-proxy ci',
    'npm --prefix sp-preview ci',
    'npm --prefix tests/smoke ci',
    'playwright install chromium',
  ]) assert.match(installer, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
```

Add `existsSync` to the existing `node:fs` import.

- [ ] **Step 4: Run the Node test and verify RED**

Run:

```bash
node --test tests/runtime-contract.test.mjs
```

Expected: FAIL because `.devcontainer/install-dependencies.sh` does not exist and `post-create.sh` still owns the commands directly.

- [ ] **Step 5: Implement the source exclusion and shared installer**

Change the Python constant to:

```python
_SKIP_DIRS = {
    ".git", ".claude", ".worktrees", "worktrees", "_build",
    "node_modules", "__pycache__", ".venv",
}
```

Create `.devcontainer/install-dependencies.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

python3 -m venv .venv
.venv/bin/python -m pip install \
  --requirement requirements.txt \
  --requirement requirements-dev.txt \
  'PyYAML==6.0.2'

npm --prefix metrics ci
npm --prefix sp-proxy ci
npm --prefix sp-preview ci
npm --prefix tests/smoke ci

(
  cd tests/smoke
  npx playwright install chromium
)
```

Make it executable. Replace lines 6-20 of `.devcontainer/post-create.sh` with:

```bash
bash .devcontainer/install-dependencies.sh
```

Keep the LFS preflight, credential notices, and runtime check unchanged and after dependency installation.

- [ ] **Step 6: Run both focused suites and verify GREEN**

Run:

```bash
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/runtime-contract.test.mjs
```

Expected: both exit `0`; the Python suite reports no worktree-census drift and the Node suite finds every dependency lane through the shared installer.

- [ ] **Step 7: Commit Task 1**

```bash
git add .devcontainer/install-dependencies.sh .devcontainer/post-create.sh \
  13_Faculty_Resources/_automation/site_build/test_common.py \
  tests/runtime-contract.test.mjs
git commit -m "fix(dev): isolate container dependency and source checks"
```

---

### Task 2: Implement the receipt schema, atomic writer, and freshness evaluator

**Files:**
- Create: `bin/devcontainer-receipt.mjs`
- Create: `tests/devcontainer-receipt.test.mjs`
- Modify: `.gitignore:90-110`

**Interfaces:**
- Produces: `buildReceipt(input) -> ReceiptV1`.
- Produces: `writeReceiptAtomic(path, receipt) -> void` using same-directory temporary file plus rename.
- Produces: `evaluateReceipt({ receipt, head, trackedDirty }) -> { state, reason, shortCommit, receipt }`, where `state` is `verified | failed | stale`.
- Produces CLI:
  - `node bin/devcontainer-receipt.mjs record --path PATH --status running|passed|failed --stage NAME --exit-code N [--started-at ISO]`
  - `node bin/devcontainer-receipt.mjs status --path PATH --root ROOT`
- Consumes: Git `HEAD`, `git diff --quiet`, and `git diff --cached --quiet` only for `status`; never reads untracked files.

- [ ] **Step 1: Write the failing receipt model tests**

Create `tests/devcontainer-receipt.test.mjs` with table-driven tests importing the four interfaces. Include these exact cases:

```js
test('only a complete passed receipt for the clean current commit is verified', () => {
  const receipt = validReceipt();
  assert.deepEqual(
    evaluateReceipt({ receipt, head: COMMIT, trackedDirty: false }),
    { state: 'verified', reason: 'current-clean-pass', shortCommit: COMMIT.slice(0, 7), receipt },
  );
});

test('passed receipts with incomplete proof fail closed to stale', () => {
  for (const key of ['runtimeContract', 'fullGate', 'nonvisualSmoke']) {
    const receipt = validReceipt();
    delete receipt.proof[key];
    assert.equal(evaluateReceipt({ receipt, head: COMMIT, trackedDirty: false }).state, 'stale');
  }
});

test('an old failed receipt is stale, while a current failed receipt is red', () => {
  const receipt = validReceipt({ status: 'failed', stage: 'full-gate', exitCode: 1 });
  assert.equal(evaluateReceipt({ receipt, head: OTHER_COMMIT, trackedDirty: false }).state, 'stale');
  assert.equal(evaluateReceipt({ receipt, head: COMMIT, trackedDirty: false }).state, 'failed');
});

test('running, missing, malformed, unsupported, and dirty states are stale', () => {
  const cases = [
    null,
    { malformed: true },
    { ...validReceipt(), schemaVersion: 2 },
    { ...validReceipt(), status: 'running', stage: 'full-gate' },
  ];
  for (const receipt of cases) {
    assert.equal(evaluateReceipt({ receipt, head: COMMIT, trackedDirty: false }).state, 'stale');
  }
  assert.equal(evaluateReceipt({ receipt: validReceipt(), head: COMMIT, trackedDirty: true }).state, 'stale');
});
```

Also add an atomic-write test that parses the completed destination, asserts no sibling temporary file remains, and proves overwriting a prior passed receipt with a failed receipt produces one complete JSON object.

- [ ] **Step 2: Run the model tests and verify RED**

Run:

```bash
node --test tests/devcontainer-receipt.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `bin/devcontainer-receipt.mjs`.

- [ ] **Step 3: Implement the pure receipt model and atomic writer**

Create `bin/devcontainer-receipt.mjs` with:

```js
export const SCHEMA_VERSION = 1;
export const REQUIRED_PROOF = ['runtimeContract', 'fullGate', 'nonvisualSmoke'];

export function evaluateReceipt({ receipt, head, trackedDirty }) {
  const stale = (reason) => ({ state: 'stale', reason, shortCommit: head?.slice(0, 7) || '', receipt });
  if (!receipt || typeof receipt !== 'object') return stale('receipt-missing-or-unreadable');
  if (receipt.schemaVersion !== SCHEMA_VERSION) return stale('unsupported-schema');
  if (!/^[0-9a-f]{40}$/.test(receipt.commit || '')) return stale('invalid-commit');
  if (receipt.commit !== head) return stale('commit-mismatch');
  if (trackedDirty) return stale('tracked-tree-changed');
  if (receipt.status === 'failed' && Number.isInteger(receipt.exitCode) && receipt.exitCode > 0) {
    return { state: 'failed', reason: receipt.stage || 'unknown-stage', shortCommit: head.slice(0, 7), receipt };
  }
  if (receipt.status !== 'passed') return stale(receipt.status === 'running' ? 'verification-running' : 'unknown-status');
  if (receipt.exitCode !== 0 || receipt.stage !== 'complete') return stale('incomplete-pass');
  if (!receipt.proof || REQUIRED_PROOF.some((key) => receipt.proof[key] !== 'passed')) {
    return stale('incomplete-proof');
  }
  return { state: 'verified', reason: 'current-clean-pass', shortCommit: head.slice(0, 7), receipt };
}
```

Implement `buildReceipt()` with the exact allowlist `schemaVersion`, `status`, `commit`, `startedAt`, `completedAt`, `stage`, `exitCode`, `runtimes`, and `proof`. Require 40 lowercase hexadecimal commit characters, ISO timestamps, the four runtime string keys, an integer exit code, and the three required proof keys before a passed receipt can validate. Implement `writeReceiptAtomic()` using `mkdirSync(dirname(path), { recursive: true })`, `writeFileSync(temp, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })`, and `renameSync(temp, path)`. In a `finally`, remove a leftover temporary file if rename did not complete.

- [ ] **Step 4: Run the model tests and verify the pure layer GREEN**

Run:

```bash
node --test tests/devcontainer-receipt.test.mjs
```

Expected: the pure model and atomic-write tests pass; CLI tests added next still fail or are not yet present.

- [ ] **Step 5: Add failing real-Git CLI tests for both dirty modes**

In the same test file, create a temporary Git repository, configure a synthetic author, commit `tracked.txt`, and use `spawnSync(process.execPath, [RECEIPT_CLI, 'status', '--path', receiptPath, '--root', repo])`. Add two assertions:

```js
writeFileSync(resolve(repo, 'tracked.txt'), 'unstaged\n');
assert.equal(runStatus(repo, receiptPath).state, 'stale');
assert.equal(runStatus(repo, receiptPath).reason, 'tracked-tree-changed');

execFileSync('git', ['add', 'tracked.txt'], { cwd: repo });
assert.equal(runStatus(repo, receiptPath).state, 'stale');
assert.equal(runStatus(repo, receiptPath).reason, 'tracked-tree-changed');
```

Add CLI record tests proving `running` preserves `startedAt`, `passed` captures all runtime keys, and no serialized property contains values from a sentinel `SECRET_SENTINEL` environment variable.

- [ ] **Step 6: Run CLI tests and verify RED**

Run:

```bash
node --test tests/devcontainer-receipt.test.mjs
```

Expected: FAIL because the `record` and `status` commands are not implemented.

- [ ] **Step 7: Implement strict CLI parsing and runtime collection**

Add:

```js
export function collectRuntimes(root) {
  const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
  const smoke = JSON.parse(readFileSync(resolve(root, 'tests/smoke/package.json'), 'utf8'));
  return {
    node: process.version,
    python: run('python3', ['--version']),
    bash: run('bash', ['--version']).split('\n')[0],
    playwright: smoke.devDependencies['@playwright/test'],
  };
}
```

Implement a strict `--key value` parser that rejects unknown, duplicate, or missing flags with exit `2`. `record` obtains the commit with `execFileSync('git', ['rev-parse', 'HEAD'])`, reads a prior same-commit `running` receipt only to preserve `startedAt`, builds an allowlisted receipt, and writes atomically. `status` reads JSON defensively, obtains `HEAD`, sets `trackedDirty` when either `git diff --quiet` or `git diff --cached --quiet` exits `1`, and prints exactly one normalized JSON object. A Git/read/parse/tool failure prints a stale object and exits `0`; an invalid CLI invocation exits `2`.

- [ ] **Step 8: Ignore the receipt directory and run the full receipt suite GREEN**

Add this exact `.gitignore` entry with a comment:

```gitignore
# Local Dev Container verification evidence; commit-bound and regenerated on demand.
/output/devcontainer/
```

Run:

```bash
node --test tests/devcontainer-receipt.test.mjs
git check-ignore -v output/devcontainer/verification-receipt.json
```

Expected: all receipt tests pass and `git check-ignore` names the new rule.

- [ ] **Step 9: Commit Task 2**

```bash
git add .gitignore bin/devcontainer-receipt.mjs tests/devcontainer-receipt.test.mjs
git commit -m "feat(dev): add commit-bound verification receipts"
```

---

### Task 3: Integrate receipts with the verifier and the VS Code task

**Files:**
- Create: `.vscode/tasks.json`
- Modify: `bin/verify-devcontainer.sh:1-23`
- Modify: `tests/runtime-contract.test.mjs:183-249`

**Interfaces:**
- Consumes: Task 1 installer and Task 2 `record` CLI.
- Produces: `bin/verify-devcontainer.sh [--refresh-deps] [--receipt PATH]`; existing no-argument behavior and gate order remain valid.
- Produces: task label exactly `Verify Dev Container`, executing `bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json`.
- Stage names are exactly `dependencies`, `runtime-contract`, `full-gate`, `nonvisual-smoke`, and `complete`.

- [ ] **Step 1: Write failing success/failure/termination verifier tests**

Extend `tests/runtime-contract.test.mjs` with a fixture helper that copies `bin/verify-devcontainer.sh` and `bin/devcontainer-receipt.mjs`, initializes a Git repository, creates `.venv/bin/python3`, `tests/smoke/package.json`, and controlled scripts for every stage.

Add these assertions:

```js
test('receipt-enabled verifier records success only after every authoritative stage', () => {
  const result = runVerifier({ failStage: null });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(result.receiptPath, 'utf8'));
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.stage, 'complete');
  assert.equal(receipt.exitCode, 0);
  assert.deepEqual(receipt.proof, {
    runtimeContract: 'passed',
    fullGate: 'passed',
    nonvisualSmoke: 'passed',
    deployLfsBrowserCoverage: 'not-proved-without-deploy-url',
  });
});

test('receipt-enabled verifier overwrites old green with the exact failed stage', () => {
  const result = runVerifier({ failStage: 'full-gate', existingPassedReceipt: true });
  assert.notEqual(result.status, 0);
  const receipt = JSON.parse(readFileSync(result.receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.stage, 'full-gate');
  assert.equal(receipt.exitCode, 1);
});
```

For interruption, spawn the verifier with a controlled `bin/verify.sh` that writes a marker then waits. After the marker appears, send `SIGTERM`, wait for exit, and assert the receipt remains `status: "running"`; pass it to the Task 2 evaluator and assert gray `verification-running`.

- [ ] **Step 2: Run the focused verifier tests and verify RED**

Run:

```bash
node --test --test-name-pattern='receipt-enabled verifier' tests/runtime-contract.test.mjs
```

Expected: FAIL because the verifier rejects both new options and writes no receipt.

- [ ] **Step 3: Implement verifier option parsing, stages, and traps**

At the top of `bin/verify-devcontainer.sh`, parse only `--refresh-deps` and `--receipt PATH`; unknown/duplicate/missing options exit `2`. Keep the existing container and venv preconditions.

Use this control shape:

```bash
receipt_path=""
refresh_deps=0
stage="startup"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

record() {
  [ -n "$receipt_path" ] || return 0
  node bin/devcontainer-receipt.mjs record \
    --path "$receipt_path" --status "$1" --stage "$stage" \
    --exit-code "$2" --started-at "$started_at"
}

on_error() {
  exit_code=$?
  trap - ERR
  record failed "$exit_code" || true
  exit "$exit_code"
}
trap on_error ERR

stage="dependencies"
record running 0
if [ "$refresh_deps" = 1 ]; then
  bash .devcontainer/install-dependencies.sh
fi

stage="runtime-contract"
node bin/check-runtime-contract.mjs --current
stage="full-gate"
bash bin/verify.sh
stage="nonvisual-smoke"
env -u SPECS bash bin/verify-smoke.sh
stage="complete"
record passed 0
```

Do not add an `EXIT` trap that converts `SIGKILL` or an unobservable termination into a false failed receipt; a surviving `running` receipt is intentionally gray.

- [ ] **Step 4: Run verifier tests and verify GREEN**

Run:

```bash
node --test tests/runtime-contract.test.mjs tests/devcontainer-receipt.test.mjs
```

Expected: all tests pass, including inherited `SPECS` clearing and the three receipt lifecycle cases.

- [ ] **Step 5: Write the failing task contract test**

Add:

```js
test('VS Code exposes one manual default task for receipt-enabled full verification', () => {
  const tasks = JSON.parse(readFileSync(resolve(ROOT, '.vscode/tasks.json'), 'utf8'));
  const task = tasks.tasks.find((entry) => entry.label === 'Verify Dev Container');
  assert.ok(task);
  assert.equal(task.type, 'shell');
  assert.equal(task.command, 'bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json');
  assert.deepEqual(task.group, { kind: 'test', isDefault: true });
  assert.equal(task.runOptions?.runOn, undefined);
});
```

- [ ] **Step 6: Run the task contract and verify RED**

Run:

```bash
node --test --test-name-pattern='VS Code exposes one manual' tests/runtime-contract.test.mjs
```

Expected: FAIL with `ENOENT` for `.vscode/tasks.json`.

- [ ] **Step 7: Create the manual VS Code task**

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Verify Dev Container",
      "type": "shell",
      "command": "bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json",
      "group": { "kind": "test", "isDefault": true },
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "dedicated",
        "clear": true,
        "showReuseMessage": true
      }
    }
  ]
}
```

- [ ] **Step 8: Run Task 3 suites GREEN and commit**

Run:

```bash
node --test tests/runtime-contract.test.mjs tests/devcontainer-receipt.test.mjs
git diff --check
```

Expected: exit `0` with all tests passing and no whitespace errors.

```bash
git add .vscode/tasks.json bin/verify-devcontainer.sh tests/runtime-contract.test.mjs
git commit -m "feat(dev): record full verification attempts"
```

---

### Task 4: Add and locally package the freshness-aware VS Code status item

**Files:**
- Create: `.devcontainer/receipt-status/package.json`
- Create: `.devcontainer/receipt-status/package-lock.json`
- Create: `.devcontainer/receipt-status/extension.cjs`
- Create: `.devcontainer/receipt-status/presentation.cjs`
- Create: `.devcontainer/receipt-status/README.md`
- Create: `tests/devcontainer-status-extension.test.mjs`
- Modify: `.devcontainer/Dockerfile:21-28`
- Modify: `.devcontainer/post-create.sh:22-34`
- Modify: `.dockerignore:1-12`
- Modify: `tests/runtime-contract.test.mjs:149-181`

**Interfaces:**
- Consumes: `node bin/devcontainer-receipt.mjs status --path output/devcontainer/verification-receipt.json --root ROOT`, which returns one normalized JSON object and exits `0` even when stale.
- Produces: `presentationFor(status) -> { text, color, tooltip }`; color tokens are `testing.iconPassed`, `testing.iconFailed`, and `disabledForeground`.
- Produces command ID `clerkship.verifyDevContainer`, which calls `workbench.action.tasks.runTask` with `Verify Dev Container`.
- Produces VSIX `/opt/clerkship-devcontainer-receipt-status.vsix`, installed by `post-create.sh` with `code --install-extension ... --force`.

- [ ] **Step 1: Write failing presentation and manifest tests**

Create `tests/devcontainer-status-extension.test.mjs`. Use `createRequire(import.meta.url)` to load `presentation.cjs`. Add:

```js
test('status presentation maps verified, failed, and stale without ambiguous colors', () => {
  const verified = presentationFor({
    state: 'verified',
    shortCommit: '1234567',
    reason: 'current-clean-pass',
    receipt: {
      completedAt: '2026-09-23T12:00:00Z',
      runtimes: { node: 'v22.20.0', python: 'Python 3.11.14', bash: 'GNU bash 5.2.37', playwright: '1.63.0' },
    },
  });
  assert.deepEqual(verified, {
    text: '$(pass-filled) Dev Container 1234567',
    color: 'testing.iconPassed',
    tooltip: 'Dev Container verified for 1234567 at 2026-09-23T12:00:00Z. Runtimes: Node v22.20.0 · Python 3.11.14 · GNU bash 5.2.37 · Playwright 1.63.0. Click to verify again.',
  });
  assert.equal(presentationFor({ state: 'failed', shortCommit: '1234567', reason: 'full-gate' }).color, 'testing.iconFailed');
  assert.equal(presentationFor({ state: 'stale', shortCommit: '89abcde', reason: 'commit-mismatch' }).color, 'disabledForeground');
});

test('local extension manifest activates only for this workspace and contributes one command', () => {
  const manifest = JSON.parse(readFileSync(resolve(EXTENSION, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.activationEvents, ['workspaceContains:.devcontainer/devcontainer.json']);
  assert.equal(manifest.main, './extension.cjs');
  assert.deepEqual(manifest.contributes.commands, [{
    command: 'clerkship.verifyDevContainer',
    title: 'Verify Dev Container',
  }]);
  assert.equal(manifest.devDependencies['@vscode/vsce'], '4.0.0');
});
```

- [ ] **Step 2: Run the extension test and verify RED**

Run:

```bash
node --test tests/devcontainer-status-extension.test.mjs
```

Expected: FAIL because the extension directory and presentation module do not exist.

- [ ] **Step 3: Implement the pure presentation and extension manifest**

Create `presentation.cjs` with one exported `presentationFor(status)` function. Use exhaustive `switch` branches, include recorded time and the four runtime versions in verified and failed tooltips when present, and return gray `Verification status unavailable` for unknown input. Never include arbitrary receipt properties or command output in a tooltip.

Create `package.json`:

```json
{
  "name": "clerkship-devcontainer-receipt-status",
  "displayName": "Clerkship Dev Container Verification",
  "description": "Shows commit-bound local verification status for this repository.",
  "version": "0.1.0",
  "publisher": "clerkship-local",
  "private": true,
  "engines": { "vscode": "^1.105.0" },
  "categories": ["Other"],
  "activationEvents": ["workspaceContains:.devcontainer/devcontainer.json"],
  "main": "./extension.cjs",
  "contributes": {
    "commands": [
      { "command": "clerkship.verifyDevContainer", "title": "Verify Dev Container" }
    ]
  },
  "scripts": { "package": "vsce package" },
  "devDependencies": { "@vscode/vsce": "4.0.0" }
}
```

Create a README that states the three colors, manual task behavior, local-only installation, and evidence exclusions. Generate the lockfile without installing scripts:

```bash
npm --prefix .devcontainer/receipt-status install --package-lock-only --ignore-scripts
```

- [ ] **Step 4: Run presentation/manifest tests GREEN**

Run:

```bash
node --test tests/devcontainer-status-extension.test.mjs
```

Expected: presentation and manifest tests pass; child-process fallback tests added next still fail or are absent.

- [ ] **Step 5: Add failing extension-controller tests for evaluator failures**

Structure `extension.cjs` to export `createController({ vscode, execFile, root, intervalMs })` in addition to `activate`. Inject fakes and add three tests where `execFile` respectively:

- calls back with a timeout error;
- calls back with a nonzero-exit error;
- returns stdout `not-json`.

For every case assert:

```js
assert.equal(item.showCalls, 1);
assert.equal(item.color.id, 'disabledForeground');
assert.match(item.text, /Dev Container/);
assert.match(item.tooltip, /unavailable/i);
```

Also assert that invoking the registered `clerkship.verifyDevContainer` callback calls:

```js
vscode.commands.executeCommand('workbench.action.tasks.runTask', 'Verify Dev Container')
```

- [ ] **Step 6: Run controller tests and verify RED**

Run:

```bash
node --test tests/devcontainer-status-extension.test.mjs
```

Expected: FAIL because `extension.cjs` and `createController` do not exist.

- [ ] **Step 7: Implement the no-shell controller and refresh lifecycle**

In `extension.cjs`:

- return without creating an item unless `CLERKSHIP_DEVCONTAINER === '1'` and a workspace folder exists;
- create one left-aligned status item;
- call `execFile('node', [receiptCli, 'status', '--path', receiptPath, '--root', root], { timeout: 5000, maxBuffer: 65536 }, callback)`;
- on any error or parse failure, call `presentationFor({ state: 'stale', reason: 'status-unavailable', shortCommit: '' })`;
- use `new vscode.ThemeColor(view.color)` rather than literal colors;
- watch `output/devcontainer/verification-receipt.json` for create/change/delete;
- refresh when `window.onDidChangeWindowState` reports `focused: true`;
- refresh every 15 seconds and dispose the timer, watcher, item, and event subscription;
- register `clerkship.verifyDevContainer` to run the exact task label.

- [ ] **Step 8: Run extension behavioral tests GREEN**

Run:

```bash
node --test tests/devcontainer-status-extension.test.mjs
```

Expected: all presentation, manifest, failure fallback, and task-click tests pass.

- [ ] **Step 9: Add failing container package/install contract tests**

Extend `tests/runtime-contract.test.mjs`:

```js
test('container builds and installs only the repository-owned receipt status VSIX', () => {
  const dockerfile = readFileSync(resolve(ROOT, '.devcontainer/Dockerfile'), 'utf8');
  const bootstrap = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  const dockerignore = readFileSync(resolve(ROOT, '.dockerignore'), 'utf8');
  assert.match(dockerfile, /COPY \.devcontainer\/receipt-status/);
  assert.match(dockerfile, /npm ci --ignore-scripts/);
  assert.match(dockerfile, /npx vsce package --out \/opt\/clerkship-devcontainer-receipt-status\.vsix/);
  assert.match(bootstrap, /code --install-extension \/opt\/clerkship-devcontainer-receipt-status\.vsix --force/);
  assert.match(dockerignore, /!\.devcontainer\/receipt-status\//);
  assert.doesNotMatch(`${dockerfile}\n${bootstrap}`, /marketplace|https?:\/\//i);
});
```

- [ ] **Step 10: Run the package/install contract and verify RED**

Run:

```bash
node --test --test-name-pattern='container builds and installs' tests/runtime-contract.test.mjs
```

Expected: FAIL because the Dockerfile, bootstrap, and build-context allowlist do not package or install the VSIX.

- [ ] **Step 11: Package the local VSIX in the image and install it in bootstrap**

Add to `.dockerignore`:

```dockerignore
!.devcontainer/receipt-status/
!.devcontainer/receipt-status/**
```

Before `USER node` in the Dockerfile add:

```dockerfile
COPY .devcontainer/receipt-status /tmp/receipt-status
RUN cd /tmp/receipt-status \
    && npm ci --ignore-scripts \
    && npx vsce package --out /opt/clerkship-devcontainer-receipt-status.vsix \
    && rm -rf /tmp/receipt-status
```

After dependency installation in `.devcontainer/post-create.sh`, add:

```bash
if ! command -v code >/dev/null 2>&1; then
  echo "Dev Container setup requires the VS Code server CLI to install the local status extension." >&2
  exit 1
fi
code --install-extension /opt/clerkship-devcontainer-receipt-status.vsix --force
```

Do not weaken the existing no-secret/no-host-control-mount assertion.

- [ ] **Step 12: Run all Task 4 tests GREEN and build the image**

Run:

```bash
node --test tests/devcontainer-status-extension.test.mjs tests/runtime-contract.test.mjs
docker build -f .devcontainer/Dockerfile -t clerkship-devcontainer-receipt-status:test .
```

Expected: both Node test files pass; Docker builds the VSIX successfully and exits `0`.

- [ ] **Step 13: Commit Task 4**

```bash
git add .devcontainer/receipt-status .devcontainer/Dockerfile \
  .devcontainer/post-create.sh .dockerignore \
  tests/devcontainer-status-extension.test.mjs tests/runtime-contract.test.mjs
git commit -m "feat(dev): show verification freshness in VS Code"
```

---

### Task 5: Document, verify, and exercise the real container workflow

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Test: all files from Tasks 1-4
- Generated and ignored: `output/devcontainer/verification-receipt.json`

**Interfaces:**
- Consumes: every earlier task.
- Produces: human instructions that distinguish automatic bootstrap checks from manual full verification and state every receipt evidence boundary.
- Produces final evidence from an actual full clone reopened in the rebuilt Dev Container.

- [ ] **Step 1: Add failing documentation contract assertions**

In `tests/runtime-contract.test.mjs`, assert both `README.md` and `CLAUDE.md` include:

- `Verify Dev Container`;
- `output/devcontainer/verification-receipt.json`;
- `green` with current clean commit meaning;
- `gray` with stale/different commit meaning;
- `red` with current failed attempt meaning;
- explicit wording that full verification is manual, not automatic;
- deploy-only LFS coverage is not proved without a deploy URL.

Continue relying on the existing CLAUDE/AGENTS byte-parity gate rather than duplicating it.

- [ ] **Step 2: Run the docs contract and verify RED**

Run:

```bash
node --test --test-name-pattern='Dev Container.*receipt|receipt.*Dev Container' tests/runtime-contract.test.mjs
```

Expected: FAIL because the current documentation names only the shell command and has no receipt/status-bar contract.

- [ ] **Step 3: Update user and agent documentation**

In the README Dev Container section and the matching `CLAUDE.md` local-container section, document:

```text
Container creation automatically installs locked dependencies and runs only the fast runtime contract. The full gate is deliberately manual: run the VS Code task “Verify Dev Container” or the receipt-enabled command. A completed attempt writes output/devcontainer/verification-receipt.json. Green means the receipt passed for the current clean tracked commit; red means the current commit's latest attempt failed; gray means no current proof exists. Without deploy URLs, the local LFS browser projects remain skipped and the receipt says so.
```

Retain the existing credential-forwarding and evidence-boundary paragraphs. Copy `CLAUDE.md` byte-for-byte to `AGENTS.md` after editing:

```bash
cp CLAUDE.md AGENTS.md
```

- [ ] **Step 4: Run focused and repository unit suites**

Run:

```bash
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/devcontainer-receipt.test.mjs \
  tests/devcontainer-status-extension.test.mjs \
  tests/runtime-contract.test.mjs
node --test tests/*.test.mjs
cmp -s CLAUDE.md AGENTS.md
git diff --check
```

Expected: every command exits `0`; the root Node suite reports zero failures; parity and whitespace checks are clean.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md CLAUDE.md AGENTS.md tests/runtime-contract.test.mjs
git commit -m "docs(dev): explain verification receipt states"
```

- [ ] **Step 6: Create a disposable full clone with materialized LFS for the UI proof**

From the primary checkout, create a temporary full clone of this branch, configure its LFS storage to reuse the primary Git common directory, then materialize media:

```bash
proof_dir="$(mktemp -d)"
git clone --no-hardlinks --branch codex/devcontainer-receipt-status \
  /Users/jm/Psychiatry-Clerkship-Library "$proof_dir/repo"
git -C "$proof_dir/repo" config lfs.storage \
  /Users/jm/Psychiatry-Clerkship-Library/.git/lfs
git -C "$proof_dir/repo" lfs pull
```

Expected: the clone is a full repository with its own `.git` directory and no LFS pointer stubs. Record `proof_dir` in the execution ledger; do not delete it until all UI evidence is captured.

- [ ] **Step 7: Rebuild and reopen the disposable clone in its Dev Container**

Use VS Code's **Dev Containers: Reopen in Container** workflow on `$proof_dir/repo`. Confirm setup exits `0`, the local extension appears in installed extensions, and the initial status item is gray because no receipt exists.

Expected: the window title identifies the Dev Container; `node bin/check-runtime-contract.mjs --current` reports Node 22, Python 3.11, Bash 5+, and Playwright 1.63.0.

- [ ] **Step 8: Run the actual VS Code task and inspect the receipt**

Run **Tasks: Run Task → Verify Dev Container** from the container window. Do not substitute a host command. When the task ends, run in the container terminal:

```bash
node bin/devcontainer-receipt.mjs status \
  --path output/devcontainer/verification-receipt.json --root .
git rev-parse HEAD
python3 -m json.tool output/devcontainer/verification-receipt.json
```

Expected if repository gates are green: task exit `0`, normalized state `verified`, receipt commit exactly equals `HEAD`, all three proof fields are `passed`, and the status item turns green. If any repository gate is red, expected behavior is a nonzero task, a schema-valid current failed receipt, and a red status item; report the exact named gate and do not claim full proof.

- [ ] **Step 9: Exercise stale and failed status transitions without falsifying the real receipt**

Copy the real receipt to `/tmp/verification-receipt.real.json`. Use Task 2's `record` CLI to create controlled fixtures at the normal receipt path:

1. Record a failed receipt for current `HEAD`; wait for red.
2. Change its `commit` to forty zeroes using a Node one-liner and atomic rename; wait for gray.
3. Restore `/tmp/verification-receipt.real.json`; wait for the real state to return.
4. Make a tracked edit with `apply_patch`; wait for gray; reverse only that exact test edit with `apply_patch`; wait for the real state to return.

Expected: no state transition requires reloading VS Code, the item never disappears, and the original receipt is restored byte-for-byte at the end. Do not use `git checkout --`, `git reset`, or broad cleanup.

- [ ] **Step 10: Run final branch verification**

In the implementation worktree:

```bash
git status --short
git diff --check main...HEAD
python3 13_Faculty_Resources/_automation/site_build/test_common.py
node --test tests/*.test.mjs
```

In the disposable Dev Container, rerun the actual task only if Step 8 was green and Step 9 intentionally replaced the receipt; otherwise preserve and report the red failure receipt.

Expected: implementation worktree is clean; diff check and all focused/root unit tests exit `0`. The real-container result is reported separately and never inferred from unit tests.

---

## Final review and handoff

After Task 5, create a whole-branch review package from the design commit's parent through `HEAD`. The reviewer must explicitly inspect:

- receipt state precedence and malformed-success handling;
- Bash `ERR` trap behavior under each stage and signal interruption;
- shell/JSON/path injection boundaries;
- absence of secrets, logs, PHI, and clinical content in receipt output;
- extension disposal, timeout, parse-failure, and no-workspace behavior;
- VSIX build/install reproducibility and whether first-open activation needs a reload;
- documentation claims against the actual full-container result.

Critical and Important findings receive one TDD fix pass and a fresh full relevant suite. Minor findings are recorded for the user. Do not merge, push, deploy, publish the extension, or remove the disposable proof clone without explicit authorization.
