// bin/prune_remote_branches.py's one decision, pinned (R7, 2026-10-17). The tool is report-only
// by default and deletes only with --apply from the owner's Mac; this test never touches git or
// the network — it drives classify() through python3 -c, as the repo does for other Python
// modules whose --self-test would need its own verify.sh step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function classifyAll(cases) {
  const py = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'bin'))})`,
    'from prune_remote_branches import classify',
    'cases = json.loads(sys.stdin.read())',
    'print(json.dumps([classify(c["branch"], c["inMain"], c["age"], c["pr"], c["days"]) for c in cases]))',
  ].join('\n');
  const r = spawnSync('python3', ['-c', py], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("classify(): GitHub's PR state is the authority; reachability from main is only a second way to say merged", () => {
  const d = 30;
  const cases = [
    { branch: 'main', inMain: true, age: 400, pr: 'none', days: d },
    { branch: 'release', inMain: true, age: 400, pr: 'none', days: d },
    { branch: 'attest/pending', inMain: false, age: 1, pr: 'open', days: d },
    { branch: 'attestations', inMain: false, age: 90, pr: 'none', days: d },
    { branch: 'claude/open-work', inMain: false, age: 2, pr: 'open', days: d },
    { branch: 'claude/merged-but-reopened', inMain: true, age: 60, pr: 'open', days: d },
    { branch: 'backup/july', inMain: true, age: 100, pr: 'merged', days: d },
    { branch: 'claude/merged-yesterday-squashed', inMain: false, age: 1, pr: 'merged', days: d },
    { branch: 'claude/merged-last-month-squashed', inMain: false, age: 31, pr: 'merged', days: d },
    { branch: 'claude/merged-by-merge-commit', inMain: true, age: 45, pr: 'merged', days: d },
    { branch: 'claude/in-main-but-gh-saw-no-pr', inMain: true, age: 45, pr: 'none', days: d },
    { branch: 'codex/closed-unmerged', inMain: false, age: 45, pr: 'closed', days: d },
    { branch: 'audit/never-had-a-pr', inMain: false, age: 100, pr: 'none', days: d },
    { branch: 'claude/gh-unavailable', inMain: true, age: 90, pr: null, days: d },
    { branch: 'claude/exactly-30', inMain: false, age: 30, pr: 'merged', days: d },
  ];
  assert.deepEqual(classifyAll(cases), [
    'protected', 'protected', 'protected', 'protected',
    'open-pr', 'open-pr', 'backup',
    'fresh', 'prunable', 'prunable', 'prunable',
    'closed-pr', 'no-pr', 'unknown-pr', 'prunable',
  ]);
});

test('--days moves the fresh/prunable boundary and nothing else', () => {
  const base = { branch: 'claude/x', inMain: false, pr: 'merged' };
  assert.deepEqual(classifyAll([
    { ...base, age: 10, days: 14 }, { ...base, age: 14, days: 14 }, { ...base, age: 10, days: 7 },
  ]), ['fresh', 'prunable', 'prunable']);
});
