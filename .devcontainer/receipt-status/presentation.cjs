'use strict';

const STALE_REASONS = {
  'receipt-missing-or-unreadable': 'No readable verification receipt',
  'unsupported-schema': 'Unsupported receipt format',
  'invalid-commit': 'Invalid recorded commit',
  'commit-mismatch': 'The current commit has changed',
  'tracked-tree-changed': 'Tracked files have changed',
  'incomplete-pass': 'Verification did not complete',
  'incomplete-proof': 'Verification evidence is incomplete',
  'malformed-receipt': 'The receipt is malformed',
  'verification-running': 'Verification is running',
  'unknown-status': 'The recorded status is unknown',
};
const FAILURE_STAGES = new Set(['startup', 'dependencies', 'runtime-contract', 'full-gate', 'nonvisual-smoke', 'complete']);
const RUNTIME_PATTERNS = {
  node: /^v\d+\.\d+\.\d+$/,
  python: /^Python \d+\.\d+\.\d+$/,
  bash: /^GNU bash(?:, version)? \d+\.\d+(?:\.\d+)?(?:\(\d+\))?(?:-[A-Za-z0-9_.-]+)?(?: \([A-Za-z0-9_.-]+\))?$/,
  playwright: /^\d+\.\d+\.\d+$/,
};

function unavailable() {
  return {
    text: '$(question) Dev Container',
    color: 'disabledForeground',
    tooltip: 'Verification status unavailable. Click to verify again.',
  };
}

function recordedDetails(receipt) {
  const time = typeof receipt?.completedAt === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(receipt.completedAt)
    && Number.isFinite(Date.parse(receipt.completedAt)) ? ` at ${receipt.completedAt}` : '';
  const versions = [];
  for (const [key, prefix] of [['node', 'Node '], ['python', ''], ['bash', ''], ['playwright', 'Playwright ']]) {
    const value = receipt?.runtimes?.[key];
    if (typeof value === 'string' && value.length <= 120 && RUNTIME_PATTERNS[key].test(value)) versions.push(prefix + value);
  }
  return { time, complete: versions.length === 4, runtimes: versions.length ? ` Runtimes: ${versions.join(' · ')}.` : '' };
}

function presentationFor(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)
    || typeof status.shortCommit !== 'string' || !/^(?:[0-9a-f]{7})?$/.test(status.shortCommit)) return unavailable();
  const { shortCommit, reason } = status;
  const details = recordedDetails(status.receipt);
  switch (status.state) {
    case 'verified':
      if (!shortCommit || reason !== 'current-clean-pass' || !details.time || !details.complete) return unavailable();
      return {
        text: `$(pass-filled) Dev Container ${shortCommit}`,
        color: 'testing.iconPassed',
        tooltip: `Dev Container verified for ${shortCommit}${details.time}.${details.runtimes} Click to verify again.`,
      };
    case 'failed':
      if (!shortCommit || !FAILURE_STAGES.has(reason)) return unavailable();
      return {
        text: `$(error) Dev Container ${shortCommit}`,
        color: 'testing.iconFailed',
        tooltip: `Dev Container verification failed for ${shortCommit} (${reason})${details.time}.${details.runtimes} Click to verify again.`,
      };
    case 'stale':
      if (!Object.hasOwn(STALE_REASONS, reason)) return unavailable();
      return {
        text: `$(circle-slash) Dev Container${shortCommit ? ` ${shortCommit}` : ''}`,
        color: 'disabledForeground',
        tooltip: `${STALE_REASONS[reason]}. Verification is stale. Click to verify again.`,
      };
    default:
      return unavailable();
  }
}

module.exports = { presentationFor };
