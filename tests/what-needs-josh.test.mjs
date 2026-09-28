/**
 * bin/what_needs_josh.py — the author-gated mirror of the agent work queue.
 *
 * what_can_i_do_today.py answers "what can an unattended agent do here". Nothing answered the
 * other half — what can ONLY the author do — so attestation and a rights decision lived in
 * memory files and handoff notes. (The Interview Room red-team signature was a row until
 * 2026-09-27; decision sp-redteam-signoff-retired made the live checklist optional.)
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
 *     task writing them retired it having confirmed nothing.
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

test('the retired red-team row stays retired (decision sp-redteam-signoff-retired)', () => {
  // The live checklist is optional since 2026-09-27, so a signature for it is not owner work.
  // A row that came back would put a permanent, never-satisfied item on the owner's list again.
  const proc = run(['--json']);
  assert.equal(proc.status, 0);
  const keys = JSON.parse(proc.stdout).map((row) => row.key);
  assert.ok(!keys.includes('red-team'), `red-team row is back: ${keys.join(', ')}`);
  assert.doesNotMatch(fs.readFileSync(script, 'utf8'), /def measure_red_team/);
});

test('a page whose text changed after review is owed a re-attestation, not settled', () => {
  // Root cause 2 of the 2026-09-16 breach: a reviewed row named a person and a date and
  // never the text. Once it names the text, an edit to that text is visible — and it is
  // the author's work, because only the author can re-attest. A row that still read as
  // settled would hide exactly the pages the breach rewrote.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wnj-'));
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs', 'ward.md'), '# Ward\n\nedited AFTER the review\n');
  fs.writeFileSync(path.join(tmp, 'shipped.json'), JSON.stringify({
    version: 1,
    pages: [{
      slug: 'ward.md', kind: 'page', sites: ['ms3'], title: 'Ward',
      source: 'docs/ward.md', producer: 'site_manifest',
    }],
  }));
  fs.writeFileSync(path.join(tmp, 'reviewed.json'), JSON.stringify({
    'ward.md': {
      status: 'reviewed', at: '2026-07-13', by: 'Historical Reviewer, MD',
      risk: { kind: 'clinical', level: 'high' },
      contentHash: '0'.repeat(40),   // bound to text this file no longer contains
    },
  }));
  fs.writeFileSync(path.join(tmp, 'topic_meta.json'), '{}');
  const out = py(`
import pathlib
J.ROOT = pathlib.Path(${JSON.stringify(tmp)})
J.SHIPPED = J.ROOT / "shipped.json"
J.REVIEWED = J.ROOT / "reviewed.json"
J.TOPIC_META = J.ROOT / "topic_meta.json"
print(J.describe_reattestation())
print(J.measure_reattestation())
print(J.measure_attestation())`);
  const [detail, reattest, attestation] = out.split('\n');
  assert.equal(detail, 'Re-attest 1 page whose inputs changed since review: ward.md');
  assert.equal(reattest, '(1, 1)');
  assert.equal(attestation, '(1, 1)', 'a drifted row must not count as settled');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a long drift list names the first few and says how many more', () => {
  // A 94-slug paragraph is a line nobody reads, and an uncapped one is what today's
  // backlog would render. The count stays exact; only the naming is capped.
  const out = py(`
J.stale_attestations = lambda: ["p%02d.md" % i for i in range(12)]
print(J.describe_reattestation())`);
  assert.match(out, /^Re-attest 12 pages whose inputs changed since review: p00\.md, p01\.md/);
  assert.match(out, / … and 4 more$/);
  assert.ok(!out.includes('p08.md'), 'the capped tail must not be named');
});

test('a pack case that is not reviewed is owner work, named, until it is flipped', () => {
  // Decision pack-case-review-is-registration as amended 2026-09-27. Controlled fixture, never the live pack: a live
  // count is a test of the owner's queue, and adding a pending case in a content PR would turn
  // it red for being right.
  const out = py(`
import json, tempfile, pathlib
pack = {"cases": [
  {"id": "sp_fixture_reviewed_001", "facultyReview": {"status": "reviewed", "reviewer": "R", "lastReviewed": "2026-01-01"}},
  {"id": "sp_fixture_pending_001", "facultyReview": {"status": "pending", "reviewer": None, "lastReviewed": None}},
]}
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "pack.json"; p.write_text(json.dumps(pack), encoding="utf-8")
    J.PACK = p
    print(J.measure_pack_cases(), "|", J.describe_pack_cases())
    pack["cases"][1]["facultyReview"]["status"] = "reviewed"
    p.write_text(json.dumps(pack), encoding="utf-8")
    print(J.measure_pack_cases())`);
  const [waiting, retired] = out.split('\n');
  assert.equal(waiting, '(1, 2) | Read and flip to reviewed: sp_fixture_pending_001');
  assert.equal(retired, '(0, 2)', 'the row retires itself once the case is reviewed');
});

test('pack-cases counts every case that is not literally reviewed: attested is not selectable', () => {
  // Codex P2 on #855: the predicate read `attested` as done. The attestation validator lets
  // `attested` into a reviewed pack, but the tool, the proxy and bin/redteam-offline.mjs select
  // on exactly `reviewed` (the runner refuses `attested` with FAIL PACK), so an `attested` case
  // is a case learners cannot select that no surface names -- exactly what this row is for.
  // A missing block, a null block, an empty or whitespace-padded status, a typo and a case with
  // no id count the same way (the id-less one is named "?"); only the literal flip retires.
  const out = py(`
import json, tempfile, pathlib
pack = {"cases": [
  {"id": "sp_fixture_reviewed_001", "facultyReview": {"status": "reviewed", "reviewer": "R", "lastReviewed": "2026-01-01"}},
  {"id": "sp_fixture_attested_001", "facultyReview": {"status": "attested", "reviewer": "R", "lastReviewed": "2026-01-01"}},
  {"id": "sp_fixture_typo_001", "facultyReview": {"status": "Reviewed", "reviewer": "R", "lastReviewed": "2026-01-01"}},
  {"id": "sp_fixture_blockless_001"},
  {"id": "sp_fixture_padded_001", "facultyReview": {"status": " reviewed", "reviewer": "R", "lastReviewed": "2026-01-01"}},
  {"id": "sp_fixture_nullblock_001", "facultyReview": None},
  {"id": "sp_fixture_empty_001", "facultyReview": {"status": "", "reviewer": None, "lastReviewed": None}},
  {"facultyReview": {"status": "pending", "reviewer": None, "lastReviewed": None}},
]}
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "pack.json"; p.write_text(json.dumps(pack), encoding="utf-8")
    J.PACK = p
    print(J.measure_pack_cases(), "|", J.describe_pack_cases())
    for c in pack["cases"]:
        c["facultyReview"] = {"status": "reviewed", "reviewer": "R", "lastReviewed": "2026-01-01"}
    p.write_text(json.dumps(pack), encoding="utf-8")
    print(J.measure_pack_cases())`);
  const [waiting, retired] = out.split('\n');
  assert.equal(
    waiting,
    '(7, 8) | Read and flip to reviewed: sp_fixture_attested_001, sp_fixture_typo_001, '
      + 'sp_fixture_blockless_001, sp_fixture_padded_001, sp_fixture_nullblock_001, sp_fixture_empty_001, ?',
  );
  assert.equal(retired, '(0, 8)', 'only the literal reviewed spelling retires the row');
});

test('the pack-cases row is wired to its own measure and detail', () => {
  // Both tests above call the functions directly; without this pin a row that counted with a
  // different measure, or dropped its detail (describe() renders "" for a missing detail), would
  // keep every test green while the queue stopped naming the cases -- the naming is the point.
  const out = py(`
row = next(r for r in J.ROWS if r["key"] == "pack-cases")
print(row["measure"] is J.measure_pack_cases, row.get("detail") is J.describe_pack_cases)`);
  assert.equal(out, 'True True', 'the row must count with measure_pack_cases and name with describe_pack_cases');
});

test('a pack whose cases are missing or not a list reports unknown for pack-cases, never zero', () => {
  // The invariant at the top of this file, on this row's own failure path: a pack this cannot
  // read must degrade to unknown, because (0, 0) would render as done and retire the row.
  const out = py(`
import json, tempfile, pathlib
row = next(r for r in J.ROWS if r["key"] == "pack-cases")
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "pack.json"
    J.PACK = p
    p.write_text(json.dumps({"version": "2", "engine": {}}), encoding="utf-8")
    print(J.evaluate(row)[0])
    p.write_text(json.dumps({"cases": {"sp_x": {"facultyReview": {"status": "pending"}}}}), encoding="utf-8")
    print(J.evaluate(row)[0])`);
  assert.equal(out, 'unknown\nunknown', 'a pack this cannot read must not retire the row');
});

test('a long pack-case list names the first few and says how many more', () => {
  const out = py(`
J._pack_cases_not_reviewed = lambda: (["sp_c%02d" % i for i in range(12)], 12)
print(J.describe_pack_cases())`);
  assert.match(out, /^Read and flip to reviewed: sp_c00, sp_c01/);
  assert.match(out, / and 4 more$/);
  assert.ok(!out.includes('sp_c08'), 'the capped tail must not be named');
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
  const ok = run(['--why', 'pack-cases']);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /pack-case-review-is-registration/);
  const bad = run(['--why', 'not-a-row']);
  assert.equal(bad.status, 0, 'a typo must not fail the report');
  assert.match(bad.stderr, /no such row/);
});

test('it carries no machine-specific paths', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /\/Users\//, 'derive paths from __file__, never hard-code a home');
  assert.doesNotMatch(source, /\/sessions\//);
});
