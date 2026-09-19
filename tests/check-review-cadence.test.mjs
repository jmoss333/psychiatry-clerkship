/**
 * bin/check_review_cadence.py — names the evidence sources whose faculty review is late.
 *
 * monthly_review.py counts the cadence buckets and flips the gate when any source is due,
 * overdue or unknown, but it never names the rows and it has no lookahead. This tool applies
 * the SAME next-review definition (_add_months with month-end clamping) and lists them.
 *
 * What needs pinning is not the state of the corpus — the registry changes nightly and a test
 * may never assume what it contains — but the invariants that make the list trustworthy:
 *
 *   · each bucket boundary is exact, against a frozen date, in both directions;
 *   · month-end clamping matches monthly_review (Jan 31 + 1 month is Feb 28, not Mar 3);
 *   · a malformed date or an unrecognised cadence is `unknown` WITH a reason, never a silent
 *     default into some bucket;
 *   · the tool's own --self-test passes;
 *   · against the real registry, declared == examined == the number of sources in the file,
 *     so a run can never summarise over a shorter set than it claims to check.
 *
 * NO TEST HERE TOUCHES THE NETWORK: every subprocess is a local python3 reading tracked JSON.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'check_review_cadence.py');
const registry = path.join(repo, 'evidence_registry.json');

/** Run the CLI; returns the raw result so callers can assert on the exit code themselves. */
function run(args = []) {
  return spawnSync('python3', [script, ...args], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
}

/** Evaluate a snippet against the imported module. No network, no subprocess of its own. */
function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, "bin")\nfrom datetime import date\nimport check_review_cadence as C\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

/** classify() one synthetic source as of a frozen date and return the row. */
function classify(lastReviewed, cadence, asOf = '2026-09-18') {
  const last = lastReviewed === null ? 'None' : JSON.stringify(lastReviewed);
  const cad = cadence === null ? 'None' : JSON.stringify(cadence);
  return JSON.parse(py(`
import json
src = {"id": "x", "citation": {"title": "T"},
       "governance": {"lastReviewed": ${last}, "reviewCadence": ${cad}}}
print(json.dumps(C.classify(src, date.fromisoformat(${JSON.stringify(asOf)}))))`));
}

test('each bucket boundary is exact against a frozen date', () => {
  // as-of 2026-09-18. monthly last 08-17 -> next 09-17 (one day late); 08-18 -> today;
  // 08-19 -> one day out. annual last 2025-10-18 -> 30d out; 10-19 -> 31d; 12-17 -> 90d;
  // 12-18 -> 91d. Every boundary is checked from both sides so a threshold cannot drift.
  assert.equal(classify('2026-08-17', 'monthly').bucket, 'overdue');
  assert.equal(classify('2026-08-18', 'monthly').bucket, 'due');
  assert.equal(classify('2026-08-19', 'monthly').bucket, 'due-30d');
  assert.equal(classify('2025-10-18', 'annual').bucket, 'due-30d');
  assert.equal(classify('2025-10-19', 'annual').bucket, 'due-90d');
  assert.equal(classify('2025-12-17', 'annual').bucket, 'due-90d');
  assert.equal(classify('2025-12-18', 'annual').bucket, 'current');
  assert.equal(classify('2026-09-16', 'annual').bucket, 'current');
});

test('a row carries nextReview and a signed daysUntil', () => {
  const row = classify('2026-07-08', 'monthly');
  assert.equal(row.nextReview, '2026-08-08');
  assert.equal(row.daysUntil, -41);
  assert.equal(row.id, 'x');
  assert.equal(row.title, 'T');
  assert.equal(row.cadence, 'monthly');
});

test('month-end clamping matches monthly_review', () => {
  assert.equal(py('print(C._add_months(date(2026, 1, 31), 1))'), '2026-02-28');
  assert.equal(py('print(C._add_months(date(2028, 1, 31), 1))'), '2028-02-29');
  assert.equal(py('print(C._add_months(date(2028, 2, 29), 12))'), '2029-02-28');
  assert.equal(py('print(C._add_months(date(2026, 12, 15), 1))'), '2027-01-15');
  // ...and the clamp reaches the verdict: Aug 31 monthly is next due Sep 30, not Oct 1.
  assert.equal(classify('2026-08-31', 'monthly').nextReview, '2026-09-30');
  // Parity with the gate's own implementation, checked here as well as in --self-test.
  const same = py(`
import sys; sys.path.insert(0, "13_Faculty_Resources/_automation/maintenance")
import monthly_review as M
cases = [(date(2026,1,31),1),(date(2028,1,31),1),(date(2028,2,29),12),(date(2026,12,31),1),(date(2024,2,29),12)]
print(all(C._add_months(d, m) == M._add_months(d, m) for d, m in cases))`);
  assert.equal(same, 'True');
});

test('a malformed date or an unrecognised cadence is unknown, with a reason', () => {
  for (const [last, cadence, needle] of [
    ['2026-7-8', 'annual', /malformed/],
    ['not a date', 'annual', /malformed/],
    ['', 'annual', /missing/],
    [null, 'annual', /missing/],
    ['2026-09-19', 'annual', /after as-of/],
    ['2026-07-08', 'quarterly', /reviewCadence/],
    ['2026-07-08', 'Annual', /reviewCadence/],
    ['2026-07-08', null, /reviewCadence/],
  ]) {
    const row = classify(last, cadence);
    assert.equal(row.bucket, 'unknown', `${last} / ${cadence}`);
    assert.match(row.reason, needle, `${last} / ${cadence}`);
    assert.equal(row.nextReview, null);
    assert.equal(row.daysUntil, null);
  }
  // The good case stays silent: a well-formed source is never unknown.
  assert.notEqual(classify('2026-07-08', 'annual').bucket, 'unknown');
});

test('--self-test exits 0', () => {
  const proc = run(['--self-test']);
  assert.equal(proc.status, 0, `exited ${proc.status}:\n${proc.stdout}\n${proc.stderr}`);
  assert.match(proc.stdout, /self-test: (\d+)\/\1 passed/);
});

test('against the tracked registry, declared == examined == sources in the file', () => {
  // No bucket count is asserted here: the corpus changes nightly and a test may never assume
  // the state of the tracked data. What is pinned is that the run cannot silently shrink.
  const declaredInFile = JSON.parse(fs.readFileSync(registry, 'utf8')).sources.length;
  const proc = run(['--as-of', '2026-09-18', '--json']);
  assert.ok([0, 1].includes(proc.status), `exited ${proc.status}: ${proc.stderr}`);
  const blob = JSON.parse(proc.stdout);
  assert.equal(blob.asOf, '2026-09-18');
  assert.equal(blob.declared, declaredInFile);
  assert.equal(blob.examined, declaredInFile);
  assert.equal(blob.rows.length, declaredInFile);
  const summed = Object.values(blob.counts).reduce((a, b) => a + b, 0);
  assert.equal(summed, declaredInFile, 'bucket counts must partition the registry');
  // The exit code must agree with the counts, whatever they are tonight.
  const failing = blob.counts.overdue + blob.counts.due + blob.counts.unknown;
  assert.equal(proc.status, failing > 0 ? 1 : 0);
});

test('the coverage line precedes the verdict in the human report', () => {
  const proc = run(['--as-of', '2026-09-18']);
  const first = proc.stdout.split('\n')[0];
  assert.match(first, /^review cadence: \d+ source\(s\) declared, \d+ examined, as of 2026-09-18$/);
});

test('a corrupt registry is exit 2, never a clean pass', () => {
  const dir = fs.mkdtempSync(path.join(repo, '.tmp-cadence-'));
  try {
    const bad = path.join(dir, 'registry.json');
    fs.writeFileSync(bad, '{not json');
    const proc = run(['--registry', bad, '--as-of', '2026-09-18']);
    assert.equal(proc.status, 2);
    assert.match(proc.stderr, /cannot run/);
    const missing = run(['--registry', path.join(dir, 'absent.json'), '--as-of', '2026-09-18']);
    assert.equal(missing.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('it carries no machine-specific paths', () => {
  assert.doesNotMatch(fs.readFileSync(script, 'utf8'), /\/(Users|sessions)\/[a-z]/);
});

// --- surveillance credit (policy 2026-09-19: a green guideline-surveillance examination counts
//     as the review; withheld across a change the faculty have not actioned). Derived at read
//     time from the job's own records; the registry is never written.

function classifyWith(source, surveillance, asOf = '2026-09-18') {
  return JSON.parse(py(`
import json
src = ${JSON.stringify(source)}
surv = ${surveillance === null ? 'None' : `json.loads(${JSON.stringify(JSON.stringify(surveillance))})`}
if surv is not None:
    for v in surv.values():
        v["examinedAt"] = date.fromisoformat(v["examinedAt"]) if v.get("examinedAt") else None
print(json.dumps(C.classify(src, date.fromisoformat(${JSON.stringify(asOf)}), surv)))`));
}

const surveilled = {
  id: 's', citation: { title: 'T' }, surveillance: { job: 'guideline-surveillance' },
  governance: { lastReviewed: '2026-07-08', reviewCadence: 'monthly' },
};

test('surveillance credit: a green examination counts, a pending change does not, and the row says which', () => {
  const clean = classifyWith(surveilled, { s: { examinedAt: '2026-09-01', openChanges: [] } });
  assert.equal(clean.reviewedBy, 'guideline-surveillance');
  assert.equal(clean.effectiveReviewed, '2026-09-01');
  assert.equal(clean.bucket, 'due-30d');
  const changed = classifyWith(surveilled, {
    s: { examinedAt: '2026-09-01', openChanges: [{ detectedAt: '2026-08-31', status: 'issue-open', severity: 'P0' }] },
  });
  assert.equal(changed.reviewedBy, 'faculty');
  assert.equal(changed.bucket, 'overdue');
  assert.match(changed.surveillance, /change detected 2026-08-31/);
  const absent = classifyWith(surveilled, {});
  assert.equal(absent.bucket, 'overdue');
  assert.match(absent.surveillance, /no successful examination/);
  const disabled = classifyWith(surveilled, null);
  assert.equal(disabled.bucket, 'overdue');
  assert.equal(disabled.surveillance, 'credit disabled');
});

test('surveillance credit: only the guideline job earns it', () => {
  const linkOnly = { ...surveilled, surveillance: { job: 'link-source-monitor' } };
  const r = classifyWith(linkOnly, { s: { examinedAt: '2026-09-01', openChanges: [] } });
  assert.equal(r.reviewedBy, 'faculty');
  const plain = { ...surveilled, surveillance: undefined };
  assert.equal(classifyWith(plain, { s: { examinedAt: '2026-09-01', openChanges: [] } }).reviewedBy, 'faculty');
});

test('surveillance credit: the real run reports what evidence it read, and credit never exceeds baselines', () => {
  const proc = run(['--as-of', '2026-09-18', '--json']);
  assert.ok(proc.status === 0 || proc.status === 1, proc.stderr);
  const blob = JSON.parse(proc.stdout);
  const sc = blob.surveillanceCredit;
  assert.ok(sc && typeof sc.baselines === 'number' && typeof sc.sourcesCredited === 'number');
  assert.ok(sc.sourcesCredited <= sc.baselines, 'cannot credit more sources than baselines read');
  for (const r of blob.rows) {
    if (r.reviewedBy === 'guideline-surveillance') {
      assert.ok(r.effectiveReviewed >= r.lastReviewed, `${r.id}: credit moved the review backwards`);
    }
  }
});
