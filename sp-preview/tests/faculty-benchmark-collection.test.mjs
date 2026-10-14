import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('../evals/evidence-brief-v1.json', import.meta.url), 'utf8'));

test('pinned Git metadata collector exactly reproduces the manifest without source excerpts', () => {
  const recovered = JSON.parse(execFileSync('python3', ['sp-preview/qa/collect-faculty-benchmark.py'], {cwd: root, encoding:'utf8'}));
  assert.deepEqual(recovered, manifest);
  for (const item of recovered.cases.filter(c => !c.synthetic)) {
    assert.equal(Object.hasOwn(item, 'text'), false);
    for (const key of ['oldSnapshot','newSnapshot']) {
      if (item[key]) {
        assert.equal(item[key].hashVerified, true);
        assert.equal(item[key].textSha256, item[key].recordedHash);
        assert.equal(Object.hasOwn(item[key], 'text'), false);
      }
    }
  }
});

test('recovered extractor pairs cannot count as approved clinical changes', () => {
  const historical = manifest.cases.filter(c => c.kind === 'historical-candidate');
  assert.equal(historical.length, 6);
  assert.equal(historical.filter(c => c.exactExtractedPairRecovered).length, 5);
  assert.equal(historical.filter(c => c.facultyLabel && c.rightsReceipt).length, 0);
  assert.equal(manifest.gate.status, 'blocked');
  assert.equal(manifest.enabled, false);
  assert.equal(manifest.providerCalls, 0);
  for (const c of historical) {
    assert.equal(c.expectedCriticalImplications, null);
    assert.equal(c.publisherOriginalArtifactsRecovered, false);
    assert.equal(c.eligibility, 'blocked');
  }
});

test('missing historical AACAP bytes remain missing and controls are distinctly scoped', () => {
  const missing = manifest.cases.find(c => c.id === 'aacap-parameters-2026-08-31');
  assert.equal(missing.oldSnapshot, null);
  assert.equal(missing.exactExtractedPairRecovered, false);
  const unchanged = manifest.cases.filter(c => c.kind === 'unchanged-control');
  assert.equal(unchanged.length, 2);
  for (const c of unchanged) assert.equal(c.recordedTextUnchanged, true);
  const failures = manifest.cases.filter(c => c.kind === 'failure-control');
  assert.equal(failures.length, 3);
  for (const c of failures) {
    assert.equal(c.synthetic, true);
    assert.equal(c.clinicalExpectation, null);
  }
});
