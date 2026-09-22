import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
