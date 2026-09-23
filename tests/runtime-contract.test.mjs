import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import {
  declaredRuntimeErrors,
  nodeDeclarationErrors,
  pythonDeclarationErrors,
  netlifyNodeDeclarationErrors,
  currentRuntimeErrors,
} from '../bin/check-runtime-contract.mjs';

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
