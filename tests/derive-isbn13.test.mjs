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
 * Nothing here touches the network. One test — "no task retires on another task's output" —
 * does write the tracked book library and restore it, because observing cross-task
 * contamination needs the real corpus; everything else works on a fixture under os.tmpdir().
 * No test may assume the tracked library still HAS outstanding work: the nightly queue runner
 * performs the task and then runs this suite in the same checkout, so by then it does not.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
  const books = path.join(repo, '07_Evidence_and_Reading', 'Book_Summaries', 'ms3_book_library.md');
  // Compare the file against ITSELF across the call. The earlier version asked
  // `git diff --name-only` whether it differed from HEAD, which answers a different question:
  // it is equally true when the queue runner wrote the file in an earlier step of the same job.
  // That is the same defect as the floor pinned below — inferring your own effect from tree
  // state somebody else already changed — and it failed the runner for the same reason.
  const before = fs.readFileSync(books);
  const proc = spawnSync('python3', [path.join(repo, 'bin', 'derive_isbn13.py')],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /dry run — pass --write/);
  assert.ok(fs.readFileSync(books).equals(before),
    'a dry run must not modify the book library');
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
  for (const key of ['coverage-unserved', 'faculty-review', 'podcast-canonical', 'instrument-routes']) {
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
  // It runs on a FIXTURE, not the tracked library, and that is the point rather than tidiness.
  // The earlier version measured the tracked file and opened with `assert.ok(before > 0)`. The
  // queue runner performs a task's `run` and then runs this whole suite in the SAME checkout, so
  // by the time the guard ran the work was already done, `before` was 0, and the runner failed —
  // three consecutive nights from 2026-09-09, on the one task it exists to perform. A task's own
  // test may not require that the task has not been done.
  //
  // The invariant that survives is the one that always mattered: doing the work drives the
  // measure to zero. That holds on any tree, including one the runner has already worked.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isbn-retire-'));
  const books = path.join(dir, 'ms3_book_library.md');
  try {
    // Two derivable entries and one Amazon-only id, which must be left alone. Built here so the
    // precondition is a property of the fixture rather than of the working tree.
    fs.writeFileSync(books, [
      '# Fixture',
      '',
      `- **[The Body Keeps the Score](https://www.amazon.com/dp/${KNOWN[0][0]})** — van der Kolk.`,
      `- **[Man's Search for Meaning](https://www.amazon.com/dp/${KNOWN[1][0]})** — Frankl.`,
      '- **[A Kindle original](https://www.amazon.com/dp/B00X4WHP55)** — not an ISBN.',
      '',
    ].join('\n'));

    const measure = () =>
      py(`print(M.measure_isbn_derivable(${JSON.stringify(books)})[0])`, 'what_can_i_do_today');

    assert.equal(measure(), '2', 'the fixture must start with work the deriver can do');

    const wrote = spawnSync('python3',
      [path.join(repo, 'bin', 'derive_isbn13.py'), '--write', '--books', books],
      { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    assert.equal(wrote.status, 0, wrote.stderr);

    assert.equal(measure(), '0', 'a completed task must measure zero, or the runner never stops');

    // ...and the work is idempotent, so a second run finds nothing rather than re-adding.
    const again = spawnSync('python3',
      [path.join(repo, 'bin', 'derive_isbn13.py'), '--write', '--books', books],
      { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(measure(), '0');

    // The ISBN recorded is the published one, and the Amazon-only id was never guessed at.
    const written = fs.readFileSync(books, 'utf8');
    assert.match(written, new RegExp(`ISBN ${KNOWN[0][1]}`));
    assert.match(written, new RegExp(`ISBN ${KNOWN[1][1]}`));
    assert.doesNotMatch(written, /B00X4WHP55\)\*\* — not an ISBN\.\s+ISBN/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the runner having already done the work does not break the guard suite', () => {
  // The failure above, stated as a property rather than a story: measuring a fully-derived
  // library is a legitimate 0, not a broken precondition. Pin it so the next person who reaches
  // for `assert.ok(before > 0)` finds out here instead of on the third red night.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isbn-done-'));
  const books = path.join(dir, 'ms3_book_library.md');
  try {
    fs.writeFileSync(books,
      `- **[The Body Keeps the Score](https://www.amazon.com/dp/${KNOWN[0][0]})** — v.`
      + `  ISBN ${KNOWN[0][1]}\n`);
    assert.equal(
      py(`print(M.measure_isbn_derivable(${JSON.stringify(books)})[0])`, 'what_can_i_do_today'),
      '0', 'an already-derived library measures zero without erroring');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no test in this suite requires the tracked library to be un-derived', () => {
  // The guard for the outage, in the only form that is actually checkable. The queue runner
  // performs a task's `run` and then runs this suite in the same checkout, so the tracked
  // library may legitimately arrive fully derived. A test that opens by asserting work remains
  // is therefore asserting the runner has not run — which it always has, by then.
  //
  // Deliberately narrow. The suite DOES still write the tracked library, in "no task retires on
  // another task's output" below, and that write is load-bearing: observing that one task's work
  // leaves another task's measure alone needs the real corpus and the real TASKS table, and a
  // fixture would make it pass vacuously. That test survives a derived tree because it compares
  // before against after rather than against a floor. The floor is the defect, so the floor is
  // what this pins.
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(src, /assert\.ok\(\s*Number\([^;]*\)\s*>\s*0/,
    'measure a fixture you built, or compare before against after — never assert a floor on the '
    + 'tracked library, which the nightly runner empties before this suite runs');
  // The same mistake in its other shape, which cost a second failing test in the same job:
  // `git diff` reports how the tree differs from HEAD, not what THIS test just did. Read the
  // file before and after instead.
  assert.doesNotMatch(src, /spawnSync\('git',\s*\['diff'/,
    'prove your own effect by reading the file either side of the call, not by asking git how '
    + 'the tree differs from HEAD — the runner has already changed it');
});

test('the queue asks the deriver what is left, rather than deciding for itself', () => {
  // Two independent definitions of "done" is one too many; that mismatch is what created the
  // infinite loop above. Pin that the queue imports the worker.
  const src = fs.readFileSync(path.join(repo, 'bin', 'what_can_i_do_today.py'), 'utf8');
  assert.match(src, /import derive_isbn13 as deriver/,
    'measure_isbn_derivable must import the deriver, not re-derive its rule');
});

test('no task retires on another task\'s output', () => {
  // The mirror of the infinite-loop bug, and worse: "isbn-verify" (confirm each edition against
  // a catalogue) was measured by whether the line carried an ISBN-13. The moment isbn-derive
  // wrote those ISBNs it reported 0 of 51 and retired itself, having queried nothing — real work
  // vanished because a DIFFERENT task's output satisfied its predicate. Found by an automated
  // review, not by the tests, which is why this one exists.
  //
  // Guard the general property: do the work of every autonomous task, then assert that no OTHER
  // task changed its mind about being finished.
  const books = path.join(repo, '07_Evidence_and_Reading', 'Book_Summaries', 'ms3_book_library.md');
  const original = fs.readFileSync(books, 'utf8');
  const statuses = () => JSON.parse(py(
    `import json; print(json.dumps({t["key"]: (M.evaluate(t, {})[0]) for t in M.TASKS}))`,
    'what_can_i_do_today'));
  try {
    const before = statuses();
    const auto = JSON.parse(py('import json; print(json.dumps([t["key"] for t in M.TASKS if M.is_autonomous(t)]))',
      'what_can_i_do_today'));
    spawnSync('python3', [path.join(repo, 'bin', 'derive_isbn13.py'), '--write'],
      { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    const after = statuses();
    for (const [key, was] of Object.entries(before)) {
      if (auto.includes(key)) continue;            // the task that did the work may change
      assert.equal(after[key], was,
        `${key} changed status because another task ran — it is measuring someone else's output`);
    }
  } finally {
    fs.writeFileSync(books, original);
  }
});
