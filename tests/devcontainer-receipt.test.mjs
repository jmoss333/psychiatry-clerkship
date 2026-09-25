import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReceipt, evaluateReceipt, writeReceiptAtomic } from '../bin/devcontainer-receipt.mjs';
import { scrubInheritedGitEnv } from './_git_env.mjs';

// Builds git repositories: an inherited GIT_DIR would aim them at the repo running this file.
scrubInheritedGitEnv();

const RECEIPT_CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/devcontainer-receipt.mjs');
const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);
const ISO = '2026-09-23T12:00:00.000Z';

function validReceipt(overrides = {}) {
  return {
    schemaVersion: 1,
    status: 'passed',
    commit: COMMIT,
    startedAt: ISO,
    completedAt: ISO,
    stage: 'complete',
    exitCode: 0,
    runtimes: { node: 'v22.1.0', python: 'Python 3.11.9', bash: 'GNU bash, version 5.2', playwright: '1.63.0' },
    proof: { runtimeContract: 'passed', fullGate: 'passed', nonvisualSmoke: 'passed', deployLfsBrowserCoverage: 'not-proved-without-deploy-url' },
    ...overrides,
  };
}

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

test('a pass cannot claim deploy coverage or carry unrecognized receipt fields', () => {
  const badCoverage = validReceipt({ proof: { ...validReceipt().proof, deployLfsBrowserCoverage: 'passed' } });
  assert.equal(evaluateReceipt({ receipt: badCoverage, head: COMMIT, trackedDirty: false }).state, 'stale');
  const extraField = validReceipt({ secret: 'SECRET_SENTINEL' });
  assert.equal(evaluateReceipt({ receipt: extraField, head: COMMIT, trackedDirty: false }).state, 'stale');
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

test('builder allowlists fields and rejects incomplete passed evidence', () => {
  const input = validReceipt({ secret: 'SECRET_SENTINEL', runtimes: { ...validReceipt().runtimes, secret: 'SECRET_SENTINEL' }, proof: { ...validReceipt().proof, secret: 'SECRET_SENTINEL' } });
  const receipt = buildReceipt(input);
  assert.deepEqual(receipt, validReceipt());
  for (const changed of [
    { commit: 'BAD' },
    { startedAt: 'yesterday' },
    { exitCode: '0' },
    { runtimes: { node: 'v22' } },
    { runtimes: { ...validReceipt().runtimes, node: 'SECRET_SENTINEL' } },
    { runtimes: { ...validReceipt().runtimes, playwright: 'SECRET_SENTINEL' } },
    { proof: { runtimeContract: 'passed' } },
  ]) {
    assert.throws(() => buildReceipt({ ...validReceipt(), ...changed }));
  }
});

test('atomic replacement leaves one complete receipt and no temporary sibling', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'receipt-atomic-'));
  try {
    const path = resolve(dir, 'nested', 'verification-receipt.json');
    writeReceiptAtomic(path, buildReceipt(validReceipt()));
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), validReceipt());
    const failed = buildReceipt(validReceipt({ status: 'failed', stage: 'full-gate', exitCode: 1 }));
    writeReceiptAtomic(path, failed);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), failed);
    assert.deepEqual(readdirSync(dirname(path)), ['verification-receipt.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function withRepo(run) {
  const repo = mkdtempSync(resolve(tmpdir(), 'receipt-git-'));
  try {
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['config', 'user.name', 'Synthetic Tester'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'synthetic@example.invalid'], { cwd: repo });
    writeFileSync(resolve(repo, 'tracked.txt'), 'original\n');
    execFileSync('git', ['add', 'tracked.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'initial'], { cwd: repo });
    mkdirSync(resolve(repo, 'tests/smoke'), { recursive: true });
    writeFileSync(resolve(repo, 'tests/smoke/package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '1.63.0' } }));
    return run(repo, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim());
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function runStatus(repo, receiptPath) {
  const result = spawnSync(process.execPath, [RECEIPT_CLI, 'status', '--path', receiptPath, '--root', repo], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runRecord(repo, receiptPath, status, stage, exitCode, extra = {}) {
  return spawnSync(process.execPath, [RECEIPT_CLI, 'record', '--path', receiptPath, '--status', status,
    '--stage', stage, '--exit-code', String(exitCode), ...extra.flags ?? []], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, SECRET_SENTINEL: 'never-write-this-value', ...extra.env },
  });
}

test('status command detects both unstaged and staged tracked changes', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeReceiptAtomic(receiptPath, buildReceipt(validReceipt({ commit: head })));
  assert.equal(runStatus(repo, receiptPath).state, 'verified');

  writeFileSync(resolve(repo, 'tracked.txt'), 'unstaged\n');
  assert.equal(runStatus(repo, receiptPath).state, 'stale');
  assert.equal(runStatus(repo, receiptPath).reason, 'tracked-tree-changed');

  execFileSync('git', ['add', 'tracked.txt'], { cwd: repo });
  assert.equal(runStatus(repo, receiptPath).state, 'stale');
  assert.equal(runStatus(repo, receiptPath).reason, 'tracked-tree-changed');
}));

test('record preserves the attempt commit and time, captures runtimes, and omits environment values', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  const startedAt = '2026-09-23T11:00:00Z';
  let result = runRecord(repo, receiptPath, 'running', 'dependencies', 0, { flags: ['--started-at', startedAt] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), head);
  assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).startedAt, startedAt);

  result = runRecord(repo, receiptPath, 'passed', 'complete', 0, { flags: ['--commit', head] });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.startedAt, startedAt);
  assert.deepEqual(Object.keys(receipt.runtimes), ['node', 'python', 'bash', 'playwright']);
  assert.equal(receipt.proof.nonvisualSmoke, 'passed');
  assert.equal(readFileSync(receiptPath, 'utf8').includes('never-write-this-value'), false);
}));

test('a dirty-start failure cannot later be promoted to passed after restoration', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeFileSync(resolve(repo, 'tracked.txt'), 'dirty at start\n');
  let result = runRecord(repo, receiptPath, 'running', 'startup', 0);
  assert.notEqual(result.status, 0);
  writeFileSync(resolve(repo, 'tracked.txt'), 'original\n');

  result = runRecord(repo, receiptPath, 'passed', 'complete', 0, { flags: ['--commit', head] });
  assert.notEqual(result.status, 0);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.notEqual(runStatus(repo, receiptPath).state, 'verified');
}));

test('a controlled failed fixture may replace passed evidence but cannot create a pass', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeReceiptAtomic(receiptPath, validReceipt({ commit: head }));
  const result = runRecord(repo, receiptPath, 'failed', 'full-gate', 23, { flags: ['--commit', head] });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.exitCode, 23);
  assert.equal(runStatus(repo, receiptPath).state, 'failed');
}));

test('CLI rejects unknown and duplicate flags and degrades Git errors to stale', () => withRepo((repo) => {
  const receiptPath = resolve(repo, 'receipt.json');
  assert.equal(runRecord(repo, receiptPath, 'running', 'dependencies', 0, { flags: ['--unexpected', 'x'] }).status, 2);
  assert.equal(runRecord(repo, receiptPath, 'running', 'dependencies', 0, { flags: ['--stage', 'complete'] }).status, 2);
  assert.equal(runStatus(repo, resolve(repo, 'missing.json')).state, 'stale');
  const result = spawnSync(process.execPath, [RECEIPT_CLI, 'status', '--path', receiptPath, '--root', resolve(repo, 'missing')], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).state, 'stale');
}));

test('status never republishes malformed or unsupported receipt content', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeFileSync(receiptPath, JSON.stringify({ ...validReceipt({ commit: head }), schemaVersion: 2, secret: 'SECRET_SENTINEL' }));
  const result = runStatus(repo, receiptPath);
  assert.equal(result.state, 'stale');
  assert.equal(result.reason, 'unsupported-schema');
  assert.equal(result.receipt, null);
}));

test('a failed runtime probe invalidates an earlier verified receipt and exits as a tool failure', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeReceiptAtomic(receiptPath, validReceipt({ commit: head }));
  assert.equal(runStatus(repo, receiptPath).state, 'verified');
  writeFileSync(resolve(repo, 'tests/smoke/package.json'), '{}');

  const result = runRecord(repo, receiptPath, 'running', 'startup', 0);
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /usage|invalid.*argument/i);
  const residue = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(residue.schemaVersion, 1);
  assert.equal(residue.status, 'running');
  assert.equal(runStatus(repo, receiptPath).state, 'stale');
}));

test('a failed Git probe also leaves an in-progress stale receipt', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeReceiptAtomic(receiptPath, validReceipt({ commit: head }));
  const fakeBin = resolve(repo, 'fake-bin');
  mkdirSync(fakeBin);
  const fakeGit = resolve(fakeBin, 'git');
  writeFileSync(fakeGit, '#!/bin/sh\nexit 127\n');
  chmodSync(fakeGit, 0o755);

  const result = runRecord(repo, receiptPath, 'running', 'startup', 0, { env: { PATH: `${fakeBin}:${process.env.PATH}` } });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).status, 'running');
  assert.equal(runStatus(repo, receiptPath).state, 'stale');
}));

test('invalid record arguments leave prior verified evidence untouched', () => withRepo((repo, head) => {
  const receiptPath = resolve(repo, 'receipt.json');
  writeReceiptAtomic(receiptPath, validReceipt({ commit: head }));
  const before = readFileSync(receiptPath, 'utf8');
  const result = runRecord(repo, receiptPath, 'passed', 'complete', 0, { flags: ['--started-at', 'not-a-date'] });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(readFileSync(receiptPath, 'utf8'), before);
  assert.equal(runStatus(repo, receiptPath).state, 'verified');
}));
