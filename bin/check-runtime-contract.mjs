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

function setupActionVersions(source, action, versionPattern) {
  const lines = source.split(/\r?\n/);
  const steps = [];
  const usesPattern = new RegExp(`uses:\\s*actions\\/${action}@`);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith('#') || !usesPattern.test(line)) continue;
    const usesIndent = line.match(/^\s*/)[0].length;
    const inlineStep = line.match(/^(\s*)-\s+uses:/);
    const stepIndent = inlineStep ? inlineStep[1].length : Math.max(0, usesIndent - 2);
    const versions = [];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (candidate.trimStart().startsWith('#') || candidate.trim() === '') continue;
      const nextStep = candidate.match(/^(\s*)-\s+/);
      if (nextStep && nextStep[1].length <= stepIndent) break;
      const match = candidate.match(versionPattern);
      if (match) versions.push(match[1]);
    }
    steps.push(versions);
  }
  return steps;
}

export function nodeDeclarationErrors(label, source, expectedMajor) {
  const steps = setupActionVersions(
    source,
    'setup-node',
    /^\s*node-version:\s*["']?(\d+)["']?\s*(?:#.*)?$/,
  );
  const found = steps.flat().map(Number);
  const errors = [];
  if (found.length !== steps.length) {
    errors.push(`${label} has ${steps.length} setup-node step(s) but ${found.length} literal node-version declaration(s)`);
  } else if (steps.some((versions) => versions.length !== 1)) {
    errors.push(`${label} must bind exactly one literal node-version to each setup-node step`);
  }
  errors.push(...found
    .filter((major) => major !== expectedMajor)
    .map((major) => `${label} declares Node ${major}; expected Node ${expectedMajor}`));
  return errors;
}

export function pythonDeclarationErrors(label, source, expectedVersion) {
  const steps = setupActionVersions(
    source,
    'setup-python',
    /^\s*python-version:\s*["']?([0-9]+\.[0-9]+)["']?\s*(?:#.*)?$/,
  );
  const found = steps.flat();
  const errors = [];
  if (found.length !== steps.length) {
    errors.push(`${label} has ${steps.length} setup-python step(s) but ${found.length} literal python-version declaration(s)`);
  } else if (steps.some((versions) => versions.length !== 1)) {
    errors.push(`${label} must bind exactly one literal python-version to each setup-python step`);
  }
  errors.push(...found
    .filter((version) => version !== expectedVersion)
    .map((version) => `${label} declares Python ${version}; expected ${expectedVersion}`));
  return errors;
}

export function netlifyNodeDeclarationErrors(label, source, expectedMajor) {
  const found = source.split(/\r?\n/).flatMap((line) => {
    if (line.trimStart().startsWith('#')) return [];
    const match = line.match(/^\s*NODE_VERSION\s*=\s*"(\d+)"\s*(?:#.*)?$/);
    return match ? [Number(match[1])] : [];
  });
  if (found.length !== 1) {
    return [`${label} has ${found.length} active NODE_VERSION declarations; expected exactly 1`];
  }
  return found[0] === expectedMajor
    ? []
    : [`${label} declares Node ${found[0]}; expected Node ${expectedMajor}`];
}

export function declaredRuntimeErrors(root = ROOT) {
  const contract = contractAt(root);
  const errors = [];
  const workflowDir = resolve(root, '.github/workflows');

  for (const name of readdirSync(workflowDir).filter((value) => /\.ya?ml$/.test(value)).sort()) {
    const relative = `.github/workflows/${name}`;
    const source = readFileSync(resolve(root, relative), 'utf8');
    errors.push(...nodeDeclarationErrors(relative, source, contract.nodeMajor));
    errors.push(...pythonDeclarationErrors(relative, source, contract.pythonMajorMinor));
  }

  for (const relative of NETLIFY_FILES) {
    const source = readFileSync(resolve(root, relative), 'utf8');
    const expected = contract.nodeExceptions[relative] ?? contract.nodeMajor;
    errors.push(...netlifyNodeDeclarationErrors(relative, source, expected));
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
  if (!/^\d+$/.test(String(observed.bash))) {
    errors.push(`current Bash is ${observed.bash}; expected an integer major of ${contract.bashMinimumMajor} or later`);
  } else if (Number(observed.bash) < contract.bashMinimumMajor) {
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
  let expectedPlaywright;
  try {
    contract = contractAt(ROOT);
    errors = declaredRuntimeErrors(ROOT);
    expectedPlaywright = json(resolve(ROOT, 'tests/smoke/package.json')).devDependencies['@playwright/test'];
  } catch (error) {
    console.error(`runtime contract unreadable: ${error.message}`);
    return 2;
  }
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
