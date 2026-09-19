/**
 * bin/check_source_integrity.py — asks PubMed and Crossref whether each registry source still
 * stands (retraction, erratum, expression of concern, newer version) and reports only what the
 * registry does not already record.
 *
 * What needs pinning is not the state of the world — PubMed changes daily and no test may
 * reach it — but the invariants that make the classifier trustworthy:
 *
 *   · Crossref DIRECTION: `updated-by` (this work was superseded) is the signal; `update-to`
 *     (this work supersedes an older one) is ignored. The first live run on 2026-09-18 read the
 *     wrong field and flagged five current Cochrane editions as superseded by their own
 *     predecessors;
 *   · a retraction of a source that licenses a stored claim is P0; the same retraction on a
 *     non-licensing source is P1; an erratum is P1/P2 by the same split; an update is P2;
 *   · a correction the registry already records is `recorded`, never a finding, and a
 *     weaker record (`corrected`) does not cover a stronger fact (retraction);
 *   · a PMID PubMed has no record for is a P1 finding, not a silent skip;
 *   · the tool's own --self-test passes, and it proves a transport failure is exit 2;
 *   · coverage is stated: declared, identified, examined, and the identifier-less sources by
 *     name — a run can never summarise over a shorter set than it claims to check.
 *
 * NO TEST HERE TOUCHES THE NETWORK: every subprocess is a local python3 driving the pure
 * functions with inline fixtures. The live run is a Monday-morning task from a machine with
 * real egress, not a CI step.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'check_source_integrity.py');

/** Evaluate a snippet against the imported module. No network, no subprocess of its own. */
function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys, json; sys.path.insert(0, "bin")\nimport check_source_integrity as S\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

function src(id, extra = {}) {
  return JSON.stringify({
    id,
    citation: { pmid: extra.pmid ?? '', doi: extra.doi ?? '' },
    governance: { correctionStatus: extra.status ?? 'none-known', supersededBy: extra.superseded ?? [] },
  });
}

/** classify_source() with the module's own retracted-paper XML fixture. */
function classify(source, pmid, crossref = 'None', licensing = '{"lic"}') {
  return JSON.parse(py(`
recs = S.parse_pubmed_xml(S._RETRACTED_XML)
row = S.classify_source(${source}, recs.get(${JSON.stringify(pmid)}), ${crossref}, ${licensing}, pubmed_answered=True)
print(json.dumps(row))`));
}

test('Crossref direction: updated-by is the signal, update-to is ignored', () => {
  const out = JSON.parse(py(`
a = S.parse_crossref({"update-to": [{"type": "new_version", "DOI": "10.1/older"}]})
b = S.parse_crossref({"updated-by": [{"type": "new_version", "DOI": "10.1/newer", "updated": {"date-time": "2026-05-28T00:00:00Z"}}]})
c = S.parse_crossref({"updated-by": [{"type": "retraction", "DOI": "10.1/r"}, {"type": "corrigendum", "DOI": "10.1/c"}, {"type": "mystery", "DOI": "10.1/x"}]})
print(json.dumps([a, b, c]))`));
  assert.deepEqual(out[0], []);
  assert.deepEqual(out[1].map((u) => [u.kind, u.doi, u.updated]), [['updated', '10.1/newer', '2026-05-28']]);
  assert.deepEqual(out[2].map((u) => u.kind), ['retracted', 'erratum']);
});

test('PubMed parse keeps status RefTypes and drops conversation', () => {
  const out = JSON.parse(py(`
recs = S.parse_pubmed_xml(S._RETRACTED_XML)
print(json.dumps({k: [c["kind"] for c in v["corrections"]] for k, v in recs.items()}))`));
  assert.deepEqual(out['1000001'], ['retracted', 'expression-of-concern']); // CommentIn dropped
  assert.deepEqual(out['1000002'], []);
  assert.deepEqual(out['1000003'], ['updated', 'erratum']);
  assert.deepEqual(out['1000004'], ['retracted']); // pubtype alone
});

test('severity follows the licensing split', () => {
  assert.equal(classify(src('lic', { pmid: '1000001' }), '1000001').worst, 'P0');
  assert.equal(classify(src('other', { pmid: '1000001' }), '1000001').worst, 'P1');
  const lic3 = classify(src('lic', { pmid: '1000003' }), '1000003');
  assert.deepEqual(lic3.findings.map((f) => [f.kind, f.severity]), [['erratum', 'P1'], ['updated', 'P2']]);
  const other3 = classify(src('other', { pmid: '1000003' }), '1000003');
  assert.deepEqual(new Set(other3.findings.map((f) => f.severity)), new Set(['P2']));
});

test('a recorded correction is not a finding; a weaker record does not cover a retraction', () => {
  const recorded = classify(src('lic', { pmid: '1000001', status: 'retracted' }), '1000001');
  assert.deepEqual(recorded.findings, []);
  assert.equal(recorded.recordedSignals.length, 2);
  const weak = classify(src('lic', { pmid: '1000001', status: 'corrected' }), '1000001');
  assert.equal(weak.worst, 'P0');
  const superseded = classify(src('lic', { pmid: '1000003', status: 'corrected', superseded: ['new-2024'] }), '1000003');
  assert.deepEqual(superseded.findings, []);
});

test('a PMID PubMed has no record for is a P1 finding, never a silent skip', () => {
  const row = classify(src('lic', { pmid: '4040404' }), '4040404');
  assert.equal(row.worst, 'P1');
  assert.equal(row.findings[0].kind, 'pmid-unresolved');
});

test('identifiers are validated, not trusted', () => {
  const out = JSON.parse(py(`
print(json.dumps([S.identifiers(${src('a', { pmid: '12x' })}), S.identifiers(${src('a', { doi: 'https://doi.org/x' })}),
                  S.identifiers(${src('a', { pmid: '123', doi: '10.1016/S0140' })})]))`));
  assert.deepEqual(out, [['', ''], ['', ''], ['123', '10.1016/s0140']]);
});

test('coverage is stated with the verdict and unverifiable sources are named', () => {
  const text = py(`
rows = []
s = S.summarize(rows, 3, 1, 1, 0, ["no-id-a", "no-id-b"], [])
print(S.render(s))`);
  const first = text.split('\n')[0];
  assert.match(first, /^source integrity: 3 source\(s\) declared, 1 with a PMID or DOI, 1 answered by PubMed/);
  assert.match(text, /unverifiable by id \(no PMID, no DOI\): no-id-a, no-id-b/);
  assert.match(text, /source integrity: clean/);
});

test('the tool proves itself: --self-test exits 0 (includes transport-failure → exit 2)', () => {
  const proc = spawnSync('python3', [script, '--self-test'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  assert.equal(proc.status, 0, proc.stdout + proc.stderr);
  assert.match(proc.stdout, /transport failure is exit 2, never a pass/);
  assert.match(proc.stdout, /self-test: (\d+)\/\1 passed/);
});

test('no hard-coded machine paths (read the file, so an untracked copy cannot pass vacuously)', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(text, /\/(Users|sessions)\/[a-z]/);
});
