/**
 * bin/check_claim_direction.py — does a newer paper still say what a stored claim says it says?
 *
 * The supersession finding from check_source_integrity.py is "here is a new paper"; this turns it
 * into "here is what the new paper says about the sentence you teach". What is pinned:
 *
 *   · the null/negative marker list is the C5 gate's own (imported), so the two cannot drift;
 *   · each verdict fires on its case and is silent on its neighbours — consistent, contradicts,
 *     unlocated, unclear — and a descriptive claim is never judged contradicted;
 *   · span survival is sentence-level and verbatim (all / partial / none);
 *   · the quoted statistics are named when the newer abstract drops them;
 *   · an empty abstract or a source with no claims is exit 2, never a verdict;
 *   · the verdict is advisory: exit 0 unless --strict.
 *
 * NO TEST HERE TOUCHES THE NETWORK: --abstract-file and inline fixtures only.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'check_claim_direction.py');

function py(snippet) {
  const proc = spawnSync(
    'python3',
    ['-c', `import sys, json; sys.path.insert(0, "bin")\nimport check_claim_direction as D\n${snippet}`],
    { cwd: repo, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

const SPAN = 'For the primary outcome of treatment response, we found evidence of beneficial effect for selective serotonin reuptake inhibitors (SSRIs) compared with placebo (risk ratio (RR) 0.66, 95% confidence interval (CI) 0.59 to 0.74). This improved symptoms in 58% versus 35%.';
const ANN = {
  sourceId: 's', verifiedAgainst: { sourceSpan: SPAN, doi: '10.1/pub3', retrievedAt: '2026-09-16' },
  claims: [{ claimId: 'c1', direction: 'positive',
    claimText: 'SSRIs had a beneficial effect on treatment response (RR 0.66, 95% CI 0.59 to 0.74), 58% vs 35%.',
    claimTerms: ['treatment response', 'selective serotonin reuptake inhibitors'] }],
};

function compare(abstract, ann = ANN) {
  return JSON.parse(py(`
print(json.dumps(D.compare(json.loads(${JSON.stringify(JSON.stringify(ann))}), ${JSON.stringify(abstract)})))`));
}

test('the negative marker list is the C5 validator\'s own', () => {
  const out = JSON.parse(py(`
import importlib.util
spec = importlib.util.spec_from_file_location("v", str(D.VALIDATOR)); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps(list(D.NEGATIVE_MARKERS) == list(m.NEGATIVE_MARKERS)))`));
  assert.equal(out, true);
});

test('consistent: span survives whole and the located sentence agrees', () => {
  const r = compare('Main results: ' + SPAN + ' Conclusions: SSRIs are first-line.');
  assert.equal(r.worst, 'consistent');
  assert.equal(r.spanSurvival.status, 'all');
  assert.deepEqual(r.claims[0].numbersMissing, []);
});

test('contradicts: a null result on the same outcome, span gone, numbers missing', () => {
  const r = compare('Main results: For the primary outcome of treatment response, we found no significant difference between selective serotonin reuptake inhibitors (SSRIs) and placebo (RR 0.98, 95% CI 0.85 to 1.12).');
  assert.equal(r.worst, 'contradicts');
  assert.equal(r.spanSurvival.status, 'none');
  assert.ok(r.claims[0].numbersMissing.includes('0.66'));
  assert.equal(r.claims[0].located[0].direction, 'negative');
});

test('unlocated and unclear are distinct verdicts', () => {
  assert.equal(compare('Main results: We included 12 trials of psychotherapy for depression. Outcomes improved.').worst, 'unlocated');
  assert.equal(compare('Main results: For the primary outcome of treatment response we report the pooled estimate below.').worst, 'unclear');
});

test('a descriptive claim is located but never contradicted', () => {
  const ann = { ...ANN, claims: [{ ...ANN.claims[0], direction: 'descriptive' }] };
  const r = compare('Main results: For the primary outcome of treatment response, we found no significant difference.', ann);
  assert.equal(r.worst, 'unclear');
});

test('empty abstract and claimless annotation are refused, never judged', () => {
  for (const snippet of [
    `D.compare(json.loads(${JSON.stringify(JSON.stringify(ANN))}), "   ")`,
    `D.compare({"sourceId": "x", "claims": []}, "Main results: something.")`,
  ]) {
    const out = py(`
try:
    ${snippet}; print("no-raise")
except D.DirectionError as e:
    print("raised")`);
    assert.equal(out, 'raised');
  }
});

test('CLI: offline --abstract-file run; advisory exit 0, --strict exit 1 on contradicts, exit 2 on unknown source', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-direction-'));
  const annp = path.join(dir, 'ann.json'); fs.writeFileSync(annp, JSON.stringify({ annotations: [ANN] }));
  const good = path.join(dir, 'good.txt'); fs.writeFileSync(good, 'Main results: ' + SPAN);
  const bad = path.join(dir, 'bad.txt'); fs.writeFileSync(bad, 'Main results: For the primary outcome of treatment response, we found no significant difference.');
  const run = (args) => spawnSync('python3', [script, '--annotations', annp, ...args], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  const ok = run(['--source-id', 's', '--abstract-file', good]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /CONSISTENT/);
  assert.equal(run(['--source-id', 's', '--abstract-file', bad]).status, 0);
  assert.equal(run(['--source-id', 's', '--abstract-file', bad, '--strict']).status, 1);
  assert.equal(run(['--source-id', 'nope', '--abstract-file', good]).status, 2);
});

test('the tool proves itself: --self-test exits 0', () => {
  const proc = spawnSync('python3', [script, '--self-test'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  assert.equal(proc.status, 0, proc.stdout + proc.stderr);
  assert.match(proc.stdout, /self-test: (\d+)\/\1 passed/);
});

test('no hard-coded machine paths', () => {
  assert.doesNotMatch(fs.readFileSync(script, 'utf8'), /\/(Users|sessions)\/[a-z]/);
});
