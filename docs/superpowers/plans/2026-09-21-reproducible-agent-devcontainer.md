# Reproducible Agent Dev Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give local developers and coding agents one containerized environment, with no new paid repository service, that matches the repository's supported Node, Python, Bash, Git LFS, and Playwright contracts.

**Architecture:** First replace every active Node 20 declaration with supported Node 22 and add a machine-checked runtime contract. Then add a minimal local Dev Container whose post-create script installs only the repository's locked dependencies; a separate explicit command runs the full local and nonvisual browser gates.

**Tech Stack:** VS Code Dev Containers, Docker/Debian Bookworm, Node 22, Python 3.11, Bash 5+, Git LFS, Playwright 1.63.0, GitHub Actions, Netlify Functions

**Spec:** `docs/superpowers/specs/2026-09-21-reproducible-agent-devcontainer-design.md`

## Global Constraints

- Implement in a fresh isolated worktree created from current `origin/main`; never edit the divergent primary checkout.
- Preserve clinical content, evidence registries, `reviewed.json`, `topic_meta.json`, question banks, crisis data, and LFS media byte-for-byte.
- Use Node 22 everywhere an active workflow, application Netlify site, package, or container declares a Node runtime; retain and assert the governance-critical faculty console's reviewed Node 24 exception.
- Use Python 3.11 and Bash 5 or later inside the container.
- Keep Playwright at the version in `tests/smoke/package.json` and its lockfile; do not update browsers or snapshots as part of this work.
- Do not add Codespaces, Sentry, Mastra, a hosted container registry, or a paid service.
- Treat local container-runtime licensing as an institutional prerequisite, not as a repository-provided guarantee of zero cost.
- Do not install agent plugins or put credentials, tokens, host socket mounts, SSH mounts, or secret environment variables in container configuration. Report host-controlled SSH-agent or Git-credential forwarding if VS Code exposes it.
- Do not deploy, publish, push, merge, call a paid provider, or alter faculty attestation during implementation verification.
- Run the MS3 and resident builds sequentially because they share generated outputs.
- Visual baselines remain Ubuntu-workflow-only and must not be regenerated locally.
- Keep `CLAUDE.md` and `AGENTS.md` byte-identical.

---

## File map

### New files

- `runtime_versions.json` — the reviewed declaration of supported runtime majors and named Node exceptions; Playwright stays sourced from its package manifest and lockfile.
- `bin/check-runtime-contract.mjs` — static drift check plus opt-in live environment check.
- `tests/runtime-contract.test.mjs` — automatically runs with the root `node --test tests/*.test.mjs` gate.
- `.devcontainer/Dockerfile` — Node 22 Bookworm image with Python 3.11, Bash 5, Git LFS, curl, and `lsof`.
- `.dockerignore` — restrict the image-build context to the Dockerfile and locked smoke-package metadata.
- `.devcontainer/devcontainer.json` — local VS Code container configuration with no repository-declared secret or host-control mounts.
- `.devcontainer/post-create.sh` — deterministic dependency/bootstrap script; no full gate and no deployment.
- `bin/verify-devcontainer.sh` — explicit full container verification entrypoint.

### Modified files

- `.github/workflows/ci.yml` — Node 22 for build and smoke jobs; canonical workflow digest changes.
- `.github/workflows/maintenance-governance-digest.yml` — Node 22.
- `.github/workflows/maintenance-production-canary.yml` — Node 22.
- `.github/workflows/maintenance-queue-runner.yml` — Node 22.
- `.github/workflows/refresh-baselines.yml` — Node 22; no baseline content changes.
- `sp-proxy/netlify.toml`, `metrics/netlify.toml` — Netlify Node runtime 22.
- `faculty-console/netlify.toml` — unchanged Node 24 declaration, read and asserted as a named exception.
- `sp-proxy/package.json`, `metrics/package.json`, `sp-preview/package.json`, `tests/smoke/package.json` — `engines.node` becomes `>=22 <23`.
- The four matching `package-lock.json` files — mechanically refreshed root package metadata only.
- `sp-proxy/README.md`, `faculty-console/README.md`, and `metrics/netlify/functions/ev.mjs` — remove stale Node 20 explanations.
- `_prototypes/sp-interview/tests/ops-docs.test.mjs` — update the proxy deployment contract to Node 22.
- `tests/maintenance/test_scheduled_workflows.py` — update the workflow mutation anchors to Node 22.
- `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py` — update only changed workflow contract digests.
- `bin/verify.sh` — run the static runtime contract as part of the local superset gate.
- `CLAUDE.md`, `AGENTS.md`, `README.md` — setup, verification, and evidence boundaries.

---

### Task 1: Establish and enforce the supported runtime

**Files:**
- Create: `runtime_versions.json`
- Create: `bin/check-runtime-contract.mjs`
- Create: `tests/runtime-contract.test.mjs`
- Modify: `.github/workflows/ci.yml:195-201,291-297`
- Modify: `.github/workflows/maintenance-governance-digest.yml:38-40`
- Modify: `.github/workflows/maintenance-production-canary.yml:23-25`
- Modify: `.github/workflows/maintenance-queue-runner.yml:33-35`
- Modify: `.github/workflows/refresh-baselines.yml:39-41`
- Modify: `sp-proxy/netlify.toml:32-34`
- Modify: `metrics/netlify.toml:32-34`
- Inspect without changing: `faculty-console/netlify.toml:36-37`
- Modify: `sp-proxy/package.json`
- Modify: `metrics/package.json`
- Modify: `sp-preview/package.json`
- Modify: `tests/smoke/package.json`
- Modify: `sp-proxy/package-lock.json`
- Modify: `metrics/package-lock.json`
- Modify: `sp-preview/package-lock.json`
- Modify: `tests/smoke/package-lock.json`
- Modify: `sp-proxy/README.md:123`
- Modify: `faculty-console/README.md:130`
- Modify: `metrics/netlify/functions/ev.mjs:7-9`
- Modify: `_prototypes/sp-interview/tests/ops-docs.test.mjs:54-58`
- Modify: `tests/maintenance/test_scheduled_workflows.py:446-463`
- Modify: `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py:395-430`
- Modify: `bin/verify.sh` immediately after the root `node --test tests/*.test.mjs` step.

**Interfaces:**
- Produces: `declaredRuntimeErrors(root: string): string[]`
- Produces: `currentRuntimeErrors(contract: object, observed: object, expectedPlaywright: string): string[]`
- Produces: CLI `node bin/check-runtime-contract.mjs [--current]`, exit `0` clean, `1` mismatch, `2` unreadable contract/environment.
- Consumes: active workflow YAML, Netlify TOML, package manifests, and `runtime_versions.json`.

- [ ] **Step 1: Add the runtime contract**

Create `runtime_versions.json` exactly:

```json
{
  "schemaVersion": 1,
  "nodeMajor": 22,
  "pythonMajorMinor": "3.11",
  "bashMinimumMajor": 5,
  "nodeExceptions": {
    "faculty-console/netlify.toml": 24
  },
  "nodeReviewBy": "2027-02-01"
}
```

- [ ] **Step 2: Write the failing runtime tests**

Create `tests/runtime-contract.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  declaredRuntimeErrors,
  nodeDeclarationErrors,
  currentRuntimeErrors,
} from '../bin/check-runtime-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('active repository runtime declarations match runtime_versions.json', () => {
  assert.deepEqual(declaredRuntimeErrors(ROOT), []);
});

test('a Node 20 declaration is a hard mismatch', () => {
  assert.deepEqual(
    nodeDeclarationErrors('fixture.yml', 'node-version: "20"\n', 22),
    ['fixture.yml declares Node 20; expected Node 22'],
  );
});

test('a setup-node step without one literal node-version fails closed', () => {
  assert.deepEqual(
    nodeDeclarationErrors('fixture.yml', 'uses: actions/setup-node@sha\n', 22, 1),
    ['fixture.yml has 1 setup-node step(s) but 0 literal node-version declaration(s)'],
  );
});

test('live version comparison rejects the old Mac and Node lanes', () => {
  const contract = {
    nodeMajor: 22,
    pythonMajorMinor: '3.11',
    bashMinimumMajor: 5,
  };
  const errors = currentRuntimeErrors(contract, {
    node: '20.20.2',
    python: '3.13',
    bash: '3',
    gitLfs: '',
    playwright: '1.62.0',
  }, '1.63.0');
  assert.deepEqual(errors, [
    'current Node is 20.20.2; expected major 22',
    'current Python is 3.13; expected 3.11',
    'current Bash is 3; expected major 5 or later',
    'Git LFS is unavailable',
    'current Playwright is 1.62.0; expected 1.63.0',
  ]);
});
```

- [ ] **Step 3: Run the test and confirm the missing implementation fails**

Run:

```bash
node --test tests/runtime-contract.test.mjs
```

Expected: non-zero with `ERR_MODULE_NOT_FOUND` for `bin/check-runtime-contract.mjs`.

- [ ] **Step 4: Implement the static and live runtime checker**

Create `bin/check-runtime-contract.mjs` with these complete behaviors:

```javascript
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIRS = ['metrics', 'sp-proxy', 'sp-preview', 'tests/smoke'];
const NETLIFY_FILES = [
  'metrics/netlify.toml',
  'sp-proxy/netlify.toml',
  'sp-preview/netlify.toml',
  'faculty-console/netlify.toml',
];

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function contractAt(root) {
  const value = json(resolve(root, 'runtime_versions.json'));
  const keys = Object.keys(value).sort();
  const expected = [
    'bashMinimumMajor',
    'nodeMajor',
    'nodeExceptions',
    'nodeReviewBy',
    'pythonMajorMinor',
    'schemaVersion',
  ].sort();
  if (value.schemaVersion !== 1 || JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error('runtime_versions.json must use schemaVersion 1 and the exact six contract fields');
  }
  if (!value.nodeExceptions || typeof value.nodeExceptions !== 'object' || Array.isArray(value.nodeExceptions)) {
    throw new Error('runtime_versions.json nodeExceptions must be an object');
  }
  for (const path of Object.keys(value.nodeExceptions)) {
    if (!NETLIFY_FILES.includes(path)) throw new Error(`unknown Node exception: ${path}`);
  }
  return value;
}

export function nodeDeclarationErrors(label, source, expectedMajor, expectedCount) {
  const found = [...source.matchAll(/node-version:\s*["']?(\d+)/g)].map((match) => Number(match[1]));
  const errors = [];
  if (expectedCount !== undefined && found.length !== expectedCount) {
    errors.push(`${label} has ${expectedCount} setup-node step(s) but ${found.length} literal node-version declaration(s)`);
  }
  errors.push(...found
    .filter((major) => major !== expectedMajor)
    .map((major) => `${label} declares Node ${major}; expected Node ${expectedMajor}`));
  return errors;
}

export function declaredRuntimeErrors(root = ROOT) {
  const contract = contractAt(root);
  const errors = [];
  const workflowDir = resolve(root, '.github/workflows');

  for (const name of readdirSync(workflowDir).filter((value) => /\.ya?ml$/.test(value)).sort()) {
    const relative = `.github/workflows/${name}`;
    const source = readFileSync(resolve(root, relative), 'utf8');
    const setupNodeCount = (source.match(/uses:\s*actions\/setup-node@/g) || []).length;
    errors.push(...nodeDeclarationErrors(relative, source, contract.nodeMajor, setupNodeCount));
    const setupPythonCount = (source.match(/uses:\s*actions\/setup-python@/g) || []).length;
    const pythonVersions = [...source.matchAll(/python-version:\s*["']?([0-9]+\.[0-9]+)/g)].map((match) => match[1]);
    if (pythonVersions.length !== setupPythonCount) {
      errors.push(`${relative} has ${setupPythonCount} setup-python step(s) but ${pythonVersions.length} literal python-version declaration(s)`);
    }
    for (const version of pythonVersions) {
      if (version !== contract.pythonMajorMinor) {
        errors.push(`${relative} declares Python ${version}; expected ${contract.pythonMajorMinor}`);
      }
    }
  }

  for (const relative of NETLIFY_FILES) {
    const source = readFileSync(resolve(root, relative), 'utf8');
    const match = source.match(/NODE_VERSION\s*=\s*"(\d+)"/);
    const expected = contract.nodeExceptions[relative] ?? contract.nodeMajor;
    if (!match) errors.push(`${relative} has no NODE_VERSION`);
    else if (Number(match[1]) !== expected) {
      errors.push(`${relative} declares Node ${match[1]}; expected Node ${expected}`);
    }
  }

  const engine = `>=${contract.nodeMajor} <${contract.nodeMajor + 1}`;
  for (const directory of PACKAGE_DIRS) {
    const relative = `${directory}/package.json`;
    const manifest = json(resolve(root, relative));
    if (manifest.engines?.node !== engine) {
      errors.push(`${relative} engines.node is ${JSON.stringify(manifest.engines?.node)}; expected ${JSON.stringify(engine)}`);
    }
  }

  const smoke = json(resolve(root, 'tests/smoke/package.json'));
  if (!/^\d+\.\d+\.\d+$/.test(smoke.devDependencies?.['@playwright/test'] || '')) {
    errors.push('tests/smoke/package.json must pin @playwright/test to an exact version');
  }

  return errors;
}

export function currentRuntimeErrors(contract, observed, expectedPlaywright) {
  const errors = [];
  if (Number(String(observed.node).split('.')[0]) !== contract.nodeMajor) {
    errors.push(`current Node is ${observed.node}; expected major ${contract.nodeMajor}`);
  }
  if (observed.python !== contract.pythonMajorMinor) {
    errors.push(`current Python is ${observed.python}; expected ${contract.pythonMajorMinor}`);
  }
  if (Number(observed.bash) < contract.bashMinimumMajor) {
    errors.push(`current Bash is ${observed.bash}; expected major ${contract.bashMinimumMajor} or later`);
  }
  if (!observed.gitLfs) errors.push('Git LFS is unavailable');
  if (observed.playwright !== expectedPlaywright) {
    errors.push(`current Playwright is ${observed.playwright}; expected ${expectedPlaywright}`);
  }
  return errors;
}

function command(commandName, args, allowFailure = false) {
  try {
    return execFileSync(commandName, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function observeCurrent() {
  return {
    node: process.versions.node,
    python: command('python3', ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")']),
    bash: command('bash', ['-c', 'printf %s "${BASH_VERSINFO[0]}"']),
    gitLfs: command('git', ['lfs', 'version'], true),
    playwright: command('node', ['-p', "require('./tests/smoke/node_modules/@playwright/test/package.json').version"]),
  };
}

function main() {
  let contract;
  let errors;
  try {
    contract = contractAt(ROOT);
    errors = declaredRuntimeErrors(ROOT);
  } catch (error) {
    console.error(`runtime contract unreadable: ${error.message}`);
    return 2;
  }
  const expectedPlaywright = json(resolve(ROOT, 'tests/smoke/package.json')).devDependencies['@playwright/test'];
  if (process.argv.includes('--current')) {
    try {
      errors = errors.concat(currentRuntimeErrors(contract, observeCurrent(), expectedPlaywright));
    } catch (error) {
      console.error(`current runtime unreadable: ${error.message}`);
      return 2;
    }
  }
  if (errors.length) {
    for (const error of errors) console.error(`runtime contract: ${error}`);
    return 1;
  }
  console.log(`runtime contract OK — Node ${contract.nodeMajor}, Python ${contract.pythonMajorMinor}, Bash ${contract.bashMinimumMajor}+, Playwright ${expectedPlaywright}`);
  return 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exitCode = main();
```

- [ ] **Step 5: Run the tests and confirm they now expose the live Node 20 declarations**

Run:

```bash
node --test tests/runtime-contract.test.mjs
```

Expected: the fixture tests pass; the repository test fails and names every active Node 20 declaration.

- [ ] **Step 6: Migrate active runtime declarations to Node 22**

Make these exact semantic edits:

- Replace every active workflow `node-version: "20"` with `node-version: "22"`.
- Replace `NODE_VERSION = "20"` with `NODE_VERSION = "22"` in `metrics/netlify.toml` and `sp-proxy/netlify.toml`.
- Leave `faculty-console/netlify.toml` at Node 24; its divergence is the explicit `nodeExceptions` contract entry, not an omission.
- Set `engines.node` to `">=22 <23"` in all four package manifests. Add the `engines` object after `private` where it is absent.
- Treat `engines.node` as advisory package metadata; the runtime checker is the enforcement mechanism. Do not add `engine-strict=true`, which would create a new deployment gate outside this scope.
- Change `sp-proxy/README.md` and `faculty-console/README.md` to remove their stale Node 20 statements while preserving the console's Node 24 deployment fact.
- Rewrite the stale comment at the top of `metrics/netlify/functions/ev.mjs` to state that Node 22 is the supported runtime; do not change function behavior or logging.
- Rename the proxy operations test to Node 22 and change its `NODE_VERSION` assertion from `"20"` to `"22"`.
- Change both Node-version literals in `tests/maintenance/test_scheduled_workflows.py`'s mutation-anchor pair from `"20"` to `"22"`; do not change the test's purpose.

Do not edit historical implementation plans that accurately record Node 20 at the time they were written.

Add this static check immediately after the root Node suite in `bin/verify.sh`:

```bash
step "runtime contract"                     node bin/check-runtime-contract.mjs
```

- [ ] **Step 7: Refresh only lockfile root metadata**

Run the lockfile-only refresh under the target runtime, not the retiring host runtime:

```bash
docker run --rm \
  -v "$PWD:/repo" \
  -w /repo \
  node:22-bookworm \
  bash -lc 'npm --prefix metrics install --package-lock-only --ignore-scripts && npm --prefix sp-proxy install --package-lock-only --ignore-scripts && npm --prefix sp-preview install --package-lock-only --ignore-scripts && npm --prefix tests/smoke install --package-lock-only --ignore-scripts'
```

Expected: each lockfile's root package metadata gains or updates `engines.node`; resolved dependency versions do not change. Review with:

```bash
git diff --word-diff=plain -- metrics/package-lock.json sp-proxy/package-lock.json sp-preview/package-lock.json tests/smoke/package-lock.json
```

- [ ] **Step 8: Recompute the changed scheduled-workflow digests**

Run this read-only digest printer:

```bash
python3 - <<'PY'
from pathlib import Path
import sys

root = Path.cwd()
sys.path.insert(0, str(root / "13_Faculty_Resources/_automation/maintenance"))
import validate_scheduled_workflows as v

for name in (
    "ci.yml",
    "maintenance-governance-digest.yml",
    "maintenance-production-canary.yml",
    "maintenance-queue-runner.yml",
):
    errors = []
    workflow, _ = v._load(root, name, errors)
    if errors or workflow is None:
        raise SystemExit(f"{name}: {errors}")
    print(name, v._contract_digest(workflow))
PY
```

Review `git diff -- .github/workflows` to confirm that only Node versions changed, then replace only those four values in `EXPECTED_WORKFLOW_CONTRACT_DIGESTS`. `refresh-baselines.yml` is outside the scheduled-workflow digest set.

The post-edit hook may reject the workflow edit before this step because the old digest no longer matches. That is expected fail-closed behavior: use the new digest printed by the validator, apply only the four reviewed replacements above, and rerun the validator. Do not bypass the hook or broaden the digest set.

- [ ] **Step 9: Run focused runtime and workflow verification**

Run:

```bash
node --test tests/runtime-contract.test.mjs
python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
node bin/check-runtime-contract.mjs
bash _prototypes/sp-interview/tests/run-all.sh
```

Expected: all commands exit `0`; `node bin/check-runtime-contract.mjs` reports Node 22 as the declared contract. Do not use `--current` on the host Mac because its host runtime is not the target environment.

- [ ] **Step 10: Run every current Node test surface under Node 22**

Use the implementation worktree directly. `npm ci` writes only ignored dependency/build outputs and does not rewrite lockfiles:

```bash
docker run --rm \
  -v "$PWD:/repo" \
  -w /repo \
  node:22-bookworm \
  bash -lc 'npm --prefix metrics ci && npm --prefix metrics test && npm --prefix sp-proxy ci --include=dev && npm --prefix sp-proxy test && npm --prefix sp-preview ci --include=dev && npm --prefix sp-preview test && npm --prefix sp-preview run build && npm --prefix tests/smoke ci && node --test tests/*.test.mjs && node tests/contrast-check.mjs && node --test faculty-console/*.test.mjs && node faculty-console/check_pending_visible.mjs && bash _prototypes/sp-interview/tests/run-all.sh && node bin/redteam-offline.mjs && node bin/redteam-offline.mjs --coverage'
```

Expected: metrics, proxy, preview, root, faculty-console, Interview Room, contrast, and offline red-team suites pass. The smoke browser itself is installed and exercised in Task 3.

- [ ] **Step 11: Commit the runtime migration**

```bash
git add runtime_versions.json bin/check-runtime-contract.mjs tests/runtime-contract.test.mjs \
  .github/workflows/ci.yml \
  .github/workflows/maintenance-governance-digest.yml \
  .github/workflows/maintenance-production-canary.yml \
  .github/workflows/maintenance-queue-runner.yml \
  .github/workflows/refresh-baselines.yml \
  sp-proxy/netlify.toml metrics/netlify.toml \
  sp-proxy/package.json sp-proxy/package-lock.json \
  metrics/package.json metrics/package-lock.json \
  sp-preview/package.json sp-preview/package-lock.json \
  tests/smoke/package.json tests/smoke/package-lock.json \
  sp-proxy/README.md faculty-console/README.md metrics/netlify/functions/ev.mjs \
  _prototypes/sp-interview/tests/ops-docs.test.mjs \
  tests/maintenance/test_scheduled_workflows.py \
  bin/verify.sh \
  13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
git commit -m "chore(runtime): standardize supported Node 22"
```

---

### Task 2: Add the local Dev Container and deterministic bootstrap

**Files:**
- Create: `.dockerignore`
- Create: `.devcontainer/Dockerfile`
- Create: `.devcontainer/devcontainer.json`
- Create: `.devcontainer/post-create.sh`
- Modify: `bin/check-runtime-contract.mjs`
- Modify: `tests/runtime-contract.test.mjs`

**Interfaces:**
- Consumes: `runtime_versions.json` and the four existing package lockfiles.
- Produces: `bash .devcontainer/post-create.sh`, safe to rerun in the container.
- Produces: a VS Code environment whose terminal resolves `python3` from `.venv` and Node from the Node 22 base image.

- [ ] **Step 1: Extend the test to require the container safety contract**

Append to `tests/runtime-contract.test.mjs` (the `readFileSync` import was added with the original import block in Task 1):

```javascript
test('devcontainer declares no secret or host-control mounts', () => {
  const config = JSON.parse(readFileSync(resolve(ROOT, '.devcontainer/devcontainer.json'), 'utf8'));
  const serialized = JSON.stringify(config);
  assert.equal(config.remoteUser, 'node');
  assert.equal(config.postCreateCommand, 'bash .devcontainer/post-create.sh');
  assert.equal(config.mounts, undefined);
  assert.doesNotMatch(serialized, /docker\.sock|SSH_AUTH_SOCK|TOKEN|SECRET|PASSWORD|API_KEY/i);
});

test('container bootstrap installs every locked dependency lane and verifies the live contract', () => {
  const source = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  for (const token of [
    'requirements.txt',
    'requirements-dev.txt',
    'PyYAML==6.0.2',
    'npm --prefix metrics ci',
    'npm --prefix sp-proxy ci',
    'npm --prefix sp-preview ci',
    'npm --prefix tests/smoke ci',
    'check_lfs_media.py --worktree-stubs',
    'SSH_AUTH_SOCK',
    'credential.helper',
    'check-runtime-contract.mjs --current',
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('container image bakes the locked Chromium dependency', () => {
  const source = readFileSync(resolve(ROOT, '.devcontainer/Dockerfile'), 'utf8');
  assert.match(source, /COPY tests\/smoke\/package\.json tests\/smoke\/package-lock\.json/);
  assert.match(source, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.match(source, /npx playwright install chromium --with-deps/);
});
```

- [ ] **Step 2: Run the focused test and confirm missing container files fail**

```bash
node --test tests/runtime-contract.test.mjs
```

Expected: failure opening `.devcontainer/devcontainer.json`.

- [ ] **Step 3: Create the bounded build context and container image**

Create `.dockerignore`:

```dockerignore
*
!.devcontainer/
!.devcontainer/Dockerfile
!tests/
tests/*
!tests/smoke/
tests/smoke/*
!tests/smoke/package.json
!tests/smoke/package-lock.json
```

Create `.devcontainer/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

ENV CLERKSHIP_DEVCONTAINER=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER root

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       git-lfs \
       lsof \
       python3 \
       python3-pip \
       python3-venv \
    && test "$(node -p 'process.versions.node.split(`.`)[0]')" = "22" \
    && test "$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')" = "3.11" \
    && test "$(bash -c 'printf %s "${BASH_VERSINFO[0]}"')" -ge 5

COPY tests/smoke/package.json tests/smoke/package-lock.json /tmp/smoke/
RUN cd /tmp/smoke \
    && npm ci \
    && npx playwright install chromium --with-deps \
    && rm -rf /tmp/smoke /var/lib/apt/lists/* \
    && chmod -R a+rX /ms-playwright

USER node
```

The base tag intentionally follows security patches within Node 22 and Bookworm. The repository contract pins the supported major; NPM lockfiles pin application dependencies. Chromium and its Linux dependencies are image-baked from the locked smoke-package metadata, while `.dockerignore` prevents the unused repository and Git history from being sent in the image-build context.

- [ ] **Step 4: Create the VS Code Dev Container configuration**

Create `.devcontainer/devcontainer.json` as strict JSON with no comments:

```json
{
  "name": "Psychiatry Clerkship Library",
  "build": {
    "dockerfile": "Dockerfile",
    "context": ".."
  },
  "remoteUser": "node",
  "postCreateCommand": "bash .devcontainer/post-create.sh",
  "remoteEnv": {
    "VIRTUAL_ENV": "${containerWorkspaceFolder}/.venv",
    "PATH": "${containerWorkspaceFolder}/.venv/bin:${containerEnv:PATH}"
  },
  "customizations": {
    "vscode": {
      "settings": {
        "python.defaultInterpreterPath": "${containerWorkspaceFolder}/.venv/bin/python3",
        "terminal.integrated.defaultProfile.linux": "bash"
      },
      "extensions": [
        "ms-python.python",
        "ms-playwright.playwright"
      ]
    }
  }
}
```

- [ ] **Step 5: Create the rerunnable bootstrap script**

Create `.devcontainer/post-create.sh`:

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

python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py --worktree-stubs . || {
  echo "Dev Container setup requires materialized LFS media. Run 'git lfs pull' in a full clone, then rebuild the container." >&2
  exit 1
}

if [ -n "${SSH_AUTH_SOCK:-}" ]; then
  echo "NOTICE: the host SSH agent is visible inside this container." >&2
fi
if git config --get-all credential.helper >/dev/null 2>&1; then
  echo "NOTICE: a Git credential helper is configured inside this container." >&2
fi

node bin/check-runtime-contract.mjs --current
```

The script deliberately does not run `git lfs install --local`: in a bind-mounted checkout that would mutate host Git configuration, and in a linked worktree the `.git` indirection may point outside the mount. The supported interactive Dev Container entrypoint is a full clone with materialized LFS files. Implementation may still be authored in an isolated linked worktree; clean-container proof uses the full probe clone below.

Then make it executable:

```bash
chmod 0755 .devcontainer/post-create.sh
```

- [ ] **Step 6: Extend the runtime checker to validate container declarations**

In `declaredRuntimeErrors`, after the Playwright check, add checks that:

```javascript
  const dockerfile = readFileSync(resolve(root, '.devcontainer/Dockerfile'), 'utf8');
  if (!dockerfile.includes(`javascript-node:1-${contract.nodeMajor}-bookworm`)) {
    errors.push(`.devcontainer/Dockerfile does not use Node ${contract.nodeMajor} Bookworm`);
  }
  if (!dockerfile.includes('COPY tests/smoke/package.json tests/smoke/package-lock.json')) {
    errors.push('.devcontainer/Dockerfile must consume the locked smoke package metadata');
  }
  if (!dockerfile.includes('npx playwright install chromium --with-deps')) {
    errors.push('.devcontainer/Dockerfile must install the locked Chromium runtime');
  }

  const devcontainer = json(resolve(root, '.devcontainer/devcontainer.json'));
  if (devcontainer.remoteUser !== 'node') errors.push('.devcontainer/devcontainer.json must run as node');
  if (devcontainer.postCreateCommand !== 'bash .devcontainer/post-create.sh') {
    errors.push('.devcontainer/devcontainer.json must run the tracked post-create script');
  }
  if (Object.hasOwn(devcontainer, 'mounts')) {
    errors.push('.devcontainer/devcontainer.json must not declare host mounts');
  }
  const serialized = JSON.stringify(devcontainer);
  if (/docker\.sock|SSH_AUTH_SOCK|TOKEN|SECRET|PASSWORD|API_KEY/i.test(serialized)) {
    errors.push('.devcontainer/devcontainer.json contains a forbidden credential or host-control declaration');
  }
```

- [ ] **Step 7: Run the static contract tests**

```bash
node --test tests/runtime-contract.test.mjs
node bin/check-runtime-contract.mjs
git diff --check
```

Expected: all exit `0`.

- [ ] **Step 8: Build the image and run bootstrap in a clean temporary clone**

Commit first so the clean clone contains the container files:

```bash
git add .dockerignore .devcontainer bin/check-runtime-contract.mjs tests/runtime-contract.test.mjs
git commit -m "chore(dev): add reproducible agent container"
```

Then run:

```bash
probe_dir="$(mktemp -d)"
git clone --no-hardlinks . "$probe_dir/repo"
git -C "$probe_dir/repo" lfs pull
docker build \
  --file "$probe_dir/repo/.devcontainer/Dockerfile" \
  --tag psychiatry-clerkship-devcontainer:local \
  "$probe_dir/repo"
docker run --rm \
  -v "$probe_dir/repo:/workspaces/psychiatry-clerkship" \
  -w /workspaces/psychiatry-clerkship \
  psychiatry-clerkship-devcontainer:local \
  bash -lc 'bash .devcontainer/post-create.sh && node bin/check-runtime-contract.mjs --current'
```

Expected final line:

```text
runtime contract OK — Node 22, Python 3.11, Bash 5+, Playwright 1.63.0
```

The host-side `git lfs pull` runs while the probe clone can still resolve its local-origin path and normally reuses the primary repository's LFS object cache. If the local cache lacks an object and Git LFS would contact GitHub, record that network/bandwidth dependency before proceeding; do not describe the probe as zero-bandwidth.

Do not push the image to a registry.

---

### Task 3: Add one-command container verification

**Files:**
- Create: `bin/verify-devcontainer.sh`
- Modify: `tests/runtime-contract.test.mjs`

**Interfaces:**
- Consumes: container bootstrap, `bin/verify.sh`, and `bin/verify-smoke.sh`.
- Produces: `bash bin/verify-devcontainer.sh`, exit `0` only when live runtime, full repository gate, and nonvisual browser smoke suite pass.

- [ ] **Step 1: Write a failing test for the verification boundary**

Append to `tests/runtime-contract.test.mjs`:

```javascript
test('container verifier composes existing gates and never mutates visual baselines', () => {
  const source = readFileSync(resolve(ROOT, 'bin/verify-devcontainer.sh'), 'utf8');
  assert.match(source, /check-runtime-contract\.mjs --current/);
  assert.match(source, /bash bin\/verify\.sh/);
  assert.match(source, /bash bin\/verify-smoke\.sh/);
  assert.doesNotMatch(source, /update-snapshots|update-baselines|test:visual/);
});
```

- [ ] **Step 2: Run the test and confirm the missing script fails**

```bash
node --test tests/runtime-contract.test.mjs
```

Expected: failure opening `bin/verify-devcontainer.sh`.

- [ ] **Step 3: Create the explicit full verification script**

Create `bin/verify-devcontainer.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "${CLERKSHIP_DEVCONTAINER:-}" != "1" ]; then
  echo "verify-devcontainer.sh must run inside the project Dev Container." >&2
  exit 2
fi

node bin/check-runtime-contract.mjs --current
bash bin/verify.sh
bash bin/verify-smoke.sh

echo "DEV CONTAINER VERIFIED — runtime, full gate, and nonvisual smoke suite passed"
```

Make it executable:

```bash
chmod 0755 bin/verify-devcontainer.sh
```

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/runtime-contract.test.mjs
bash bin/verify-devcontainer.sh
```

Expected on the host Mac: the Node test passes; the shell script exits `2` with the explicit inside-container message. This is the intended fail-closed behavior.

- [ ] **Step 5: Commit the verification entrypoint**

```bash
git add bin/verify-devcontainer.sh tests/runtime-contract.test.mjs
git commit -m "test(dev): add one-command container verification"
```

- [ ] **Step 6: Run the full proof in a clean container clone**

```bash
probe_dir="$(mktemp -d)"
git clone --no-hardlinks . "$probe_dir/repo"
git -C "$probe_dir/repo" lfs pull
docker run --rm \
  -v "$probe_dir/repo:/workspaces/psychiatry-clerkship" \
  -w /workspaces/psychiatry-clerkship \
  psychiatry-clerkship-devcontainer:local \
  bash -lc 'bash .devcontainer/post-create.sh && bash bin/verify-devcontainer.sh'
```

Because the full gate is long-running, send its output to a log and poll it rather than wrapping it in a blocking sleep if the execution environment yields early.

Expected terminal evidence:

```text
DEV CONTAINER VERIFIED — runtime, full gate, and nonvisual smoke suite passed
```

Also confirm the smoke output says `SMOKE PASSED (non-visual:` and contains no snapshot update.

---

### Task 4: Document use, limits, and handoff

**Files:**
- Modify: `CLAUDE.md:41-86`
- Modify: `AGENTS.md:41-86` by byte-copying `CLAUDE.md`
- Modify: `README.md` in its development/setup section

**Interfaces:**
- Consumes: the implemented Dev Container and verification scripts.
- Produces: exact human and agent setup instructions at the repository's authoritative instruction surfaces.

- [ ] **Step 1: Add the container commands and evidence boundary to `CLAUDE.md`**

Immediately after the existing validation command block, add:

````markdown
### Local Dev Container

VS Code can reopen this repository in `.devcontainer/`, which supplies Node 22,
Python 3.11, Bash 5+, Git LFS, the locked NPM dependencies, and Chromium. Container
creation runs `.devcontainer/post-create.sh`; it installs dependencies and checks the
runtime contract but deliberately does not run the long full gate. Open a full clone,
not a linked worktree whose Git directory is outside the mounted workspace, and materialize
LFS files with `git lfs pull` before reopening it in the container.

```bash
node bin/check-runtime-contract.mjs --current  # fast environment proof
bash bin/verify-devcontainer.sh                # full gate + nonvisual smoke suite
```

The container declares no repository-managed credential or Docker-socket mount. VS Code
may still forward the host SSH agent or Git credential helper; setup reports either state.
It does not prove deployment, provider behavior, microphone/headphone behavior,
VoiceOver, faculty approval, clinical correctness, local LFS browser coverage, or Ubuntu
visual-baseline parity. The local LFS Playwright project skips without a deploy URL.
Never regenerate visual baselines from it; use the existing workflow_dispatch job. A push
made from the host Mac still runs its pre-push gate under host Bash 3.2; run the push from
the container when the Bash 5 environment is part of the evidence.
````

- [ ] **Step 2: Synchronize the Codex instruction copy**

```bash
cp CLAUDE.md AGENTS.md
cmp -s CLAUDE.md AGENTS.md
```

Expected: `cmp` exits `0`.

- [ ] **Step 3: Add the concise contributor entrypoint to `README.md`**

Add one short development paragraph that links to `.devcontainer/devcontainer.json` and gives only:

```markdown
For a reproducible local environment, reopen the repository in its VS Code Dev Container.
Initial setup installs the locked dependencies and Chromium; run
`bash bin/verify-devcontainer.sh` inside the container for the full local proof. This is a
local Docker workflow, not GitHub Codespaces, and it does not deploy anything.
```

- [ ] **Step 4: Run documentation and contract checks**

```bash
cmp -s CLAUDE.md AGENTS.md
node --test tests/runtime-contract.test.mjs
node --test tests/*.test.mjs
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
git diff --check
```

Expected: all exit `0`.

- [ ] **Step 5: Inspect the complete change boundary**

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD -- \
  13_Faculty_Resources/reviewed.json \
  topic_meta.json \
  question_bank.json \
  crisis_resources.json
```

Expected: the last command prints nothing. No LFS media, clinical source, attestation ledger, or evidence registry is changed.

- [ ] **Step 6: Commit the documentation**

```bash
git add CLAUDE.md AGENTS.md README.md
git commit -m "docs: document reproducible agent environment"
```

- [ ] **Step 7: Re-run final verification from the committed tree**

Create a fresh clean clone at the final committed `HEAD`, then use the local container image from Task 3:

```bash
final_probe_dir="$(mktemp -d)"
git clone --no-hardlinks . "$final_probe_dir/repo"
git -C "$final_probe_dir/repo" lfs pull
docker run --rm \
  -v "$final_probe_dir/repo:/workspaces/psychiatry-clerkship" \
  -w /workspaces/psychiatry-clerkship \
  psychiatry-clerkship-devcontainer:local \
  bash -lc 'bash .devcontainer/post-create.sh && bash bin/verify-devcontainer.sh'
```

Expected: exit `0` with the explicit `DEV CONTAINER VERIFIED` receipt. Record the exact commit SHA, full-gate final line, smoke-suite final line, and any unavailable external evidence in the eventual PR body.

- [ ] **Step 8: Prepare—but do not merge—the PR handoff**

The handoff must state:

- Node 20 was retired because it is end-of-life; Node 22 is the supported runtime.
- Files changed and workflow contract digests updated.
- Exact container build and verification commands run.
- Full gate and nonvisual browser results.
- No clinical content, PHI, attestation, provider, deployment, visual baseline, or production state changed.
- Remaining human action: review the design/plan, inspect CI and deploy previews after an authorized push, and explicitly authorize merge separately.

Do not push, open a PR, deploy, or merge without the user's explicit authorization.
