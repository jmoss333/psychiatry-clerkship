import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

test('full-clone onboarding initializes only clone-local LFS filters, never inherited hooks', () => {
  const guide = readFileSync(resolve(ROOT, '.devcontainer/README.md'), 'utf8');
  const install = guide.match(/^git -C .* lfs install (.+)$/m);
  assert.ok(install, 'onboarding must initialize LFS filters');
  assert.deepEqual(install[1].trim().split(/\s+/).sort(), ['--local', '--skip-repo', '--skip-smudge']);
  assert.match(guide, /GIT_LFS_SKIP_SMUDGE=1 git -c core\.hooksPath="\$clone_parent\/repo\/\.git\/hooks" clone --no-hardlinks/);
  assert.match(guide, /git -C "\$clone_parent\/repo" -c core\.hooksPath="\$clone_parent\/repo\/\.git\/hooks" lfs checkout/);
});

for (const file of ['README.md', 'CLAUDE.md']) {
  test(`Dev Container receipt documentation states manual proof and status boundaries in ${file}`, () => {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    assert.match(source, /Verify Dev Container/);
    assert.match(source, /output\/devcontainer\/verification-receipt\.json/);
    assert.match(source, /full gate is deliberately manual/i);
    assert.match(source, /python3 bin\/devcontainer-preflight\.py/);
    assert.match(source, /fast runtime contract/i);
    assert.match(source, /not that it is the latest remote main/i);
    assert.match(source, /green means the receipt passed for the current clean tracked commit/i);
    assert.match(source, /red means the current commit's latest attempt failed/i);
    assert.match(source, /gray means no current proof exists[\s\S]*?stale[\s\S]*?different commit/i);
    assert.match(source, /without deploy URLs[\s\S]*?LFS browser[\s\S]*?skipped[\s\S]*?not proved/i);
  });
}

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

test('Dev Container preserves VS Code injected CLI PATH during bootstrap', () => {
  const config = JSON.parse(readFileSync(resolve(ROOT, '.devcontainer/devcontainer.json'), 'utf8'));
  assert.equal(config.remoteEnv.PATH, undefined, 'remoteEnv must not replace VS Code remote CLI PATH');
  assert.equal(config.remoteEnv.VIRTUAL_ENV, '${containerWorkspaceFolder}/.venv');
  assert.equal(config.customizations.vscode.settings['python.defaultInterpreterPath'], '${containerWorkspaceFolder}/.venv/bin/python3');
});

test('container builds and installs only the repository-owned receipt status VSIX', () => {
  const dockerfile = readFileSync(resolve(ROOT, '.devcontainer/Dockerfile'), 'utf8');
  const bootstrap = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  const dockerignore = readFileSync(resolve(ROOT, '.dockerignore'), 'utf8');
  assert.match(dockerfile, /COPY \.devcontainer\/receipt-status/);
  assert.match(dockerfile, /npm ci --ignore-scripts/);
  assert.match(dockerfile, /npx vsce package --out \/opt\/clerkship-devcontainer-receipt-status\.vsix/);
  assert.match(bootstrap, /bash \.devcontainer\/install-local-extension\.sh/);
  assert.match(dockerignore, /!\.devcontainer\/receipt-status\//);
  assert.doesNotMatch(`${dockerfile}\n${bootstrap}`, /marketplace|https?:\/\//i);
});

test('container bootstrap retains final runtime check after preflight and installation', () => {
  const bootstrap = readFileSync(resolve(ROOT, '.devcontainer/post-create.sh'), 'utf8');
  assert.match(bootstrap, /check-runtime-contract\.mjs --current/);
});

test('local extension installer bypasses broken PATH shims and refuses missing or ambiguous server CLIs', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'local-vsix-'));
  const serverRoot = resolve(fixture, 'server with spaces');
  const fakeBin = resolve(fixture, 'fake-bin');
  const trace = resolve(fixture, 'trace');
  const installer = resolve(ROOT, '.devcontainer/install-local-extension.sh');
  const env = { ...process.env, CLERKSHIP_DEVCONTAINER: '1', VSCODE_AGENT_FOLDER: serverRoot, TRACE: trace, PATH: `${fakeBin}:${process.env.PATH}` };
  const run = () => spawnSync('/bin/bash', [installer], { env, encoding: 'utf8' });
  try {
    mkdirSync(fakeBin);
    writeFileSync(resolve(fakeBin, 'code'), '#!/bin/sh\necho broken-shim >> "$TRACE"\nexit 127\n');
    chmodSync(resolve(fakeBin, 'code'), 0o755);
    let result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No VS Code server CLI/);
    const addServer = (id) => {
      const bin = resolve(serverRoot, 'bin', id, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(resolve(bin, 'code-server'), '#!/bin/sh\nprintf "%s\\n" "$@" >> "$TRACE"\n');
      chmodSync(resolve(bin, 'code-server'), 0o755);
    };
    addServer('current');
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), [
      '--extensions-dir', resolve(serverRoot, 'extensions'),
      '--install-extension', '/opt/clerkship-devcontainer-receipt-status.vsix', '--force',
    ]);
    const before = readFileSync(trace, 'utf8');
    addServer('other');
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Ambiguous VS Code server CLI/);
    assert.equal(readFileSync(trace, 'utf8'), before);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
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

function withSmokeScriptFixture(outputDir) {
  const fixture = mkdtempSync(resolve(tmpdir(), 'verify-smoke-output-'));
  const fakeBin = resolve(fixture, 'fake-bin');
  const trace = resolve(fixture, 'npx-args.log');
  try {
    mkdirSync(resolve(fixture, 'bin'), { recursive: true });
    mkdirSync(resolve(fixture, '_build/ms3'), { recursive: true });
    mkdirSync(resolve(fixture, '_build/res'), { recursive: true });
    mkdirSync(resolve(fixture, 'faculty-console'), { recursive: true });
    mkdirSync(resolve(fixture, 'tests/smoke/node_modules'), { recursive: true });
    mkdirSync(fakeBin);
    writeFileSync(
      resolve(fixture, 'bin/verify-smoke.sh'),
      readFileSync(resolve(ROOT, 'bin/verify-smoke.sh')),
    );
    writeFileSync(resolve(fakeBin, 'lsof'), '#!/bin/sh\nexit 1\n');
    writeFileSync(resolve(fakeBin, 'curl'), '#!/bin/sh\nexit 0\n');
    writeFileSync(resolve(fakeBin, 'python3'), '#!/bin/sh\nexec sleep 30\n');
    writeFileSync(resolve(fakeBin, 'npx'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$TRACE"\n');
    for (const path of [
      resolve(fixture, 'bin/verify-smoke.sh'),
      resolve(fakeBin, 'lsof'),
      resolve(fakeBin, 'curl'),
      resolve(fakeBin, 'python3'),
      resolve(fakeBin, 'npx'),
    ]) chmodSync(path, 0o755);

    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, TRACE: trace };
    if (outputDir !== undefined) env.PLAYWRIGHT_OUTPUT_DIR = outputDir;
    const result = spawnSync('/bin/bash', ['bin/verify-smoke.sh'], {
      cwd: fixture, env, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(trace, 'utf8').trim().split('\n');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('ordinary smoke verification keeps the repository Playwright artifact directory', () => {
  const args = withSmokeScriptFixture();
  assert.deepEqual(args.slice(-3), [
    '--reporter=list', '--output', 'test-results/artifacts',
  ]);
});

test('smoke verification passes a hostile-space artifact override as one argument', () => {
  const args = withSmokeScriptFixture('override path/[odd]');
  assert.deepEqual(args.slice(-3), ['--reporter=list', '--output', 'override path/[odd]']);
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
    writeFileSync(resolve(fixture, 'bin/devcontainer-preflight.py'), '');
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
  const fixture = realpathSync(mkdtempSync(resolve(tmpdir(), 'verify-receipt-')));
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
    writeFileSync(resolve(fixture, '.gitignore'), '.venv/\noutput/\ntrace.log\ngate-started.marker\n');
    writeFileSync(resolve(fixture, 'tests/smoke/package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '1.63.0' } }));
    writeFileSync(resolve(fixture, 'bin/devcontainer-preflight.py'), 'import os, sys\nwith open(os.environ["TRACE"], "a") as f: f.write("preflight\\n")\nsys.exit(1 if os.environ.get("FAIL_STAGE") == "preflight" else 0)\n');
    writeFileSync(resolve(fixture, '.venv/bin/python3'), '#!/bin/sh\necho "Python 3.11.9"\n');
    writeFileSync(resolve(fixture, '.devcontainer/install-dependencies.sh'), '#!/bin/bash\necho dependencies >> "$TRACE"\nif [ "${FAIL_STAGE:-}" = dependencies ]; then exit 1; fi\nmkdir -p .venv/bin\nprintf "#!/bin/sh\\necho Python 3.11.9\\n" > .venv/bin/python3\nchmod +x .venv/bin/python3\n');
    writeFileSync(resolve(fixture, 'bin/check-runtime-contract.mjs'), 'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.TRACE, "runtime-contract\\n");\nif (process.env.FAIL_STAGE === "runtime-contract") process.exit(1);\n');
    writeFileSync(resolve(fixture, 'bin/verify.sh'), '#!/bin/bash\nprintf "full-gate:%s\\n" "${PLAYWRIGHT_OUTPUT_DIR-<unset>}" >> "$TRACE"\nif [ "${HANG_STAGE:-}" = full-gate ]; then touch "$MARKER"; exec sleep 30; fi\nif [ "${CHANGE_HEAD:-}" = full-gate ]; then git commit --allow-empty -qm changed-during-attempt; fi\nif [ "${FAIL_STAGE:-}" = full-gate ]; then exit 1; fi\n');
    writeFileSync(resolve(fixture, 'bin/verify-smoke.sh'), '#!/bin/bash\nprintf "nonvisual-smoke:%s:%s\\n" "${SPECS-<unset>}" "${PLAYWRIGHT_OUTPUT_DIR-<unset>}" >> "$TRACE"\nif [ "${FAIL_STAGE:-}" = nonvisual-smoke ]; then exit 1; fi\n');
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

function receiptStatus(fixture, receiptPath) {
  const result = spawnSync(process.execPath, [resolve(fixture, 'bin/devcontainer-receipt.mjs'),
    'status', '--path', receiptPath, '--root', fixture], { cwd: fixture, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
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
    'preflight', 'dependencies', 'runtime-contract', 'full-gate:<unset>',
    'nonvisual-smoke:<unset>:/tmp/clerkship-playwright-artifacts',
  ]);
  assert.equal(existsSync(receiptPath), true, 'the receipt must remain at its normal path');
  assert.match(result.stdout, /Playwright artifacts: \/tmp\/clerkship-playwright-artifacts/);
}));

test('failed preflight revokes old green before dependency installation', () => withVerifierFixture(({ fixture, receiptPath, trace, env, args }) => {
  assert.equal(spawnSync('/bin/bash', args, { cwd: fixture, env }).status, 0);
  writeFileSync(trace, '');
  const result = spawnSync('/bin/bash', args, { cwd: fixture, env: { ...env, FAIL_STAGE: 'preflight' }, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(readFileSync(trace, 'utf8'), 'preflight\n');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.stage, 'preflight');
  assert.equal(receipt.status, 'failed');
  assert.equal(receiptStatus(fixture, receiptPath).state, 'failed');
}));

test('bootstrap refuses failed or unknown preflight before installing dependencies or extensions', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'bootstrap-preflight-'));
  try {
    mkdirSync(resolve(fixture, '.devcontainer'));
    mkdirSync(resolve(fixture, 'bin'));
    const trace = resolve(fixture, 'trace');
    writeFileSync(resolve(fixture, '.devcontainer/post-create.sh'), readFileSync(resolve(ROOT, '.devcontainer/post-create.sh')));
    writeFileSync(resolve(fixture, 'bin/devcontainer-preflight.py'), 'import os, sys\nwith open(os.environ["TRACE"], "a") as f: f.write("preflight\\n")\nsys.exit(int(os.environ["PREFLIGHT_CODE"]))\n');
    for (const step of ['install-dependencies', 'install-local-extension']) {
      writeFileSync(resolve(fixture, `.devcontainer/${step}.sh`), `echo ${step} >> "$TRACE"\n`);
    }
    writeFileSync(resolve(fixture, 'bin/check-runtime-contract.mjs'), 'import {appendFileSync} from "node:fs"; appendFileSync(process.env.TRACE,"runtime\\n");');
    for (const code of [1, 2, 0]) {
      writeFileSync(trace, '');
      const result = spawnSync('/bin/bash', ['.devcontainer/post-create.sh'], {
        cwd: fixture, encoding: 'utf8', env: { ...process.env, CLERKSHIP_DEVCONTAINER: '1', TRACE: trace, PREFLIGHT_CODE: String(code) },
      });
      assert.equal(result.status, code, result.stderr);
      assert.equal(readFileSync(trace, 'utf8'), code === 0
        ? 'preflight\ninstall-dependencies\ninstall-local-extension\nruntime\n' : 'preflight\n');
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('receipt-enabled verifier cannot certify a dirty start after the tracked file is restored', () => withVerifierFixture(({ fixture, receiptPath, head, env, args }) => {
  const tracked = resolve(fixture, 'bin/verify.sh');
  const original = readFileSync(tracked, 'utf8');
  writeFileSync(tracked, `${original}\n# dirty before verification\n`);
  const result = spawnSync('/bin/bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  writeFileSync(tracked, original);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.commit, head);
  assert.equal(receipt.status, 'failed');
  assert.notEqual(receiptStatus(fixture, receiptPath).state, 'verified');
}));

test('receipt-enabled verifier cannot certify a commit created during the attempt', () => withVerifierFixture(({ fixture, receiptPath, head, env, args }) => {
  const result = spawnSync('/bin/bash', args, {
    cwd: fixture, env: { ...env, CHANGE_HEAD: 'full-gate' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  const current = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
  assert.notEqual(current, head);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.commit, head);
  assert.notEqual(receipt.status, 'passed');
  assert.notEqual(receiptStatus(fixture, receiptPath).state, 'verified');
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

test('receipt-enabled verifier rejects missing virtualenv and replaces current green', () => withVerifierFixture(({ fixture, receiptPath, env, args }) => {
  const first = spawnSync('/bin/bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(receiptStatus(fixture, receiptPath).state, 'verified');
  rmSync(resolve(fixture, '.venv/bin/python3'));
  assert.equal(receiptStatus(fixture, receiptPath).state, 'verified', 'the ignored venv is not tracked evidence');

  const result = spawnSync('/bin/bash', ['bin/verify-devcontainer.sh', '--receipt', receiptPath], {
    cwd: fixture, env, encoding: 'utf8',
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /requires the virtualenv/);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.stage, 'dependencies');
  assert.equal(receipt.exitCode, 2);
  assert.notEqual(receiptStatus(fixture, receiptPath).state, 'verified');

  const refreshed = spawnSync('/bin/bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.ok(existsSync(resolve(fixture, '.venv/bin/python3')));
  assert.equal(receiptStatus(fixture, receiptPath).state, 'verified');
}));

test('receipt-enabled verifier refuses outside-container calls without touching prior receipt', () => withVerifierFixture(({ fixture, receiptPath, env, args }) => {
  const first = spawnSync('/bin/bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  const before = readFileSync(receiptPath, 'utf8');
  const result = spawnSync('/bin/bash', ['bin/verify-devcontainer.sh', '--receipt', receiptPath], {
    cwd: fixture, env: { ...env, CLERKSHIP_DEVCONTAINER: '' }, encoding: 'utf8',
  });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(readFileSync(receiptPath, 'utf8'), before);
  assert.equal(receiptStatus(fixture, receiptPath).state, 'verified');
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
