/**
 * bin/check_icd_codes.py — every ICD-10-CM F-code the library mentions must exist in the
 * code set in force on the date it is read.
 *
 * ICD-10-CM changes every October 1. The tool carries a committed fixture of the F chapter
 * for two fiscal years (bin/data/icd10cm_f_chapter.json) and judges each dotted code in the
 * content tree against the table in force on --as-of. What needs pinning here is not the
 * corpus's mention count — that moves nightly, which is the point — but the invariants:
 *
 *   · the committed fixture is what we think it is: FY2026 is a subset of FY2027 with exactly
 *     one addition (F64A) and nothing deleted. That is a fact about the fixture, not the
 *     corpus, so it is stable until the fixture is refreshed for FY2028.
 *   · classify() flips tables at the boundary: 2026-09-30 reads fy2026, 2026-10-01 reads
 *     fy2027, and a code that exists only in fy2026 is `retiring` the day before and
 *     `not-in-set` the day after.
 *   · --self-test exits 0, so the tool's own falsification stays wired.
 *   · a real scan examines more than zero files. A scan of nothing is not a pass.
 *
 * NO TEST HERE TOUCHES THE NETWORK: the tool never does — the code set is a committed file
 * and the file list comes from `git ls-files`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'check_icd_codes.py');
const fixture = path.join(repo, 'bin', 'data', 'icd10cm_f_chapter.json');

/** Run the tool; returns the raw spawn result so callers can assert on the exit code. */
function run(args = []) {
  return spawnSync('python3', [script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

/** Evaluate a snippet against the imported module. No network, no subprocess of its own. */
function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, "bin")\nimport check_icd_codes as C\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

test('the committed fixture parses and FY2026 ⊂ FY2027 with exactly one addition', () => {
  const table = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  assert.equal(table.schemaVersion, 1);
  assert.equal(table.fiscalYears.fy2026.effective, '2025-10-01');
  assert.equal(table.fiscalYears.fy2027.effective, '2026-10-01');
  assert.ok(table.sourceSha256.fy2026.match(/^[0-9a-f]{64}$/), 'fy2026 source sha256 recorded');
  assert.ok(table.sourceSha256.fy2027.match(/^[0-9a-f]{64}$/), 'fy2027 source sha256 recorded');

  const a = new Set(Object.keys(table.fiscalYears.fy2026.codes));
  const b = new Set(Object.keys(table.fiscalYears.fy2027.codes));
  const added = [...b].filter((c) => !a.has(c));
  const deleted = [...a].filter((c) => !b.has(c));
  // A fact about the fixture, not the corpus: refreshing for FY2028 will change this on
  // purpose, and this assertion is the reminder to look at what changed.
  assert.equal(added.length, 1, `added: ${added.join(', ')}`);
  assert.equal(deleted.length, 0, `deleted: ${deleted.join(', ')}`);
  assert.deepEqual(added, ['F64A']);
  // Every code is F-chapter and every value is [flag, shortDescription].
  for (const [fy, entry] of Object.entries(table.fiscalYears)) {
    for (const [code, value] of Object.entries(entry.codes)) {
      assert.ok(code.startsWith('F'), `${fy}: ${code} is not an F code`);
      assert.ok(['0', '1'].includes(value[0]), `${fy}: ${code} flag ${value[0]}`);
      assert.equal(typeof value[1], 'string');
    }
  }
  // The one code the corpus was measured to carry on 2026-09-18 is in both years.
  assert.equal(table.fiscalYears.fy2026.codes.F10231[0], '1');
  assert.equal(table.fiscalYears.fy2027.codes.F10231[0], '1');
});

test('classify flips tables at the October 1 boundary', () => {
  const out = py(`
from datetime import date
T = C.load_table(C.DEFAULT_TABLE)
before, after = date(2026, 9, 30), date(2026, 10, 1)
print(C.classify("F10231", T, before)["fy"], C.classify("F10231", T, after)["fy"])
print(C.classify("F10231", T, before)["status"], C.classify("F10231", T, after)["status"])
# F64A is the FY2027 addition: absent-but-coming before, present after.
print(C.classify("F64A", T, before)["status"], C.classify("F64A", T, after)["status"])
# A header row (billing flag 0) is allowed in prose.
print(C.classify("F10", T, before)["status"])
# A code that is in no table at all.
print(C.classify("F99999", T, after)["status"])`);
  assert.deepEqual(out.split('\n'), [
    'fy2026 fy2027',
    'valid-billable valid-billable',
    'new-next-fy valid-billable',
    'valid-header',
    'not-in-set',
  ]);
});

test('a code that exists only in the table in force is retiring before Oct 1, gone after', () => {
  // Pinned on a mini-table so it does not depend on which codes FY2027 happens to drop.
  const out = py(`
from datetime import date
T = {
  "fy2026": {"effective": date(2025, 10, 1), "codes": {"F99900": ["1", "old"]}},
  "fy2027": {"effective": date(2026, 10, 1), "codes": {}},
}
print(C.classify("F99900", T, date(2026, 9, 30))["status"])
print(C.classify("F99900", T, date(2026, 10, 1))["status"])`);
  assert.deepEqual(out.split('\n'), ['retiring', 'not-in-set']);
});

test('--self-test exits 0', () => {
  const proc = run(['--self-test']);
  assert.equal(proc.status, 0, `exited ${proc.status}: ${proc.stdout}\n${proc.stderr}`);
  assert.match(proc.stdout, /self-test: (\d+)\/\1 passed/);
});

test('the real scan examines files and reports coverage before its verdict', () => {
  const proc = run(['--as-of', '2026-09-18', '--json']);
  assert.ok([0, 1].includes(proc.status), `exited ${proc.status}: ${proc.stderr}`);
  const report = JSON.parse(proc.stdout);
  // The mention count is not asserted — the corpus changes nightly. Coverage is.
  assert.ok(report.filesScanned > 0, 'a scan of zero files is not a scan');
  assert.equal(report.fyInForce, 'fy2026');
  assert.equal(report.nextFy, 'fy2027');
  assert.equal(typeof report.codeMentions, 'number');
  assert.equal(typeof report.categoryMentions, 'number');
  assert.ok(['clean', 'findings'].includes(report.status));
  assert.equal(proc.status, report.findings.length ? 1 : 0);
});

test('an empty path list is exit 2, never a pass', () => {
  const proc = run(['--as-of', '2026-09-18', '--paths']);
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /nothing to scan/);
});

test('a missing table is exit 2, never a pass', () => {
  const proc = run(['--as-of', '2026-09-18', '--table', path.join(repo, 'bin', 'data', 'no_such_table.json')]);
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /not found/);
});
