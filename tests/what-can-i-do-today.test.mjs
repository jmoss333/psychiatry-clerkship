/**
 * bin/what_can_i_do_today.py — the capability-aware work queue.
 *
 * The script exists because sessions here repeatedly picked a task and only then discovered it was
 * impossible in their environment. It joins probe_egress.py's capability map to a per-task
 * measurement of how much work is left.
 *
 * What needs pinning is not the numbers — those move as the work gets done, which is the point —
 * but the invariants that make the queue trustworthy:
 *
 *   · a measurement that FAILS must report `unknown`, NEVER `done`. Zero means finished and would
 *     silently retire real work; that single confusion would make the script worse than nothing.
 *   · a task whose count reaches zero must retire ITSELF, so the queue cannot rot into a stale
 *     checklist that someone has to remember to prune.
 *   · unknown capability must not read as "everything works" — guessing optimistically would
 *     recreate the exact failure the script was written to prevent.
 *   · runnable work must sort above blocked work, or the ranking is decoration.
 *
 * NO TEST HERE TOUCHES THE NETWORK: every subprocess runs with CLERKSHIP_SKIP_EGRESS_PROBE=1, so
 * the probe returns nothing and capability resolves to unknown by design.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'what_can_i_do_today.py');

/** Run the queue with the egress probe disabled, so nothing reaches the network. */
function run(args = []) {
  const proc = spawnSync('python3', [script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
  });
  assert.equal(proc.status, 0, `exited ${proc.status}: ${proc.stderr}`);
  return proc.stdout;
}

/** Evaluate an expression against the imported module. No network, no subprocess of its own. */
function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, "bin")\nimport what_can_i_do_today as W\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

const W_UNKNOWN = 'unknown';
const W_DONE = 'done';

test('a failed measurement reports unknown, never done', () => {
  // The invariant the whole script rests on. `done` retires a task; a moved file, a renamed key
  // or a broken producer must never be able to retire real work by accident.
  const out = py(`
def boom():
    raise FileNotFoundError("registry moved")
status, remaining, total, detail = W.evaluate({"measure": boom, "host": None}, {})
print(status)`);
  assert.equal(out, W_UNKNOWN);
});

test('a task measuring zero retires itself', () => {
  const out = py(`
status, *_ = W.evaluate({"measure": lambda: (0, 10), "host": "podcast"}, {"podcast": "blocked"})
print(status)`);
  // Zero wins over a blocked host: finished work is finished regardless of the network.
  assert.equal(out, W_DONE);
});

test('unknown capability never reads as ready', () => {
  // The failure mode being designed out: assuming a host works because we could not check.
  const out = py(`
status, *_ = W.evaluate({"measure": lambda: (5, 10), "host": "podcast"}, {})
print(status)`);
  assert.equal(out, W_UNKNOWN);
});

test('a task needing no network is ready whatever the environment', () => {
  const out = py(`
status, *_ = W.evaluate({"measure": lambda: (5, 10), "host": None}, {})
print(status)`);
  assert.equal(out, 'ready');
});

test('probe status maps onto task status without collapsing quota into blocked', () => {
  // A quota-capped host is reachable; calling it blocked would retire a task that a key fixes.
  assert.equal(py('print(W.STATUS_FROM_HOST["open"])'), 'ready');
  assert.equal(py('print(W.STATUS_FROM_HOST["quota"])'), 'needs-key');
  assert.equal(py('print(W.STATUS_FROM_HOST["auth"])'), 'needs-auth');
  assert.equal(py('print(W.STATUS_FROM_HOST["blocked"])'), 'blocked');
  assert.notEqual(py('print(W.STATUS_FROM_HOST["quota"])'), py('print(W.STATUS_FROM_HOST["blocked"])'));
});

test('runnable work outranks blocked work, and finished work sorts last', () => {
  const r = py('print(W.RANK["ready"] < W.RANK["needs-key"] < W.RANK["blocked"] < W.RANK["done"])');
  assert.equal(r, 'True');
});

test('every task carries a measurement, a unit, a rationale and a way to start', () => {
  // A queue that says what is possible without saying how to begin has moved the problem.
  const n = Number(py('print(len(W.TASKS))'));
  assert.ok(n >= 5, `expected a real task list, got ${n}`);
  for (const field of ['measure', 'unit', 'why', 'do', 'title', 'key']) {
    assert.equal(Number(py(`print(sum(1 for t in W.TASKS if t.get(${JSON.stringify(field)})))`)), n,
      `every task needs a ${field}`);
  }
  // `host` is either None or a probe_egress key — a typo here would silently read as unknown.
  const keys = JSON.parse(py(`
import json, subprocess, sys
out = subprocess.run([sys.executable, "bin/probe_egress.py", "--targets"],
                     capture_output=True, text=True)
print(json.dumps([l.split()[0] for l in out.stdout.splitlines() if l and not l.startswith(" ")]))`));
  const hosts = JSON.parse(py('import json; print(json.dumps([t["host"] for t in W.TASKS]))'));
  for (const h of hosts) {
    if (h !== null) assert.ok(keys.includes(h), `${h} is not a probe_egress target key`);
  }
});

test('task keys are unique', () => {
  assert.equal(py('print(len({t["key"] for t in W.TASKS}) == len(W.TASKS))'), 'True');
});

test('the report runs, ranks, and names what is runnable', () => {
  const out = run();
  assert.match(out, /what can I do today/);
  assert.match(out, /task\(s\) runnable right now/);
});

test('--json is machine-readable and carries the capability it used', () => {
  const blob = JSON.parse(run(['--json']));
  assert.ok(Array.isArray(blob.tasks) && blob.tasks.length >= 5);
  assert.ok('capability' in blob, 'consumers need to see what capability the ranking assumed');
  for (const t of blob.tasks) {
    for (const field of ['key', 'status', 'remaining', 'unit', 'detail', 'why', 'do']) {
      assert.ok(field in t, `task ${t.key} missing ${field}`);
    }
  }
});

test('--why explains one task and rejects an unknown key', () => {
  const key = JSON.parse(run(['--json'])).tasks[0].key;
  assert.match(run(['--why', key]), /why this matters[\s\S]*how to start/);
  const bad = spawnSync('python3', [script, '--why', 'no-such-task'], {
    cwd: repo, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
  });
  assert.equal(bad.status, 2, 'an unknown key is a usage error');
});

test('it carries no machine-specific paths', () => {
  assert.doesNotMatch(fs.readFileSync(script, 'utf8'), /\/(Users|sessions)\/[a-z]/);
});
