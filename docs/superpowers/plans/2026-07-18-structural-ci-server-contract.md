# Structural CI Server Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the label-sensitive smoke-server assertion with a dependency-free structural contract for the three required localhost surfaces.

**Architecture:** Keep the contract in the existing Node test file. A local `assertSmokeServerContract(ci)` helper validates exact port-to-directory commands, the fail-closed readiness loop, and browser-project ordering; mutation tests prove labels are irrelevant and structural drift is rejected.

**Tech Stack:** Node.js test runner, `node:assert/strict`, GitHub Actions YAML treated as text.

## Global Constraints

- Port `4200` must serve `_build/ms3`.
- Port `4201` must serve `_build/res`.
- Port `4202` must serve `faculty-console`.
- The readiness loop must check exactly `4200 4201 4202` and retain its nonzero failure path.
- Interview Room and faculty-console browser projects must run after `Servers ready`.
- Preserve the managed-SP/build ordering and `SP_INTERVIEW_BASE_URL` contract.
- Add no parser dependency and make no workflow, application, server, build, or deployment behavior change.

## File structure

- Modify: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` — own the structural workflow validator and its mutation coverage.
- No production or workflow file changes.

---

### Task 1: Replace the label contract with a structural server contract

**Files:**
- Modify: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs:137-160`
- Test: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`

**Interfaces:**
- Consumes: GitHub Actions workflow text loaded from `.github/workflows/ci.yml`.
- Produces: local `assertSmokeServerContract(ci: string): void`, which throws an `AssertionError` when a required server mapping, readiness invariant, or browser-ordering invariant is absent.

- [ ] **Step 1: Add the mutation test with a deliberately empty validator**

Add this helper immediately above the current CI-ordering test:

```js
function assertSmokeServerContract() {}
```

Replace the current `Node 20 and the aggregate SP gates run before either site build` test with the two tests below. Keep the existing `ordered` array exactly as shown.

```js
test('CI gates and the three localhost review surfaces are structurally ordered', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const ordered = [
    'uses: actions/setup-node@v4',
    'node-version: "20"',
    'npm --prefix sp-proxy ci',
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
    'build_and_check.sh ms3',
    'build_and_check.sh res',
  ];
  let prior = -1;
  for (const marker of ordered) {
    const index = ci.indexOf(marker);
    assert.ok(index > prior, `${marker} must occur after the preceding managed-SP gate`);
    prior = index;
  }

  assertSmokeServerContract(ci);
  assert.match(ci, /SP_INTERVIEW_BASE_URL:\s*http:\/\/localhost:4200\/tools\//);
});

test('localhost server contract ignores labels and rejects structural drift', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const relabeled = ci.replace(
    /(\n\s*- name: )[^\n]+(\n\s+run: \|\n\s+python3 -m http\.server 4200 --directory _build\/ms3 &)/,
    '$1Arbitrary wording that must not affect behavior$2',
  );
  assert.notEqual(relabeled, ci, 'test fixture must locate and relabel the server step');
  assert.doesNotThrow(() => assertSmokeServerContract(relabeled));

  const commands = [
    'python3 -m http.server 4200 --directory _build/ms3 &',
    'python3 -m http.server 4201 --directory _build/res &',
    'python3 -m http.server 4202 --directory faculty-console &',
  ];
  for (const command of commands) {
    const port = command.match(/http\.server (\d+)/)?.[1];
    assert.throws(
      () => assertSmokeServerContract(ci.replace(command, '')),
      new RegExp(`${port} must serve`),
    );
  }

  assert.throws(
    () => assertSmokeServerContract(ci.replace(
      'python3 -m http.server 4202 --directory faculty-console &',
      'python3 -m http.server 4202 --directory _build/ms3 &',
    )),
    /4202 must serve faculty-console/,
  );
  assert.throws(
    () => assertSmokeServerContract(ci.replace(
      'for port in 4200 4201 4202; do',
      'for port in 4200 4201; do',
    )),
    /readiness loop must check exactly ports 4200, 4201, and 4202/,
  );

  for (const project of ['interview-room', 'faculty-console']) {
    const command = `npx playwright test --project=${project}`;
    const moved = ci
      .replace(command, '')
      .replace('echo "Servers ready"', `${command}\n          echo "Servers ready"`);
    assert.throws(
      () => assertSmokeServerContract(moved),
      new RegExp(`${project} browser project must follow successful server readiness`),
    );
  }
});
```

- [ ] **Step 2: Run the mutation test and verify RED**

Run:

```bash
node --test --test-name-pattern='localhost server contract' _prototypes/sp-interview/tests/ci-build-contract.test.mjs
```

Expected: FAIL with `Missing expected exception` because the empty validator accepts the mutation that removes port `4200`.

- [ ] **Step 3: Implement the minimal structural validator**

Replace the empty helper with:

```js
const SMOKE_SERVERS = Object.freeze([
  { port: '4200', directory: '_build/ms3' },
  { port: '4201', directory: '_build/res' },
  { port: '4202', directory: 'faculty-console' },
]);

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

function assertSmokeServerContract(ci) {
  let lastServer = -1;
  for (const { port, directory } of SMOKE_SERVERS) {
    const command = `python3 -m http.server ${port} --directory ${directory} &`;
    assert.equal(
      countOccurrences(ci, command),
      1,
      `${port} must serve ${directory} exactly once`,
    );
    lastServer = Math.max(lastServer, ci.indexOf(command));
  }

  const readinessLoop = 'for port in 4200 4201 4202; do';
  assert.equal(
    countOccurrences(ci, readinessLoop),
    1,
    'readiness loop must check exactly ports 4200, 4201, and 4202',
  );
  const readinessIndex = ci.indexOf(readinessLoop);
  assert.ok(readinessIndex > lastServer, 'readiness loop must follow all three server commands');

  const failureGuard = 'if [ "$ready" != true ]; then';
  const guardIndex = ci.indexOf(failureGuard, readinessIndex);
  assert.ok(guardIndex > readinessIndex, 'readiness loop must retain its fail-closed guard');
  const exitIndex = ci.indexOf('exit 1', guardIndex);
  assert.ok(exitIndex > guardIndex, 'readiness failure must exit nonzero');

  const readyMarker = 'echo "Servers ready"';
  assert.equal(countOccurrences(ci, readyMarker), 1, 'server readiness marker must occur exactly once');
  const readyIndex = ci.indexOf(readyMarker);
  assert.ok(readyIndex > exitIndex, 'success marker must follow the fail-closed readiness path');

  for (const project of ['interview-room', 'faculty-console']) {
    const marker = `--project=${project}`;
    assert.equal(
      countOccurrences(ci, marker),
      1,
      `${project} browser project must run exactly once`,
    );
    assert.ok(
      ci.indexOf(marker) > readyIndex,
      `${project} browser project must follow successful server readiness`,
    );
  }
}
```

- [ ] **Step 4: Run the targeted contract file and verify GREEN**

Run:

```bash
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs
```

Expected: 7 tests, 7 passed, 0 failed.

- [ ] **Step 5: Run the broader regression gates**

Run:

```bash
npm --prefix sp-proxy ci
npm --prefix sp-proxy test
bash _prototypes/sp-interview/tests/run-all.sh
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
node --test tests/*.test.mjs
git diff --check
```

Expected:

- `sp-proxy` tests pass;
- `run-all.sh` prints `ALL SUITES PASSED`;
- attestation consistency reports `OK`;
- root suite reports 347 passed and 0 failed;
- `git diff --check` is silent.

- [ ] **Step 6: Review scope, commit, and push to PR #236**

Run:

```bash
git status --short
git diff -- _prototypes/sp-interview/tests/ci-build-contract.test.mjs
git add _prototypes/sp-interview/tests/ci-build-contract.test.mjs
git commit -m "test(ci): validate smoke servers structurally"
git push
```

Expected: only the contract test is added to the implementation commit; GitHub starts replacement checks for PR #236.

- [ ] **Step 7: Confirm remote checks**

Run:

```bash
gh pr checks 236
```

Expected: `build-test-validate` and `Smoke tests (nav crawl · faculty console · LFS · visual)` pass, with no failed or pending required checks before completion is claimed.
