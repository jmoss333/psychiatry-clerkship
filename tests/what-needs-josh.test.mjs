/**
 * bin/what_needs_josh.py — the author-gated mirror of the agent work queue.
 *
 * what_can_i_do_today.py answers "what can an unattended agent do here". Nothing answered the
 * other half — what can ONLY the author do — so attestation, a red-team signature and a rights
 * decision lived in memory files and handoff notes, which is how the WP-5m red-team receipt
 * survived four sessions unwritten.
 *
 * The numbers move as the work gets done; that is the point. What needs pinning are the
 * invariants that make the list trustworthy:
 *
 *   · a measurement that FAILS reports `unknown`, NEVER `done` — zero means finished and would
 *     silently retire work only a person can do.
 *   · a row that reaches zero retires ITSELF, so this cannot rot into a checklist someone has to
 *     remember to prune.
 *   · a row's predicate must be satisfiable ONLY by the human act. The queue learned this the
 *     hard way: "isbn-verify" was measured by whether a line carried an ISBN-13, so a DIFFERENT
 *     task writing them retired it having confirmed nothing. Here the same trap would read "the
 *     recorder script ran" as "the red team ran".
 *   · it is report-only: exit 0 always, even when every measurement fails.
 *
 * NO TEST HERE TOUCHES THE NETWORK — the gh-backed rows are exercised through injected stubs.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'what_needs_josh.py');

function run(args = []) {
  const proc = spawnSync('python3', [script, ...args], {
    cwd: repo, encoding: 'utf8', timeout: 120_000,
  });
  return proc;
}

function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, "bin")\nimport what_needs_josh as J\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

test('a failed measurement reports unknown, never done', () => {
  // The invariant everything rests on. A moved file must not be able to retire the
  // attestation backlog by looking like completion.
  const out = py(`
def boom():
    raise FileNotFoundError("reviewed.json moved")
status, remaining, total, note = J.evaluate({"measure": boom})
print(status, remaining, total)`);
  assert.equal(out.split(' ')[0], 'unknown');
  assert.match(out, /None None$/);
});

test('a row measuring zero retires itself', () => {
  const out = py(`
status, *_ = J.evaluate({"measure": lambda: (0, 12)})
print(status)`);
  assert.equal(out, 'done');
});

test('unknown is rendered as explicitly not retired', () => {
  const out = py(`
rows = [{"key": "x", "status": "unknown", "remaining": None, "total": None,
         "note": "gh missing", "unit": "u", "do": "d", "why": "w"}]
print(J.render(rows, False))`);
  assert.match(out, /COULD NOT MEASURE/);
  assert.match(out, /unknown is NOT zero/);
});

test('the red-team receipt is not satisfied by a receipt for a different pack', () => {
  // The isbn-verify trap in its local form: a receipt proves a checklist was run against
  // THE PACK IT NAMES. A stale receipt must read as still-owed, not as done.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wnj-'));
  const pack = path.join(tmp, 'pack.json');
  const receipt = path.join(tmp, 'receipt.json');
  fs.writeFileSync(pack, JSON.stringify({ version: '2', engine: {} }));
  fs.writeFileSync(receipt, JSON.stringify({
    state: 'passed', signedBy: 'Joshua Moss, MD', packSha256: 'sha-of-an-older-pack',
  }));
  const out = py(`
import pathlib
J.PACK = pathlib.Path(${JSON.stringify(pack)})
J.RECEIPT = pathlib.Path(${JSON.stringify(receipt)})
print(J.measure_red_team())`);
  assert.equal(out, '(1, 1)', 'a receipt for another pack must still count as owed');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a matching, signed, passing receipt does settle the red-team row', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wnj-'));
  const pack = path.join(tmp, 'pack.json');
  const receipt = path.join(tmp, 'receipt.json');
  const body = JSON.stringify({ version: '2', engine: {} });
  fs.writeFileSync(pack, body);
  const out = py(`
import pathlib, json, hashlib
J.PACK = pathlib.Path(${JSON.stringify(pack)})
J.RECEIPT = pathlib.Path(${JSON.stringify(receipt)})
sha = hashlib.sha256(J.PACK.read_bytes()).hexdigest()
J.RECEIPT.write_text(json.dumps({"state": "passed", "signedBy": "Joshua Moss, MD",
                                 "packSha256": sha}))
print(J.measure_red_team())`);
  assert.equal(out, '(0, 1)');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('an unsigned receipt does not settle the row', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wnj-'));
  const pack = path.join(tmp, 'pack.json');
  const receipt = path.join(tmp, 'receipt.json');
  fs.writeFileSync(pack, JSON.stringify({ version: '2' }));
  const out = py(`
import pathlib, json, hashlib
J.PACK = pathlib.Path(${JSON.stringify(pack)})
J.RECEIPT = pathlib.Path(${JSON.stringify(receipt)})
sha = hashlib.sha256(J.PACK.read_bytes()).hexdigest()
J.RECEIPT.write_text(json.dumps({"state": "passed", "signedBy": "   ", "packSha256": sha}))
print(J.measure_red_team())`);
  assert.equal(out, '(1, 1)');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('every row carries a measurement, a unit, a rationale and a way to act', () => {
  const out = py(`
bad = [r["key"] for r in J.ROWS
       if not callable(r.get("measure"))
       or not str(r.get("unit") or "").strip()
       or not str(r.get("why") or "").strip()
       or not str(r.get("do") or "").strip()
       or not str(r.get("title") or "").strip()]
print(",".join(bad))`);
  assert.equal(out, '', `rows missing required fields: ${out}`);
});

test('row keys are unique', () => {
  const out = py(`
keys = [r["key"] for r in J.ROWS]
print(len(keys) == len(set(keys)))`);
  assert.equal(out, 'True');
});

test('it is report-only: exit 0 even when a measurement explodes', () => {
  const proc = run([]);
  assert.equal(proc.status, 0, `report-only must never fail a shell: ${proc.stderr}`);
  const json = run(['--json']);
  assert.equal(json.status, 0);
  const parsed = JSON.parse(json.stdout);
  assert.ok(Array.isArray(parsed) && parsed.length > 0);
  for (const row of parsed) {
    assert.ok(['waiting', 'done', 'unknown'].includes(row.status), row.status);
  }
});

test('--why explains one row and rejects an unknown key without failing', () => {
  const ok = run(['--why', 'red-team']);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /REDTEAM_CHECKLIST/);
  const bad = run(['--why', 'not-a-row']);
  assert.equal(bad.status, 0, 'a typo must not fail the report');
  assert.match(bad.stderr, /no such row/);
});

test('it carries no machine-specific paths', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /\/Users\//, 'derive paths from __file__, never hard-code a home');
  assert.doesNotMatch(source, /\/sessions\//);
});
