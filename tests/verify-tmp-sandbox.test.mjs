// bin/verify.sh runs every step with TMPDIR pointed at a private directory, removes it when the
// step ends, and fails the step as a LEAK when anything was left in it. On 2026-09-24 the Mac's
// shared $TMPDIR held ~122,700 entries — ~103k of them fixtures from three test files that never
// removed what they made — and nothing failed until python3, importing from that directory,
// took 20 s to start and tests/preview-site.test.mjs blocked pushes. These tests pin both halves:
// the pile cannot form (the shared TMPDIR ends every run empty), and a leak is named when it
// happens rather than two weeks later as somebody else's timeout.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = path.join(ROOT, 'bin', 'tmp_leak_report.sh');
const VERIFY = path.join(ROOT, 'bin', 'verify.sh');
// /bin/bash on purpose: on the Mac that is Bash 3.2, the shell the pre-push hook runs under.
const BASH = '/bin/bash';

function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

// A directory standing in for the caller's shared TMPDIR. macOS sets TMPDIR with a trailing
// slash, so the tests pass it that way and assert no printed path doubles it.
function sharedTmp(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function report(dir) {
  return spawnSync(BASH, [HELPER, dir], { encoding: 'utf8', env: cleanEnv() });
}

// Pull step() out of bin/verify.sh verbatim, so this pins the function the pre-push hook runs
// rather than a copy of it. A rename fails here, loudly.
function verifyFunction(name) {
  const source = fs.readFileSync(VERIFY, 'utf8');
  const match = source.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, 'm'));
  assert.ok(match, `bin/verify.sh no longer defines ${name}()`);
  return match[0];
}

// verify.sh's top-level traps are what remove a step's directory when the run is interrupted.
function verifyTraps() {
  const traps = fs.readFileSync(VERIFY, 'utf8').split('\n').filter((line) => /^trap /.test(line));
  assert.ok(traps.some((line) => /EXIT$/.test(line) && line.includes('CUR_STEP_TMP')),
    'bin/verify.sh no longer removes the current step\'s private TMPDIR on EXIT');
  return traps.join('\n');
}

test('the leak report names what a step left, grouped by prefix, and removes it', (t) => {
  const shared = sharedTmp(t, 'leak-report');
  const dir = fs.mkdtempSync(path.join(shared, 'verify-step.'));
  for (const name of ['queue-runner-AbC123', 'queue-runner-XyZ789', 'queue-runner-evidence-Qq1234',
    'lfs-cache-q1w2e3', 'tmpab12cd34']) fs.mkdirSync(path.join(dir, name));
  fs.writeFileSync(path.join(dir, 'tmpzz99yy88'), '');
  // A fixture can leave a read-only directory behind (a copied git object store does).
  fs.mkdirSync(path.join(dir, 'lfs-cache-q1w2e3', 'objects', 'pack'), { recursive: true });
  fs.chmodSync(path.join(dir, 'lfs-cache-q1w2e3', 'objects'), 0o555);

  const run = report(dir);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.equal(run.stdout, '6 entries left in its private TMPDIR (removed): queue-runner-* (2), '
    + 'tmp* (2), lfs-cache-* (1), queue-runner-evidence-* (1)\n');
  assert.equal(fs.existsSync(dir), false, 'a leaking step\'s directory must still be removed');
});

test('the leak report is silent and exits 0 for a step that left nothing', (t) => {
  const dir = fs.mkdtempSync(path.join(sharedTmp(t, 'leak-report'), 'verify-step.'));
  const run = report(dir);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(fs.existsSync(dir), false);
});

// npm 10 calls module.enableCompileCache(), which keeps Node's compile cache in
// os.tmpdir()/node-compile-cache — a tool's own fixed-name cache, reused rather than piling up.
// It is exempt by EXACT name only: anything that merely starts with the same words is a leak.
test('the leak report exempts npm\'s compile cache by exact name and shows a suffix-less name whole', (t) => {
  const shared = sharedTmp(t, 'leak-report');
  const cacheOnly = fs.mkdtempSync(path.join(shared, 'verify-step.'));
  fs.mkdirSync(path.join(cacheOnly, 'node-compile-cache', 'v22.18.0-arm64'), { recursive: true });
  const cached = report(cacheOnly);
  assert.equal(cached.status, 0, cached.stdout);
  assert.equal(cached.stdout, '');
  assert.equal(fs.existsSync(cacheOnly), false);

  const lookalikes = fs.mkdtempSync(path.join(shared, 'verify-step.'));
  fs.mkdirSync(path.join(lookalikes, 'node-compile-cache-AbC123'));
  // bin/check_review_cadence.py's self-test once wrote a fixed `config/` into the TMPDIR root.
  fs.mkdirSync(path.join(lookalikes, 'config'));
  const leaked = report(lookalikes);
  assert.equal(leaked.status, 1);
  assert.equal(leaked.stdout, '2 entries left in its private TMPDIR (removed): config (1), node-compile-cache-* (1)\n');
});

test('the leak report cannot check, and deletes nothing, outside a verify-step.* directory', (t) => {
  const shared = sharedTmp(t, 'leak-report');
  const other = fs.mkdtempSync(path.join(shared, 'not-a-step-'));
  fs.writeFileSync(path.join(other, 'keep-me'), '');
  const guarded = report(other);
  assert.equal(guarded.status, 2);
  assert.match(guarded.stdout, /^could not check: refusing to remove /);
  assert.equal(fs.existsSync(path.join(other, 'keep-me')), true);

  const missing = report(path.join(shared, 'verify-step.gone'));
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /^could not check: .* is not a directory$/m);
});

test("verify.sh's step() gives every step a private TMPDIR and fails a step that leaks", (t) => {
  const shared = sharedTmp(t, 'verify-sandbox');
  // Outside `shared`, so recording what the step saw does not itself count as leaving something.
  const record = path.join(sharedTmp(t, 'verify-sandbox-record'), 'tmpdir.txt');
  const script = [
    'set -uo pipefail',
    `REPO=${JSON.stringify(ROOT)}`,
    'FAILED=()',
    verifyFunction('step'),
    `step "sees a private TMPDIR" sh -c 'printf "%s" "$TMPDIR" > ${JSON.stringify(record)}'`,
    'step "node leak" node -e "require(\'fs\').mkdtempSync(require(\'path\').join(require(\'os\').tmpdir(), \'leaky-fixture-\'))"',
    'step "python leak" python3 -c "import tempfile; tempfile.mkdtemp(prefix=\'py-fixture-\')"',
    'step "tidy node" node -e "const fs = require(\'fs\'); const d = fs.mkdtempSync(require(\'path\').join(require(\'os\').tmpdir(), \'tidy-\')); fs.rmSync(d, { recursive: true })"',
    'step "fails and leaks" sh -c \'mkdir "$TMPDIR/broken-fixture-abc123"; exit 3\'',
    'printf "FAILED=%s\\n" "${#FAILED[@]}"',
    'for f in "${FAILED[@]}"; do printf "F:%s\\n" "$f"; done',
  ].join('\n');
  const run = spawnSync(BASH, ['-c', script], { encoding: 'utf8', env: cleanEnv({ TMPDIR: `${shared}/` }) });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  const out = run.stdout;

  // The step saw its own directory under the caller's TMPDIR, and that directory is gone.
  assert.match(out, /^ {2}PASS {2}sees a private TMPDIR/m);
  const seen = fs.readFileSync(record, 'utf8');
  assert.ok(seen.startsWith(path.join(shared, 'verify-step.')), `not a private TMPDIR: ${seen}`);
  assert.doesNotMatch(seen, /\/\//);
  assert.equal(fs.existsSync(seen), false);

  assert.match(out, /^ {2}PASS {2}node leak.*\n {2}LEAK {2}node leak +1 entry left in its private TMPDIR \(removed\): leaky-fixture-\* \(1\)$/m);
  assert.match(out, /^ {2}LEAK {2}python leak +1 entry left in its private TMPDIR \(removed\): py-fixture-\* \(1\)$/m);
  assert.match(out, /^ {2}PASS {2}tidy node/m);
  assert.doesNotMatch(out, /LEAK {2}tidy node/);
  assert.match(out, /^ {2}FAIL {2}fails and leaks +\(exit 3\)$/m);
  assert.match(out, /^ {2}LEAK {2}fails and leaks +1 entry left in its private TMPDIR \(removed\): broken-fixture-\* \(1\)$/m);
  assert.match(out, /^FAILED=4$/m);
  assert.deepEqual([...out.matchAll(/^F:(.+)$/gm)].map((m) => m[1]),
    ['node leak (temp-dir leak)', 'python leak (temp-dir leak)', 'fails and leaks', 'fails and leaks (temp-dir leak)']);

  // The whole point: nothing any step made reached the caller's TMPDIR.
  assert.deepEqual(fs.readdirSync(shared), []);
});

test('an interrupted verify.sh run removes the private TMPDIR of the step it was in', async (t) => {
  const shared = sharedTmp(t, 'verify-sandbox-int');
  const script = [
    'set -uo pipefail',
    `REPO=${JSON.stringify(ROOT)}`,
    'FAILED=()',
    verifyTraps(),
    verifyFunction('step'),
    'step "interrupted" sh -c \'mkdir "$TMPDIR/half-built-fixture-abc123"; exec sleep 60\'',
  ].join('\n');
  // Its own process group, so the interrupt reaches bash AND the step, as Ctrl-C does.
  const child = spawn(BASH, ['-c', script], { detached: true, env: cleanEnv({ TMPDIR: `${shared}/` }), stdio: 'ignore' });
  let exited = false;
  const closed = new Promise((resolve) => child.on('close', (code, signal) => { exited = true; resolve({ code, signal }); }));
  t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } });

  // Wait on the event itself — the fixture appearing inside the step's directory — not a clock.
  let fixture = null;
  while (!fixture) {
    assert.equal(exited, false, 'the script exited before its step started');
    const step = fs.readdirSync(shared).find((name) => name.startsWith('verify-step.'));
    if (step && fs.existsSync(path.join(shared, step, 'half-built-fixture-abc123'))) fixture = step;
    else await new Promise((resolve) => setTimeout(resolve, 20));
  }
  process.kill(-child.pid, 'SIGINT');
  const { code } = await closed;
  assert.equal(code, 130);
  assert.deepEqual(fs.readdirSync(shared), [], 'the interrupted step\'s TMPDIR was left behind');
});
