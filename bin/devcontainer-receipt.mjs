import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const REQUIRED_PROOF = ['runtimeContract', 'fullGate', 'nonvisualSmoke'];
const RUNTIME_KEYS = ['node', 'python', 'bash', 'playwright'];
const STAGES = new Set(['startup', 'dependencies', 'runtime-contract', 'full-gate', 'nonvisual-smoke', 'complete']);
const DEPLOY_PROOF = 'not-proved-without-deploy-url';
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const RECEIPT_KEYS = ['schemaVersion', 'status', 'commit', 'startedAt', 'completedAt', 'stage', 'exitCode', 'runtimes', 'proof'];
const RUNTIME_PATTERNS = {
  node: /^v\d+\.\d+\.\d+$/,
  python: /^Python \d+\.\d+\.\d+$/,
  bash: /^GNU bash, version \d+\.\d+(?:\.\d+)?(?:\(\d+\))?(?:-[A-Za-z0-9_.-]+)?(?: \([A-Za-z0-9_.-]+\))?$/,
  playwright: /^\d+\.\d+\.\d+$/,
};
const UNKNOWN_COMMIT = '0'.repeat(40);
const UNKNOWN_RUNTIMES = Object.freeze({
  node: 'v0.0.0', python: 'Python 0.0.0', bash: 'GNU bash, version 0.0.0', playwright: '0.0.0',
});

class UsageError extends Error {}

function onlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function isIso(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isRuntime(key, value) {
  return typeof value === 'string' && value.length <= 120 && RUNTIME_PATTERNS[key].test(value);
}

export function buildReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('receipt must be an object');
  if (input.schemaVersion !== undefined && input.schemaVersion !== SCHEMA_VERSION) throw new TypeError('unsupported schema');
  const { status, commit, startedAt, completedAt, stage, exitCode } = input;
  if (!['running', 'passed', 'failed'].includes(status)) throw new TypeError('invalid receipt status');
  if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) throw new TypeError('invalid commit');
  if (!isIso(startedAt) || (completedAt != null && !isIso(completedAt))) throw new TypeError('invalid timestamp');
  if (!STAGES.has(stage)) throw new TypeError('invalid stage');
  if (!Number.isInteger(exitCode) || exitCode < 0) throw new TypeError('invalid exit code');
  if (status === 'passed' && (stage !== 'complete' || exitCode !== 0 || !isIso(completedAt))) throw new TypeError('incomplete passed receipt');
  if (status === 'failed' && (exitCode === 0 || !isIso(completedAt))) throw new TypeError('incomplete failed receipt');

  const runtimes = {};
  for (const key of RUNTIME_KEYS) {
    if (!isRuntime(key, input.runtimes?.[key])) throw new TypeError(`invalid runtime: ${key}`);
    runtimes[key] = input.runtimes[key];
  }
  const proof = {};
  for (const key of REQUIRED_PROOF) {
    const value = input.proof?.[key];
    if (status === 'passed' && value !== 'passed') throw new TypeError(`incomplete proof: ${key}`);
    if (value !== undefined) {
      if (!['passed', 'failed', 'not-run'].includes(value)) throw new TypeError(`invalid proof: ${key}`);
      proof[key] = value;
    }
  }
  proof.deployLfsBrowserCoverage = DEPLOY_PROOF;
  return {
    schemaVersion: SCHEMA_VERSION,
    status,
    commit,
    startedAt,
    completedAt: completedAt ?? null,
    stage,
    exitCode,
    runtimes,
    proof,
  };
}

export function writeReceiptAtomic(path, receipt) {
  const safeReceipt = buildReceipt(receipt);
  mkdirSync(dirname(path), { recursive: true });
  const temp = resolve(dirname(path), `.${randomBytes(12).toString('hex')}.tmp`);
  try {
    writeFileSync(temp, JSON.stringify(safeReceipt, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export function evaluateReceipt({ receipt, head, trackedDirty }) {
  const shortCommit = typeof head === 'string' ? head.slice(0, 7) : '';
  const stale = (reason) => ({ state: 'stale', reason, shortCommit, receipt });
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return stale('receipt-missing-or-unreadable');
  if (receipt.schemaVersion !== SCHEMA_VERSION) return stale('unsupported-schema');
  if (typeof receipt.commit !== 'string' || !COMMIT_PATTERN.test(receipt.commit)) return stale('invalid-commit');
  if (receipt.commit !== head) return stale('commit-mismatch');
  if (trackedDirty) return stale('tracked-tree-changed');
  if (receipt.status === 'passed' && (receipt.exitCode !== 0 || receipt.stage !== 'complete')) return stale('incomplete-pass');
  if (receipt.status === 'passed' && (!receipt.proof || REQUIRED_PROOF.some((key) => receipt.proof[key] !== 'passed'))) return stale('incomplete-proof');
  if (!onlyKeys(receipt, RECEIPT_KEYS)
    || !onlyKeys(receipt.runtimes, RUNTIME_KEYS)
    || !onlyKeys(receipt.proof, [...REQUIRED_PROOF, 'deployLfsBrowserCoverage'])
    || receipt.proof.deployLfsBrowserCoverage !== DEPLOY_PROOF) return stale('malformed-receipt');
  try { buildReceipt(receipt); } catch { return stale('malformed-receipt'); }
  if (receipt.status === 'failed') return { state: 'failed', reason: receipt.stage, shortCommit, receipt };
  if (receipt.status !== 'passed') return stale(receipt.status === 'running' ? 'verification-running' : 'unknown-status');
  return { state: 'verified', reason: 'current-clean-pass', shortCommit, receipt };
}

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

function parseFlags(command, args) {
  const allowed = command === 'record'
    ? new Set(['path', 'status', 'stage', 'exit-code', 'started-at'])
    : new Set(['path', 'root']);
  const required = command === 'record'
    ? ['path', 'status', 'stage', 'exit-code']
    : ['path', 'root'];
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || Object.hasOwn(flags, flag.slice(2))
      || value === undefined || value === '' || value.startsWith('--')) throw new UsageError('invalid CLI flags');
    flags[flag.slice(2)] = value;
  }
  if (required.some((key) => !Object.hasOwn(flags, key))) throw new UsageError('missing CLI flag');
  return flags;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function isDirty(root, args) {
  try {
    git(root, args);
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function readReceipt(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function validateRecordFlags(flags) {
  const status = flags.status;
  const stage = flags.stage;
  const exitCode = Number(flags['exit-code']);
  if (!['running', 'passed', 'failed'].includes(status) || !STAGES.has(stage)
    || !/^\d+$/.test(flags['exit-code']) || !Number.isSafeInteger(exitCode)
    || (flags['started-at'] !== undefined && !isIso(flags['started-at']))
    || (status === 'passed' && (stage !== 'complete' || exitCode !== 0))
    || (status === 'failed' && exitCode === 0)
    || (status === 'running' && exitCode !== 0)) throw new UsageError('invalid record arguments');
  return { status, stage, exitCode };
}

function record(flags) {
  const { status, stage, exitCode } = validateRecordFlags(flags);
  const root = process.cwd();
  const prior = readReceipt(flags.path);
  const markerStart = flags['started-at'] ?? new Date().toISOString();
  writeReceiptAtomic(flags.path, {
    status: 'running', commit: UNKNOWN_COMMIT, startedAt: markerStart, completedAt: null,
    stage, exitCode: 0, runtimes: UNKNOWN_RUNTIMES, proof: {},
  });
  const commit = git(root, ['rev-parse', 'HEAD']);
  const startedAt = flags['started-at'] ?? (prior?.commit === commit && prior?.status === 'running' && isIso(prior.startedAt)
    ? prior.startedAt : markerStart);
  const completedAt = status === 'running' ? null : new Date().toISOString();
  const proof = {};
  if (status === 'passed') {
    for (const key of REQUIRED_PROOF) proof[key] = 'passed';
  } else if (status === 'failed') {
    const completed = {
      'runtime-contract': [],
      'full-gate': ['runtimeContract'],
      'nonvisual-smoke': ['runtimeContract', 'fullGate'],
      complete: REQUIRED_PROOF,
    }[stage] ?? [];
    for (const key of completed) proof[key] = 'passed';
  }
  const receipt = buildReceipt({ status, commit, startedAt, completedAt, stage, exitCode,
    runtimes: collectRuntimes(root), proof });
  writeReceiptAtomic(flags.path, receipt);
}

function status(flags) {
  let receipt = readReceipt(flags.path);
  let head = '';
  let trackedDirty = true;
  try {
    head = git(flags.root, ['rev-parse', 'HEAD']);
    trackedDirty = isDirty(flags.root, ['diff', '--quiet']) || isDirty(flags.root, ['diff', '--cached', '--quiet']);
  } catch {
    receipt = null;
  }
  const result = evaluateReceipt({ receipt, head, trackedDirty });
  // A malformed file can never echo arbitrary content to the status consumer.
  try { result.receipt = receipt === null ? null : buildReceipt(receipt); } catch { result.receipt = null; }
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command !== 'record' && command !== 'status') {
    process.stderr.write('usage: devcontainer-receipt.mjs record|status [flags]\n');
    process.exitCode = 2;
  } else {
    try {
      const flags = parseFlags(command, process.argv.slice(3));
      if (command === 'record') record(flags);
      else status(flags);
    } catch (error) {
      if (error instanceof UsageError) {
        process.stderr.write('invalid receipt arguments\n');
        process.exitCode = 2;
      } else {
        process.stderr.write(`receipt ${command} failed: tool or filesystem error\n`);
        process.exitCode = 1;
      }
    }
  }
}
