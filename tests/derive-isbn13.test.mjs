/**
 * bin/derive_isbn13.py — the first task the nightly queue runner may perform unattended.
 *
 * It qualifies for autonomy precisely because no judgement is involved: every book links to
 * amazon.com/dp/<ASIN>, and for a print book that ASIN is the ISBN-10, so ISBN-13 is arithmetic.
 * That property is only worth anything if it is actually true of the arithmetic, which is what
 * these tests pin — against five INDEPENDENTLY KNOWN published ISBN-13s, not against the script's
 * own output, because a self-consistent wrong implementation would pass the latter happily.
 *
 * The other half pins the autonomy rule itself: it is DERIVED from a task having both a
 * deterministic `run` and a `verify` that can fail, never declared by a hand-set boolean. A
 * boolean is one careless edit away from letting a bot loose on curation or on a faculty
 * attestation; a derived rule cannot be flipped by accident.
 *
 * Nothing here touches the network, and nothing here writes to the tracked book library.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function py(snippet, mod = 'derive_isbn13') {
  const proc = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, "bin")\nimport ${mod} as M\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

// Five real books whose ISBN-13s are known independently of this repo's arithmetic.
const KNOWN = [
  ['0143127748', '9780143127741', 'The Body Keeps the Score'],
  ['0807014273', '9780807014271', "Man's Search for Meaning"],
  ['0380810336', '9780380810338', 'Feeling Good'],
  ['157224710X', '9781572247109', 'The Buddha and the Borderline — X check digit'],
  ['0679763309', '9780679763307', 'An Unquiet Mind'],
];

test('ISBN-10 converts to the published ISBN-13, X check digit included', () => {
  for (const [asin, expected, title] of KNOWN) {
    assert.equal(py(`print(M.to_isbn13(${JSON.stringify(asin)}))`), expected, title);
  }
});

test('a real Amazon ASIN is recognised as not an ISBN and never guessed at', () => {
  // B0... ids are Amazon's own, not ISBNs. Inventing one would put a wrong identifier in front
  // of a learner, which is worse than leaving the entry without one.
  assert.equal(py('print(M.isbn10_valid("B00X4WHP55"))'), 'False');
  assert.equal(
    py('print(M.rewrite("- **[X](https://www.amazon.com/dp/B00X4WHP55)** — A.")[1])'),
    'not-an-isbn');
});

test('a corrupted check digit is rejected, not silently accepted', () => {
  assert.equal(py('print(M.isbn13_valid("9780143127741"))'), 'True');
  assert.equal(py('print(M.isbn13_valid("9780143127742"))'), 'False');
  assert.equal(py('print(M.isbn10_valid("0143127749"))'), 'False');
});

test('--check catches an ISBN that does not match the ASIN on its own line', () => {
  // The failure that matters: a plausible, self-consistent ISBN-13 for the WRONG book. It passes
  // its own check digit, so only cross-checking it against the line's ASIN can catch it.
  const problems = py(`
line = '- **[X](https://www.amazon.com/dp/0143127748)** — A.  ISBN 9780807014271'
print(len(M.check([line])), M.check([line])[0][2] if M.check([line]) else "")`);
  assert.match(problems, /^1 does not match the ASIN/);
});

test('rewriting is idempotent — a second pass adds nothing', () => {
  const out = py(`
line = '- **[X](https://www.amazon.com/dp/0143127748)** — A.'
once, a1 = M.rewrite(line)
twice, a2 = M.rewrite(once)
print(a1, a2, once == twice)`);
  assert.equal(out, 'add already true'.replace('true', 'True'));
});

test('non-entry lines are never touched', () => {
  for (const line of ['# Heading', '> 345 titles', '', '## Category']) {
    assert.equal(py(`print(M.rewrite(${JSON.stringify(line)})[1])`), 'skip');
  }
});

test('the dry run reports without writing', () => {
  const proc = spawnSync('python3', [path.join(repo, 'bin', 'derive_isbn13.py')],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /dry run — pass --write/);
  const dirty = spawnSync('git', ['diff', '--name-only', '--',
    '07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md'],
    { cwd: repo, encoding: 'utf8' });
  assert.equal(dirty.stdout.trim(), '', 'a dry run must not modify the book library');
});

// ---------------------------------------------------------------- the autonomy rule

test('autonomy is derived from run+verify, never declared', () => {
  const q = (s) => py(s, 'what_can_i_do_today');
  assert.equal(q('print(M.is_autonomous({"run": "x", "verify": "y"}))'), 'True');
  assert.equal(q('print(M.is_autonomous({"run": "x"}))'), 'False', 'a change with no proof is not safe');
  assert.equal(q('print(M.is_autonomous({"verify": "y"}))'), 'False', 'a proof with no change does nothing');
  assert.equal(q('print(M.is_autonomous({}))'), 'False');
  // A hand-set flag must not be able to grant autonomy on its own.
  assert.equal(q('print(M.is_autonomous({"autonomous": True}))'), 'False');
});

test('judgement tasks can never be picked up by a runner', () => {
  // coverage-unserved is curation — what belongs in front of a learner is not mechanisable.
  // faculty-review is an attestation: a person putting their name to a clinical page.
  const q = (s) => py(s, 'what_can_i_do_today');
  for (const key of ['coverage-unserved', 'faculty-review', 'isbn-verify', 'podcast-canonical']) {
    const auto = q(`t = next(t for t in M.TASKS if t["key"] == ${JSON.stringify(key)})
print(M.is_autonomous(t))`);
    assert.equal(auto, 'False', `${key} must not be autonomous`);
  }
});

test('--next-autonomous emits at most one task, ready and autonomous', () => {
  const proc = spawnSync('python3',
    [path.join(repo, 'bin', 'what_can_i_do_today.py'), '--next-autonomous'],
    { cwd: repo, encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, CLERKSHIP_SKIP_EGRESS_PROBE: '1' } });
  assert.equal(proc.status, 0);
  const out = proc.stdout.trim();
  if (out) {
    const task = JSON.parse(out);
    assert.equal(task.status, 'ready');
    assert.equal(task.autonomous, true);
    assert.ok(task.run && task.verify);
  }
  // Empty output is the normal, correct answer on most nights — the queue retires its own work,
  // so a runner that finds nothing has succeeded, not failed. Either way the exit code is 0.
});

test('doing the work actually retires the task — the loop that would never end', () => {
  // THE regression test. An earlier version wired isbn-derive to "ASINs that are valid ISBN-10s",
  // a number the work does not move, because the ISBN is recorded BESIDE the Amazon link rather
  // than replacing it. The task reported 51/51 ready forever, so the nightly runner would have
  // opened an empty draft PR every night for the rest of time.
  //
  // The generic mechanism tests above all passed while that was true, because they used synthetic
  // tasks. Only exercising a REAL task end to end catches it, so this test does the work, checks
  // the queue, and puts the file back.
  const books = path.join(repo, '07_Evidence_and_Reading', 'Book_Summaries', 'ms3_book_library.md');
  const original = fs.readFileSync(books, 'utf8');
  try {
    const before = py('print(M.measure_isbn_derivable()[0])', 'what_can_i_do_today');
    assert.ok(Number(before) > 0, 'expected outstanding work to begin with');

    const wrote = spawnSync('python3', [path.join(repo, 'bin', 'derive_isbn13.py'), '--write'],
      { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    assert.equal(wrote.status, 0, wrote.stderr);

    const after = py('print(M.measure_isbn_derivable()[0])', 'what_can_i_do_today');
    assert.equal(after, '0', 'a completed task must measure zero, or the runner never stops');

    const proc = spawnSync('python3',
      [path.join(repo, 'bin', 'what_can_i_do_today.py'), '--next-autonomous'],
      { cwd: repo, encoding: 'utf8', timeout: 120_000,
        env: { ...process.env, CLERKSHIP_SKIP_EGRESS_PROBE: '1' } });
    assert.equal(proc.stdout.trim(), '', 'nothing may remain for a runner once the work is done');
  } finally {
    fs.writeFileSync(books, original);
  }
});

test('the queue asks the deriver what is left, rather than deciding for itself', () => {
  // Two independent definitions of "done" is one too many; that mismatch is what created the
  // infinite loop above. Pin that the queue imports the worker.
  const src = fs.readFileSync(path.join(repo, 'bin', 'what_can_i_do_today.py'), 'utf8');
  assert.match(src, /import derive_isbn13 as deriver/,
    'measure_isbn_derivable must import the deriver, not re-derive its rule');
});
