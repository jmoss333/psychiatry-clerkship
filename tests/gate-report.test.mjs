// Gate telemetry (R2, 2026-10-17). Two contracts:
//   1. bin/verify.sh's step() — extracted verbatim, as tests/verify-tmp-sandbox.test.mjs does —
//      appends one well-formed JSON line per step to $VERIFY_LEDGER when a run declares one, and
//      writes nothing when none is declared (so the sandbox harness never pollutes a real ledger).
//      Its stdout stays byte-identical to the pinned PASS/FAIL/LEAK lines; nothing goes to stderr.
//   2. bin/gate_report.py turns a ledger into the three answers: slowest steps by median, steps
//      that failed and when, steps that never failed — and reports UNKNOWN, never zero, for a
//      missing or empty ledger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY = path.join(ROOT, 'bin', 'verify.sh');
const REPORT = path.join(ROOT, 'bin', 'gate_report.py');
const BASH = process.env.BASH || 'bash';

function tmp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function stepFunction() {
  const source = fs.readFileSync(VERIFY, 'utf8');
  const match = source.match(/^step\(\) \{\n[\s\S]*?\n\}$/m);
  assert.ok(match, 'bin/verify.sh no longer defines step()');
  return match[0];
}

function runSteps(t, env) {
  const script = [
    'set -uo pipefail',
    `REPO=${JSON.stringify(ROOT)}`,
    'FAILED=()',
    stepFunction(),
    'step "passes quickly" sh -c "exit 0"',
    'step "fails with \\"quotes\\"" sh -c "exit 3"',
    'printf "FAILED=%s\\n" "${#FAILED[@]}"',
    'printf "RECORDED=%s\\n" "${#STEP_SECS[@]}"',
  ].join('\n');
  const work = tmp(t, 'gate-telemetry-tmp');
  return spawnSync(BASH, ['-c', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: `${work}/`, ...env },
  });
}

test("step() records one JSON line per step when VERIFY_LEDGER is set, and keeps its stdout", (t) => {
  const dir = tmp(t, 'gate-telemetry');
  const ledger = path.join(dir, 'ledger.jsonl');
  const run = runSteps(t, { VERIFY_LEDGER: ledger, VERIFY_RUN_ID: 'run-1' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '', 'telemetry must not write to stderr');
  assert.match(run.stdout, /^ {2}PASS {2}passes quickly/m);
  assert.match(run.stdout, /^ {2}FAIL {2}fails with "quotes" +\(exit 3\)$/m);
  assert.match(run.stdout, /^FAILED=1$/m);
  assert.match(run.stdout, /^RECORDED=2$/m);
  const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => [l.type, l.run, l.step, l.exit, l.leak]), [
    ['step', 'run-1', 'passes quickly', 0, false],
    ['step', 'run-1', 'fails with "quotes"', 3, false],
  ]);
  for (const l of lines) {
    assert.equal(typeof l.seconds, 'number');
    assert.ok(l.seconds >= 0 && l.seconds < 60, `seconds looks wrong: ${l.seconds}`);
    assert.match(l.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  }
});

test('step() writes no ledger when none is declared (the sandbox harness case)', (t) => {
  const dir = tmp(t, 'gate-telemetry-none');
  const run = runSteps(t, { HOME: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.match(run.stdout, /^RECORDED=2$/m);
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing may be written under HOME without VERIFY_LEDGER');
});

function report(args) {
  return spawnSync('python3', [REPORT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

const NOW = '2026-10-17T12:00:00Z';
function rec(day, step, seconds, exit = 0, leak = false, run = 'r') {
  return JSON.stringify({ type: 'step', run, ts: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`,
    step, seconds, exit, leak });
}

test('gate_report.py ranks by median, names what failed and what never did, within the window', (t) => {
  const dir = tmp(t, 'gate-report');
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, [
    rec(10, 'build ms3', 120.0), rec(11, 'build ms3', 130.0), rec(12, 'build ms3', 125.0),
    rec(10, 'span audit', 2.0), rec(11, 'span audit', 2.5, 1), rec(12, 'span audit', 2.1),
    rec(10, 'quick unit', 0.3), rec(11, 'quick unit', 0.4, 0, true),
    rec(1, 'ancient step', 999.0, 1),                       // 2026-10-01: outside a 7-day window
    'not json at all',
    JSON.stringify({ type: 'run', run: 'r', ts: '2026-10-12T08:05:00Z', quick: 0, steps: 3, failed: 0, seconds: 300.5 }),
    JSON.stringify({ type: 'run', run: 'q', ts: '2026-10-12T09:05:00Z', quick: 1, steps: 2, failed: 0, seconds: 20.0 }),
  ].join('\n') + '\n');

  const r = report(['--ledger', ledger, '--days', '8', '--now', NOW, '--json']);
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.status, 'ok');
  assert.equal(rep.malformed_lines, 1);
  assert.equal(rep.runs, 2);
  assert.equal(rep.full_runs, 1);
  assert.equal(rep.full_run_median_s, 300.5);
  assert.deepEqual(rep.slowest.map((s) => s.step), ['build ms3', 'span audit', 'quick unit']);
  assert.equal(rep.slowest[0].median_s, 125);
  assert.deepEqual(rep.failing.map((s) => [s.step, s.fails, s.runs, s.last_fail, s.leaks]), [
    ['quick unit', 1, 2, '2026-10-11', 1],
    ['span audit', 1, 3, '2026-10-11', 0],
  ]);
  assert.deepEqual(rep.never_failed, ['build ms3']);
  assert.ok(!JSON.stringify(rep).includes('ancient step'), 'records outside the window are ignored');

  const text = report(['--ledger', ledger, '--days', '8', '--now', NOW]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /slowest 3 steps/);
  assert.match(text.stdout, /NEVER failed in the window: 1 of 3/);
  assert.match(text.stdout, /1 malformed line/);
});

test('gate_report.py says UNKNOWN for a missing or empty ledger, never zero', (t) => {
  const dir = tmp(t, 'gate-report-empty');
  const missing = report(['--ledger', path.join(dir, 'nope.jsonl'), '--json']);
  assert.equal(missing.status, 0);
  assert.equal(JSON.parse(missing.stdout).status, 'unknown');
  const empty = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(empty, '\n');
  const e = report(['--ledger', empty]);
  assert.equal(e.status, 0);
  assert.match(e.stdout, /^gate report: UNKNOWN/);
});
