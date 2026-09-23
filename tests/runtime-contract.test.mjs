import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

import {
  declaredRuntimeErrors,
  nodeDeclarationErrors,
  pythonDeclarationErrors,
  netlifyNodeDeclarationErrors,
  currentRuntimeErrors,
} from '../bin/check-runtime-contract.mjs';
import { evaluateReceipt } from '../bin/devcontainer-receipt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('active repository runtime declarations match runtime_versions.json', () => {
  assert.deepEqual(declaredRuntimeErrors(ROOT), []);
});

test('a Node 20 declaration is a hard mismatch', () => {
  assert.deepEqual(
    nodeDeclarationErrors(
      'fixture.yml',
      '- uses: actions/setup-node@sha\n  with:\n    node-version: "20"\n',
      22,
    ),
    ['fixture.yml declares Node 20; expected Node 22'],
  );
});

test('a setup-node step without one literal node-version fails closed', () => {
  assert.deepEqual(
    nodeDeclarationErrors('fixture.yml', '- uses: actions/setup-node@sha\n', 22),
    ['fixture.yml has 1 setup-node step(s) but 0 literal node-version declaration(s)'],
  );
});

test('a commented node-version cannot satisfy a setup-node step', () => {
  assert.deepEqual(
    nodeDeclarationErrors(
      'fixture.yml',
      '- uses: actions/setup-node@sha\n  with:\n    # node-version: "22"\n',
      22,
    ),
    ['fixture.yml has 1 setup-node step(s) but 0 literal node-version declaration(s)'],
  );
});

test('a commented python-version cannot satisfy a setup-python step', () => {
  assert.deepEqual(
    pythonDeclarationErrors(
      'fixture.yml',
      '- uses: actions/setup-python@sha\n  with:\n    # python-version: "3.11"\n',
      '3.11',
    ),
    ['fixture.yml has 1 setup-python step(s) but 0 literal python-version declaration(s)'],
  );
});

test('a setup-python step without a literal version fails closed', () => {
  assert.deepEqual(
    pythonDeclarationErrors('fixture.yml', '- uses: actions/setup-python@sha\n', '3.11'),
    ['fixture.yml has 1 setup-python step(s) but 0 literal python-version declaration(s)'],
  );
});

test('a wrong Python declaration is a hard mismatch', () => {
  assert.deepEqual(
    pythonDeclarationErrors(
      'fixture.yml',
      '- uses: actions/setup-python@sha\n  with:\n    python-version: "3.12"\n',
      '3.11',
    ),
    ['fixture.yml declares Python 3.12; expected 3.11'],
  );
});

test('duplicate Python declarations fail closed', () => {
  assert.deepEqual(
    pythonDeclarationErrors(
      'fixture.yml',
      '- uses: actions/setup-python@sha\n  with:\n    python-version: "3.11"\n    python-version: "3.11"\n',
      '3.11',
    ),
    ['fixture.yml has 1 setup-python step(s) but 2 literal python-version declaration(s)'],
  );
});

test('commented and missing Netlify Node declarations fail closed', () => {
  assert.deepEqual(
    netlifyNodeDeclarationErrors('netlify.toml', '# NODE_VERSION = "22"\n', 22),
    ['netlify.toml has 0 active NODE_VERSION declarations; expected exactly 1'],
  );
});

test('duplicate Netlify Node declarations fail closed', () => {
  assert.deepEqual(
    netlifyNodeDeclarationErrors(
      'netlify.toml',
      'NODE_VERSION = "22"\nNODE_VERSION = "22"\n',
      22,
    ),
    ['netlify.toml has 2 active NODE_VERSION declarations; expected exactly 1'],
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

test('live version comparison rejects malformed Bash output', () => {
  const contract = {
    nodeMajor: 22,
    pythonMajorMinor: '3.11',
    bashMinimumMajor: 5,
  };
  assert.deepEqual(currentRuntimeErrors(contract, {
    node: '22.18.0',
    python: '3.11',
    bash: 'not-a-version',
    gitLfs: 'git-lfs/3.7.1',
    playwright: '1.63.0',
  }, '1.63.0'), [
    'current Bash is not-a-version; expected an integer major of 5 or later',
  ]);
});

test('devcontainer declares no secret or host-control mounts', () => {
  const config = JSON.parse(readFileSync(resolve(ROOT, '.devcontainer/devcontainer.json'), 'utf8'));
  const serialized = JSON.stringify(config);
  assert.equal(config.remoteUser, 'node');
  assert.equal(config.postCreateCommand, 'bash .devcontainer/post-create.sh');
  assert.equal(config.mounts, undefined);
  assert.doesNotMatch(serialized, /docker\.sock|SSH_AUTH_SOCK|TOKEN|SECRET|PASSWORD|API_KEY/i);
});

test('dependency installer replaces stale venv contents only inside the Dev Container', () => {
  const dockerfile = readFileSync(resolve(ROOT, '.devcontainer/Dockerfile'), 'utf8');
  const bootstrap = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  assert.match(dockerfile, /^ENV CLERKSHIP_DEVCONTAINER=1 \\/m);
  assert.doesNotMatch(bootstrap, /\b(?:export\s+)?CLERKSHIP_DEVCONTAINER\s*=/);

  const fixture = mkdtempSync(resolve(tmpdir(), 'install-dependencies-'));
  const fakeBin = resolve(fixture, 'fake-bin');
  const installerPath = resolve(fixture, '.devcontainer/install-dependencies.sh');
  const staleMarker = resolve(fixture, '.venv/lib/stale-host-package.marker');

  try {
    mkdirSync(resolve(fixture, '.devcontainer'), { recursive: true });
    mkdirSync(resolve(fixture, '.venv/lib'), { recursive: true });
    mkdirSync(fakeBin);
    for (const lane of ['metrics', 'sp-proxy', 'sp-preview', 'tests/smoke']) {
      mkdirSync(resolve(fixture, lane), { recursive: true });
    }
    writeFileSync(installerPath, readFileSync(resolve(ROOT, '.devcontainer/install-dependencies.sh')));
    writeFileSync(staleMarker, 'stale host package');

    writeFileSync(resolve(fakeBin, 'python3'), [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [[ "${1:-}" == "-m" && "${2:-}" == "venv" ]]; then',
      '  mkdir -p .venv/bin',
      '  printf "#!/usr/bin/env bash\\nexit 0\\n" > .venv/bin/python',
      '  chmod +x .venv/bin/python',
      'fi',
    ].join('\n'));
    writeFileSync(resolve(fakeBin, 'npm'), '#!/usr/bin/env bash\nexit 0\n');
    writeFileSync(resolve(fakeBin, 'npx'), '#!/usr/bin/env bash\nexit 0\n');
    for (const command of ['python3', 'npm', 'npx']) chmodSync(resolve(fakeBin, command), 0o755);

    const baseEnv = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, CLERKSHIP_DEVCONTAINER: '' };
    const outside = spawnSync('bash', [installerPath], { env: baseEnv, encoding: 'utf8' });
    assert.notEqual(outside.status, 0, 'installer must refuse venv cleanup outside the Dev Container');
    assert.ok(existsSync(staleMarker), 'refusal must preserve the existing venv');

    const inside = spawnSync('bash', [installerPath], {
      env: { ...baseEnv, CLERKSHIP_DEVCONTAINER: '1' },
      encoding: 'utf8',
    });
    assert.equal(inside.status, 0, inside.stderr);
    assert.equal(existsSync(staleMarker), false, 'a container install must discard stale venv contents');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('container bootstrap and explicit verification share every locked dependency lane', () => {
  const bootstrap = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  const installerPath = resolve(ROOT, '.devcontainer/install-dependencies.sh');
  assert.match(bootstrap, /bash \.devcontainer\/install-dependencies\.sh/);
  assert.ok(existsSync(installerPath));

  const source = readFileSync(installerPath, 'utf8');
  for (const token of [
    'requirements.txt',
    'requirements-dev.txt',
    'PyYAML==6.0.2',
    'npm --prefix metrics ci',
    'npm --prefix sp-proxy ci',
    'npm --prefix sp-preview ci',
    'npm --prefix tests/smoke ci',
    'playwright install chromium',
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('container image bakes the locked Chromium dependency', () => {
  const source = readFileSync(resolve(ROOT, '.devcontainer/Dockerfile'), 'utf8');
  assert.match(source, /COPY tests\/smoke\/package\.json tests\/smoke\/package-lock\.json/);
  assert.match(source, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.match(source, /npx playwright install chromium --with-deps/);
});

test('container verifier composes existing gates and never mutates visual baselines', () => {
  const source = readFileSync(resolve(ROOT, 'bin/verify-devcontainer.sh'), 'utf8');
  assert.match(source, /check-runtime-contract\.mjs --current/);
  assert.match(source, /bash bin\/verify\.sh/);
  assert.match(source, /bash bin\/verify-smoke\.sh/);
  assert.doesNotMatch(source, /update-snapshots|update-baselines|test:visual/);
});

test('container verifier uses the virtualenv created by container bootstrap', () => {
  const source = readFileSync(resolve(ROOT, 'bin/verify-devcontainer.sh'), 'utf8');
  assert.match(source, /VIRTUAL_ENV=.*\.venv/);
  assert.match(source, /PATH=.*VIRTUAL_ENV\/bin/);
});

test('container verifier clears inherited smoke selectors before its authoritative smoke stage', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'verify-devcontainer-'));
  const trace = resolve(fixture, 'trace.log');
  const fakeBin = resolve(fixture, 'fake-bin');

  try {
    mkdirSync(resolve(fixture, 'bin'), { recursive: true });
    mkdirSync(resolve(fixture, '.venv/bin'), { recursive: true });
    mkdirSync(fakeBin);
    writeFileSync(
      resolve(fixture, 'bin/verify-devcontainer.sh'),
      readFileSync(resolve(ROOT, 'bin/verify-devcontainer.sh')),
    );
    writeFileSync(resolve(fixture, '.venv/bin/python3'), '');
    writeFileSync(resolve(fakeBin, 'node'), '#!/bin/sh\nprintf "runtime\\n" >> "$TRACE"\n');
    writeFileSync(resolve(fakeBin, 'bash'), `#!/bin/sh
printf '%s:%s\\n' "$1" "\${SPECS-<unset>}" >> "$TRACE"
case "$1" in
  bin/verify.sh) exit 0 ;;
  bin/verify-smoke.sh) test "\${SPECS+x}" != x ;;
  *) exec /bin/bash "$@" ;;
esac
`);
    for (const path of [
      resolve(fixture, 'bin/verify-devcontainer.sh'),
      resolve(fixture, '.venv/bin/python3'),
      resolve(fakeBin, 'node'),
      resolve(fakeBin, 'bash'),
    ]) chmodSync(path, 0o755);

    const result = spawnSync('/bin/bash', ['bin/verify-devcontainer.sh'], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLERKSHIP_DEVCONTAINER: '1',
        PATH: `${fakeBin}:${process.env.PATH}`,
        SPECS: 'visual.spec.js --update-snapshots',
        TRACE: trace,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DEV CONTAINER VERIFIED/);
    assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), [
      'runtime',
      'bin/verify.sh:visual.spec.js --update-snapshots',
      'bin/verify-smoke.sh:<unset>',
    ]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function withVerifierFixture(run) {
  const fixture = mkdtempSync(resolve(tmpdir(), 'verify-receipt-'));
  const receiptPath = resolve(fixture, 'output/devcontainer/verification-receipt.json');
  const trace = resolve(fixture, 'trace.log');
  const marker = resolve(fixture, 'gate-started.marker');
  try {
    mkdirSync(resolve(fixture, 'bin'), { recursive: true });
    mkdirSync(resolve(fixture, '.devcontainer'), { recursive: true });
    mkdirSync(resolve(fixture, '.venv/bin'), { recursive: true });
    mkdirSync(resolve(fixture, 'tests/smoke'), { recursive: true });
    writeFileSync(resolve(fixture, 'bin/verify-devcontainer.sh'), readFileSync(resolve(ROOT, 'bin/verify-devcontainer.sh')));
    writeFileSync(resolve(fixture, 'bin/devcontainer-receipt.mjs'), readFileSync(resolve(ROOT, 'bin/devcontainer-receipt.mjs')));
    writeFileSync(resolve(fixture, 'tests/smoke/package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '1.63.0' } }));
    writeFileSync(resolve(fixture, '.venv/bin/python3'), '#!/bin/sh\necho "Python 3.11.9"\n');
    writeFileSync(resolve(fixture, '.devcontainer/install-dependencies.sh'), '#!/bin/bash\necho dependencies >> "$TRACE"\nif [ "${FAIL_STAGE:-}" = dependencies ]; then exit 1; fi\n');
    writeFileSync(resolve(fixture, 'bin/check-runtime-contract.mjs'), 'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.TRACE, "runtime-contract\\n");\nif (process.env.FAIL_STAGE === "runtime-contract") process.exit(1);\n');
    writeFileSync(resolve(fixture, 'bin/verify.sh'), '#!/bin/bash\necho full-gate >> "$TRACE"\nif [ "${HANG_STAGE:-}" = full-gate ]; then touch "$MARKER"; exec sleep 30; fi\nif [ "${FAIL_STAGE:-}" = full-gate ]; then exit 1; fi\n');
    writeFileSync(resolve(fixture, 'bin/verify-smoke.sh'), '#!/bin/bash\nprintf "nonvisual-smoke:%s\\n" "${SPECS-<unset>}" >> "$TRACE"\nif [ "${FAIL_STAGE:-}" = nonvisual-smoke ]; then exit 1; fi\n');
    for (const path of [
      'bin/verify-devcontainer.sh', '.venv/bin/python3', '.devcontainer/install-dependencies.sh',
      'bin/verify.sh', 'bin/verify-smoke.sh',
    ]) chmodSync(resolve(fixture, path), 0o755);
    execFileSync('git', ['init', '-q', fixture]);
    execFileSync('git', ['config', 'user.name', 'Synthetic Tester'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'synthetic@example.invalid'], { cwd: fixture });
    execFileSync('git', ['add', '.'], { cwd: fixture });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: fixture });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
    const env = { ...process.env, CLERKSHIP_DEVCONTAINER: '1', TRACE: trace, MARKER: marker, SPECS: 'visual.spec.js --update-snapshots' };
    const args = ['bin/verify-devcontainer.sh', '--refresh-deps', '--receipt', receiptPath];
    const result = run({ fixture, receiptPath, trace, marker, head, env, args });
    if (result && typeof result.then === 'function') {
      return result.finally(() => rmSync(fixture, { recursive: true, force: true }));
    }
    rmSync(fixture, { recursive: true, force: true });
    return result;
  } catch (error) {
    rmSync(fixture, { recursive: true, force: true });
    throw error;
  }
}

test('receipt-enabled verifier records success only after every authoritative stage', () => withVerifierFixture(({ fixture, receiptPath, trace, env, args }) => {
  const result = spawnSync('/bin/bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.stage, 'complete');
  assert.equal(receipt.exitCode, 0);
  assert.deepEqual(receipt.proof, {
    runtimeContract: 'passed', fullGate: 'passed', nonvisualSmoke: 'passed',
    deployLfsBrowserCoverage: 'not-proved-without-deploy-url',
  });
  assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), [
    'dependencies', 'runtime-contract', 'full-gate', 'nonvisual-smoke:<unset>',
  ]);
}));

test('receipt-enabled verifier overwrites old green with the exact failed stage', () => withVerifierFixture(({ fixture, receiptPath, head, env, args }) => {
  const first = spawnSync('/bin/bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  const result = spawnSync('/bin/bash', args, { cwd: fixture, env: { ...env, FAIL_STAGE: 'full-gate' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.stage, 'full-gate');
  assert.equal(receipt.exitCode, 1);
  assert.equal(evaluateReceipt({ receipt, head, trackedDirty: false }).state, 'failed');
}));

test('receipt-enabled verifier leaves interrupted attempts running and gray', async () => withVerifierFixture(async ({ fixture, receiptPath, marker, head, env, args }) => {
  const child = spawn('/bin/bash', args, { cwd: fixture, env: { ...env, HANG_STAGE: 'full-gate' }, detached: true, stdio: 'ignore' });
  try {
    const deadline = Date.now() + 10000;
    while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(existsSync(marker), 'full gate must start before termination');
    process.kill(-child.pid, 'SIGTERM');
    await new Promise((resolve) => child.once('close', resolve));
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert.equal(receipt.status, 'running');
    const evaluated = evaluateReceipt({ receipt, head, trackedDirty: false });
    assert.equal(evaluated.state, 'stale');
    assert.equal(evaluated.reason, 'verification-running');
  } finally {
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGTERM');
  }
}));

test('VS Code exposes one manual default task for receipt-enabled full verification', () => {
  const tasks = JSON.parse(readFileSync(resolve(ROOT, '.vscode/tasks.json'), 'utf8'));
  const matching = tasks.tasks.filter((entry) => entry.label === 'Verify Dev Container');
  assert.equal(matching.length, 1);
  const task = matching[0];
  assert.equal(task.type, 'shell');
  assert.equal(task.command, 'bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json');
  assert.deepEqual(task.group, { kind: 'test', isDefault: true });
  assert.equal(task.runOptions?.runOn, undefined);
});
