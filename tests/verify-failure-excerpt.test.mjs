// bin/verify.sh must NAME the test that failed. Until 2026-09-24 a failed step printed only
// `tail -15` of its output; for `node --test` that is the TAP summary counters (`# tests` …
// `# duration_ms`), because node's TAP reporter reports each failure inline and never recaps
// it. The root suite is ~2,800 tests, so a pre-push run aborted by a load-sensitive flake in
// tests/preview-site.test.mjs could not say which test it was.
//
// Every fixture here is REAL node:test output, produced by running `node --test` on a small
// suite — not hand-written TAP — so a change to node's reporter format fails this file
// instead of leaving the excerpt matching a shape node no longer emits.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = path.join(ROOT, 'bin', 'step_failure_excerpt.sh');
const VERIFY = path.join(ROOT, 'bin', 'verify.sh');
// /bin/bash on purpose: on the Mac that is Bash 3.2, the shell the pre-push hook runs under.
const BASH = '/bin/bash';

// The runner marks its children with NODE_TEST_CONTEXT; an inherited copy would make the
// nested `node --test` below report to us over the child protocol instead of printing TAP.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const FAILING_SUITE = [
  "import assert from 'node:assert/strict';",
  "import test from 'node:test';",
  "test('launcher passes first', () => {});",
  "test('launcher readiness is observed', () => { throw new Error('expected launcher output was not observed'); });",
  "test('launcher group', async (t) => { await t.test('nested equality', () => assert.equal(1, 2)); });",
  '',
].join('\n');

function writeSuite(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-excerpt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'tests'));
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'tests', name), source);
  return dir;
}

// One failing file first, then enough passing files that the failure sits far above the tail.
// --test-concurrency=1 keeps that order: files run, and report, one after another.
function failingRun(t) {
  const files = { 'a-launcher.test.mjs': FAILING_SUITE };
  for (const letter of 'bcdefg') {
    files[`${letter}-quiet.test.mjs`] = `import test from 'node:test';\nfor (let i = 0; i < 5; i += 1) test('${letter} passes ' + i, () => {});\n`;
  }
  const dir = writeSuite(t, files);
  const names = Object.keys(files).sort().map((name) => path.join('tests', name));
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...names], {
    cwd: dir, encoding: 'utf8', env: cleanEnv(),
  });
  assert.equal(run.status, 1, `fixture suite should fail:\n${run.stdout}\n${run.stderr}`);
  return { dir, names, tap: run.stdout + run.stderr };
}

function excerpt(input, tailLines = '15') {
  const run = spawnSync(BASH, [HELPER, tailLines], { input, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  return run.stdout;
}

const lastLines = (text, n) => text.replace(/\n$/, '').split('\n').slice(-n).join('\n');

test('the fixture reproduces the defect: tail -15 of a failing node:test run names no test', (t) => {
  const { tap } = failingRun(t);
  const tail = lastLines(tap, 15);
  assert.match(tail, /^# fail 3$/m);
  assert.doesNotMatch(tail, /launcher readiness is observed|nested equality/);
});

test('a failing node:test run is excerpted as every not-ok line with its location and error, then the tail', (t) => {
  const { tap } = failingRun(t);
  const out = excerpt(tap);
  const [failures, tail] = out.split('⋯ last 15 lines ⋯\n');
  assert.ok(tail !== undefined, `missing tail separator:\n${out}`);

  assert.match(failures, /^not ok 2 - launcher readiness is observed$/m);
  assert.match(failures, /^ {2}location: '.*a-launcher\.test\.mjs:4:1'$/m);
  assert.match(failures, /^ {2}error: 'expected launcher output was not observed'$/m);
  // A subtest keeps its nesting, and a multi-line `error: |-` block comes through whole.
  assert.match(failures, /^ {4}not ok 1 - nested equality$/m);
  assert.match(failures, /^ {6}location: '.*a-launcher\.test\.mjs:5:\d+'$/m);
  assert.match(failures, /^ {6}error: \|-\n {8}Expected values to be strictly equal:[\s\S]*1 !== 2/m);
  assert.match(failures, /^not ok 3 - launcher group$/m);
  // Only the keys that name the failure — no stacks, durations, or passing tests.
  assert.doesNotMatch(failures, /stack:|duration_ms|^ok /m);

  assert.equal(tail.replace(/\n$/, ''), lastLines(tap, 15));
});

test('output with no TAP failure prints exactly what tail -15 printed before', (t) => {
  const validator = Array.from({ length: 40 }, (_, i) => `validator line ${i + 1}`).join('\n');
  assert.equal(excerpt(validator), `${lastLines(validator, 15)}\n`);

  const dir = writeSuite(t, { 'ok.test.mjs': "import test from 'node:test';\ntest('passes', () => {});\n" });
  const run = spawnSync(process.execPath, ['--test', 'tests/ok.test.mjs'], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  assert.equal(run.status, 0);
  assert.equal(excerpt(run.stdout), `${lastLines(run.stdout, 15)}\n`);
});

test('the excerpt is bounded: ten failures and eight error lines, then a count of the rest', (t) => {
  const tests = Array.from({ length: 12 }, (_, i) => `test('broken ${i + 1}', () => { throw new Error('boom ${i + 1}'); });`);
  const longError = Array.from({ length: 20 }, (_, i) => `detail ${i + 1}`).join('\\n');
  tests[0] = `test('broken 1', () => { throw new Error('${longError}'); });`;
  const dir = writeSuite(t, { 'many.test.mjs': `import test from 'node:test';\n${tests.join('\n')}\n` });
  const run = spawnSync(process.execPath, ['--test', 'tests/many.test.mjs'], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  assert.equal(run.status, 1);

  const out = excerpt(run.stdout + run.stderr);
  assert.equal(out.match(/^not ok \d+ - broken \d+$/gm).length, 10);
  assert.match(out, /^not ok 10 - broken 10$/m);
  assert.doesNotMatch(out, /^not ok 11 /m);
  assert.match(out, /^… 2 more not-ok line\(s\) not shown; see the full output$/m);
  assert.match(out, /^ {4}detail 8$/m);
  assert.doesNotMatch(out, /^ {4}detail 9$/m);
  assert.match(out, /^ {4}…$/m);
});

// Pull the two functions out of bin/verify.sh verbatim and run them, so this pins the step()
// the pre-push hook actually runs rather than a copy of it. A rename fails here, loudly.
function verifyFunction(name) {
  const source = fs.readFileSync(VERIFY, 'utf8');
  const match = source.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, 'm'));
  assert.ok(match, `bin/verify.sh no longer defines ${name}()`);
  return match[0];
}

test("verify.sh's step() names the failing test and saves every failed step's full output in one place", (t) => {
  const { dir, names, tap } = failingRun(t);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-excerpt-tmp-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const script = [
    'set -uo pipefail',
    `REPO=${JSON.stringify(ROOT)}`,
    'FAILED=()',
    "FAIL_LOG_DIR=''",
    verifyFunction('save_failed_step_log'),
    verifyFunction('step'),
    `step "node --test tests/*.test.mjs" node --test --test-concurrency=1 ${names.join(' ')}`,
    'step "passing step" printf "all good\\n"',
    'step "python validator" sh -c \'echo "3 rows invalid"; exit 2\'',
    'printf "FAILED=%s\\n" "${#FAILED[@]}"',
  ].join('\n');
  // macOS sets TMPDIR with a trailing slash; the printed path must not double it.
  const run = spawnSync(BASH, ['-c', script], { cwd: dir, encoding: 'utf8', env: cleanEnv({ TMPDIR: `${tmp}/` }) });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  const out = run.stdout;

  assert.match(out, /^ {2}FAIL {2}node --test tests\/\*\.test\.mjs +\(exit 1\)$/m);
  assert.match(out, /^ {8}\| not ok 2 - launcher readiness is observed$/m);
  assert.match(out, /^ {8}\| {3}location: '.*a-launcher\.test\.mjs:4:1'$/m);
  assert.match(out, /^ {8}\| # fail 3$/m);
  assert.match(out, /^ {2}PASS {2}passing step +all good$/m);
  assert.match(out, /^ {2}FAIL {2}python validator +\(exit 2\)\n {8}\| 3 rows invalid\n {8}full output: /m);
  assert.match(out, /^FAILED=2$/m);

  const logs = [...out.matchAll(/^ {8}full output: (.+)$/gm)].map((match) => match[1]);
  assert.equal(logs.length, 2, `expected one full-output path per failed step:\n${out}`);
  // Where they landed, not just that they were named: inside TMPDIR, never the repository,
  // and in ONE directory per run — the second failure must not start a directory of its own.
  for (const log of logs) {
    assert.ok(log.startsWith(path.join(tmp, 'verify-failed.')), `log outside TMPDIR: ${log}`);
    assert.doesNotMatch(log, /\/\//);
  }
  assert.equal(path.dirname(logs[0]), path.dirname(logs[1]));
  assert.deepEqual(logs.map((log) => path.basename(log)),
    ['01-node-test-tests-.test.mjs.log', '02-python-validator.log']);
  assert.deepEqual(fs.readdirSync(tmp), [path.basename(path.dirname(logs[0]))]);

  const saved = fs.readFileSync(logs[0], 'utf8');
  // The whole run is there — the passing files' tests too, which the excerpt leaves out.
  for (const letter of 'bcdefg') assert.match(saved, new RegExp(`^ok \\d+ - ${letter} passes 4$`, 'm'));
  assert.equal(saved.split('\n').filter((line) => /^(not )?ok /.test(line)).length,
    tap.split('\n').filter((line) => /^(not )?ok /.test(line)).length);
  assert.equal(fs.readFileSync(logs[1], 'utf8'), '3 rows invalid\n');
});
