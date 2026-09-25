/**
 * bin/run_queue_task.py — the deterministic half of the nightly autonomous runner.
 *
 * The first scheduled firing reported SUCCEEDED and produced nothing: the fired session had
 * `sources: []`, so the repository was never cloned and every later step had nothing to act on.
 * Moving execution onto a runner that starts from a checkout fixes that, but it also moves the
 * dangerous part — an unattended process that commits and opens pull requests — into code, so
 * what needs pinning is the set of refusals:
 *
 *   G1  the task offered work and the run changed nothing → the empty nightly pull request.
 *   G2  run and verify both passed and the count did not move → the measurement does not track
 *       the work, so the task can never retire and the same pull request reopens forever.
 *   G3  a changed path outside the blast radius: the attestation ledger, a clinical registry,
 *       Git-LFS media.
 *   G4  an automated edit to an attested page leaves the ledger byte-identical, so nothing
 *       downstream says the attestation went stale. The pull-request body has to.
 *
 * Each guard is exercised against a throwaway git repository with a stub queue, so the tests
 * prove the refusals fire rather than proving the happy path once. NOTHING HERE TOUCHES THE
 * NETWORK and nothing here runs the real queue's measurements.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scrubInheritedGitEnv } from './_git_env.mjs';

// Builds git repositories: an inherited GIT_DIR would aim them at the repo running this file.
scrubInheritedGitEnv();

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'run_queue_task.py');
const workflow = path.join(repo, '.github', 'workflows', 'maintenance-queue-runner.yml');

// Every throwaway directory below lives under this one root, removed when the file finishes —
// including one made by a test that threw half-way. Each run used to leave 31 directories in
// $TMPDIR and nothing removed any of them; ~58,000 had piled up on one Mac by 2026-09-24,
// enough to stall bin/preview-site.sh (see tests/preview-site-isolation.test.mjs).
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-runner-suite-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** Evaluate a snippet against the driver module, imported from the real repository. */
function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, "bin")\nimport run_queue_task as M\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

/**
 * A throwaway git repository holding the real driver and a stub queue.
 *
 * The stub is what makes the guards testable: the real queue measures 51 books, and a test that
 * had to arrange a genuinely inert measurement in the real repository could only do so by
 * breaking the real measurement.
 */
function fixture({ run, verify = 'true', measure = 'return (0, 5)', remaining = 5 }) {
  const dir = fs.mkdtempSync(path.join(scratch, 'queue-runner-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

  fs.mkdirSync(path.join(dir, 'bin'));
  fs.copyFileSync(script, path.join(dir, 'bin', 'run_queue_task.py'));
  const row = {
    key: 'fake', title: 'Fake task', status: 'ready', remaining, total: 5,
    unit: 'widgets', detail: 'stub', why: 'because the test says so', do: run,
    host: null, autonomous: true, run, verify,
  };
  fs.writeFileSync(path.join(dir, 'bin', 'what_can_i_do_today.py'), [
    'import json, sys',
    '',
    'def _measure():',
    `    ${measure}`,
    '',
    `TASKS = [{"key": "fake", "measure": _measure}]`,
    '',
    'if __name__ == "__main__":',
    '    if "--next-autonomous" in sys.argv:',
    // The row is emitted as a Python string literal: JS `null`/`true` are not Python.
    `        print(${JSON.stringify(JSON.stringify(row))})`,
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qm', 'seed');
  return dir;
}

function drive(dir, args = []) {
  return spawnSync('python3', [path.join(dir, 'bin', 'run_queue_task.py'), ...args], {
    cwd: dir, encoding: 'utf8', timeout: 120_000,
  });
}

/** Drive the runner with a GITHUB_OUTPUT file and return `{ proc, outputs }`. */
function driveWithOutputs(dir, args = []) {
  // OUTSIDE the fixture repo: a file written inside it makes the tree dirty, and the
  // runner refuses a dirty tree -- correctly. (It caught this harness first.)
  const file = path.join(fs.mkdtempSync(path.join(scratch, 'queue-out-')), 'gh-output.txt');
  fs.writeFileSync(file, '');
  const proc = spawnSync(
    'python3', [path.join(dir, 'bin', 'run_queue_task.py'), '--github-output', file, ...args],
    { cwd: dir, encoding: 'utf8', timeout: 120_000 },
  );
  const outputs = Object.fromEntries(
    fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  return { proc, outputs };
}

/** A fixture whose stub queue offers nothing, so the runner has no autonomous task. */
function emptyQueue(dir) {
  fs.writeFileSync(path.join(dir, 'bin', 'what_can_i_do_today.py'), 'import sys\n');
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.invalid', '-c', 'user.name=T',
    'commit', '-qm', 'empty queue']);
  return dir;
}

// ---------------------------------------------------------------- the four guards

test('G1 — a task that offers work and changes nothing fails instead of opening an empty PR', () => {
  const dir = fixture({ run: 'true' });
  const proc = drive(dir);
  assert.equal(proc.status, 3, proc.stderr);
  assert.match(proc.stderr, /changed no file/);
  assert.match(proc.stderr, /empty pull request/);
});

test('G2 — a measurement that does not move blocks the commit, however green run and verify are', () => {
  // The `isbn-derive` defect exactly: run works, verify passes, and the queue still offers the
  // same 51. Nothing downstream would notice; the runner would just reopen this every night.
  const dir = fixture({ run: 'echo changed >> seed.txt', measure: 'return (5, 5)' });
  const proc = drive(dir);
  assert.equal(proc.status, 4, proc.stderr);
  assert.match(proc.stderr, /measurement does not track the work/);
  assert.match(proc.stderr, /can never retire/);
});

test('G2 — an unmeasurable task is not treated as a finished one', () => {
  // Zero means done. A measurement that raises must never be read as zero, or the guard would
  // wave through precisely the work it cannot see.
  const dir = fixture({ run: 'echo changed >> seed.txt', measure: 'raise RuntimeError("moved")' });
  const proc = drive(dir);
  assert.equal(proc.status, 4, proc.stderr);
  assert.match(proc.stderr, /cannot be proven to have landed/);
});

test('G3 — the attestation ledger, clinical registries and LFS media are refused by path', () => {
  const violations = py(`
for p in ["13_Faculty_Resources/reviewed.json", "question_bank.json", "topic_meta.json",
          "12_Media/lecture.mp3", "12_Media/LECTURE.MP4", "../outside.md", "/etc/passwd"]:
    print(len(M.scope_violations([p])), p)`);
  for (const line of violations.split('\n')) {
    assert.match(line, /^1 /, `expected a refusal for ${line}`);
  }
  assert.equal(py('print(M.scope_violations(["07_Evidence_and_Reading/Book_Summaries/x.md"]))'), '[]');
});

test('G3 — a task that writes the attestation ledger is stopped before anything is staged', () => {
  const dir = fixture({
    run: 'mkdir -p 13_Faculty_Resources && echo "{}" > 13_Faculty_Resources/reviewed.json',
  });
  const proc = drive(dir);
  assert.equal(proc.status, 5, proc.stderr);
  assert.match(proc.stderr, /a runner may never edit one/);
  // Nothing committed, and the branch was never even created.
  const branches = execFileSync('git', ['-C', dir, 'branch', '--list'], { encoding: 'utf8' });
  assert.doesNotMatch(branches, /automation\/queue-/);
});

test('G4 — an edit to an attested page is announced, and the derived listing is what says so', () => {
  // `adv_psychopharmacology.md` ships from site_extras.py, not from site_manifest.json. A driver
  // that read the manifest alone — the defect ADR-002 exists to end — would report nothing here.
  const notices = py(`
for n in M.staleness_notices(["14_Tracks/Resident/adv_psychopharmacology.md"]):
    print(n)`);
  assert.match(notices, /adv_psychopharm\.md/);
  assert.match(notices, /attestation stale/);
  assert.match(notices, /byte-identical/);
});

test('G4 — an unreadable listing degrades to a stated unknown, never to silence', () => {
  // Silence here reads as "nothing went stale", which is the failure the guard exists for.
  const notices = py(`
print(M.staleness_notices(["07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md"],
                          root="/nonexistent-repo"))`);
  assert.match(notices, /could not determine attestation impact/);
});

test('a file that ships nowhere raises no attestation notice', () => {
  assert.equal(py('print(M.staleness_notices(["bin/run_queue_task.py"]))'), '[]');
});

// ---------------------------------------------------------------- the happy path

test('a real change is committed on its own dated branch, staged by name', () => {
  const dir = fixture({ run: 'echo changed >> seed.txt', measure: 'return (0, 5)' });
  // Evidence lives outside the checkout, as it does on the runner ($RUNNER_TEMP): an
  // out-dir inside the repository would ride along in the diff it describes.
  const out = fs.mkdtempSync(path.join(scratch, 'queue-runner-evidence-'));
  const proc = drive(dir, ['--out-dir', out]);
  assert.equal(proc.status, 0, proc.stderr);

  const branch = execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'],
    { encoding: 'utf8' }).trim();
  assert.match(branch, /^automation\/queue-fake-\d{4}-\d{2}-\d{2}$/);

  const files = execFileSync('git', ['-C', dir, 'show', '--name-only', '--format=', 'HEAD'],
    { encoding: 'utf8' }).trim();
  assert.equal(files, 'seed.txt');

  const message = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%B'], { encoding: 'utf8' });
  assert.match(message, /widgets remaining: 5 -> 0/);

  const body = fs.readFileSync(path.join(out, 'pr-body.md'), 'utf8');
  assert.match(body, /retired itself/);
  assert.match(body, /never merges/);
  assert.ok(fs.existsSync(path.join(out, 'plan.json')));
});

test('an empty queue is a success with no branch, because the queue retires its own work', () => {
  const dir = fixture({ run: 'true' });
  fs.writeFileSync(path.join(dir, 'bin', 'what_can_i_do_today.py'), 'import sys\n');
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.invalid', '-c', 'user.name=T',
    'commit', '-qm', 'empty queue']);
  const proc = drive(dir);
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /nothing autonomous to do/);
  assert.equal(
    execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(),
    'main');
});

test('--dry-run selects and executes nothing', () => {
  const dir = fixture({ run: 'echo changed >> seed.txt' });
  const proc = drive(dir, ['--dry-run']);
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }), '');
});

test('an out-dir inside the checkout is refused, so evidence cannot ride along in the diff', () => {
  const dir = fixture({ run: 'echo changed >> seed.txt' });
  const proc = drive(dir, ['--out-dir', path.join(dir, 'evidence')]);
  assert.equal(proc.status, 2, proc.stderr);
  assert.match(proc.stderr, /must sit outside the repository/);
});

test('a dirty tree is refused, so an unrelated edit cannot ride along in the commit', () => {
  const dir = fixture({ run: 'echo changed >> seed.txt' });
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'somebody else was here\n');
  const proc = drive(dir);
  assert.equal(proc.status, 2, proc.stderr);
  assert.match(proc.stderr, /dirty tree/);
});

test("a failing verify is a failing job, and its exit code names which half broke", () => {
  const dir = fixture({ run: 'echo changed >> seed.txt', verify: 'false' });
  const proc = drive(dir);
  assert.equal(proc.status, 6, proc.stderr);
  assert.match(proc.stderr, /verify failed/);
});

test('every guard has its own exit code, so a red run names itself without the log', () => {
  const codes = py(`
print(sorted({M.EXIT_OK, M.EXIT_USAGE, M.EXIT_NO_CHANGE, M.EXIT_INERT_MEASUREMENT,
              M.EXIT_OUT_OF_SCOPE, M.EXIT_VERIFY_FAILED}))`);
  assert.equal(codes, '[0, 2, 3, 4, 5, 6]');
});

test('rename entries stage both sides, so a rename cannot leave a duplicate behind', () => {
  assert.equal(py(`print(M.changed_paths("R  old/a.md -> new/a.md\\n M b.md\\n"))`),
    "['old/a.md', 'new/a.md', 'b.md']");
});

// ---------------------------------------------------------------- the outcome output
//
// Three of the five outcomes exit 0. A reader with only the exit code cannot tell a night
// that did work from a night with nothing to do, and the run that would have shown the
// difference is the one nobody looks at. See §D4 of docs/SILENT_SHRINK_CHECKLIST.md.

test('a night that did work and a night with nothing to do are both exit 0, and distinguishable', () => {
  const worked = driveWithOutputs(fixture({ run: 'echo changed >> seed.txt' }));
  assert.equal(worked.proc.status, 0, worked.proc.stderr);
  assert.equal(worked.outputs.outcome, 'did-work');
  assert.equal(worked.outputs.committed, 'true');

  const idle = driveWithOutputs(emptyQueue(fixture({ run: 'true' })));
  assert.equal(idle.proc.status, 0, idle.proc.stderr);
  assert.equal(idle.outputs.outcome, 'nothing-to-do');
  assert.equal(idle.outputs.committed, 'false');

  // The point of the whole output: same exit code, different answer.
  assert.equal(worked.proc.status, idle.proc.status);
  assert.notEqual(worked.outputs.outcome, idle.outputs.outcome);
});

test('every exit path writes an outcome — including the ones that refuse', () => {
  // Before the _execute split, 4 of 16 returns wrote an output and 12 wrote nothing. An
  // absent outcome is indistinguishable from any particular one, so each refusal is driven
  // here and asserted to say so.
  const cases = [
    ['dirty tree', () => {
      const dir = fixture({ run: 'echo changed >> seed.txt' });
      fs.writeFileSync(path.join(dir, 'seed.txt'), 'somebody else was here\n');
      return driveWithOutputs(dir);
    }, 2],
    ['failing verify', () =>
      driveWithOutputs(fixture({ run: 'echo changed >> seed.txt', verify: 'false' })), 6],
    ['G1 no change', () => driveWithOutputs(fixture({ run: 'true' })), 3],
    ['G2 inert measurement', () =>
      driveWithOutputs(fixture({ run: 'echo changed >> seed.txt', measure: 'return (5, 5)' })), 4],
    ['G3 out of scope', () =>
      driveWithOutputs(fixture({ run: 'mkdir -p 13_Faculty_Resources && echo x > 13_Faculty_Resources/reviewed.json' })), 5],
  ];
  for (const [label, run, expected] of cases) {
    const { proc, outputs } = run();
    assert.equal(proc.status, expected, `${label}: ${proc.stderr}`);
    assert.equal(outputs.outcome, 'blocked', `${label} must still report an outcome`);
    // The outcome says WHAT happened; the exit code still says WHICH guard refused.
    assert.match(proc.stdout, /outcome=blocked/);
  }
});

test('the local-only modes are their own outcomes, never silence and never did-work', () => {
  const dry = driveWithOutputs(fixture({ run: 'echo changed >> seed.txt' }), ['--dry-run']);
  assert.equal(dry.outputs.outcome, 'dry-run');
  const noCommit = driveWithOutputs(fixture({ run: 'echo changed >> seed.txt' }), ['--no-commit']);
  assert.equal(noCommit.outputs.outcome, 'no-commit');
  for (const o of [dry.outputs.outcome, noCommit.outputs.outcome]) {
    assert.notEqual(o, 'did-work');
  }
});

test('every outcome _execute can return is a declared member of OUTCOMES', () => {
  // The membership check in main() only announces; this is where a typo is caught.
  const source = fs.readFileSync(script, 'utf8');
  const body = source.slice(source.indexOf('def _execute('), source.indexOf('\ndef main('));
  const returns = body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('return '));
  assert.ok(returns.length >= 10, `expected every guard to return; saw ${returns.length}`);
  const named = new Set();
  for (const line of returns) {
    const m = line.match(/OUTCOME_[A-Z_]+/);
    assert.ok(m, `a return with no outcome: ${line}`);
    named.add(m[0]);
  }
  const declared = py('print(sorted(M.OUTCOMES))');
  assert.equal(declared, "['blocked', 'did-work', 'dry-run', 'no-commit', 'nothing-to-do']");
  for (const constant of named) {
    assert.equal(py(`print(M.${constant} in M.OUTCOMES)`), 'True', `${constant} is not declared`);
  }
});

test('the outcome outlives the run log, in the uploaded evidence', () => {
  const dir = fixture({ run: 'echo changed >> seed.txt' });
  const out = fs.mkdtempSync(path.join(scratch, 'queue-evidence-'));
  const proc = drive(dir, ['--out-dir', out]);
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(fs.readFileSync(path.join(out, 'outcome.txt'), 'utf8').trim(), 'did-work');
});

// ---------------------------------------------------------------- the workflow contract

test('the workflow opens drafts only and never merges, marks ready, or bulk-stages', () => {
  const source = fs.readFileSync(workflow, 'utf8');
  assert.match(source, /gh pr create --draft/);
  assert.doesNotMatch(source, /pr merge|ready-for-review|pr review|git add -A/);
});

test('the workflow stands down while an earlier automated PR is still open', () => {
  // Without this the branch date makes each night look new, so an unmerged draft would be
  // duplicated every 24 hours for as long as it sat there.
  const source = fs.readFileSync(workflow, 'utf8');
  assert.match(source, /startswith\("automation\/queue-"\)/);
  assert.match(source, /steps\.outstanding\.outputs\.open != 'true'/);
});

test('the failure escalation deadman watches the queue runner by name', () => {
  const escalation = fs.readFileSync(
    path.join(repo, '.github', 'workflows', 'automation-failure-escalation.yml'), 'utf8');
  const name = fs.readFileSync(workflow, 'utf8').match(/^name:\s*(.+)$/m)[1].trim();
  assert.ok(escalation.includes(name), `escalation must watch ${name}`);
});
