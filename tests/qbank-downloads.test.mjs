import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('learner question downloads enforce approval through real exports and parity', { timeout: 120_000 }, () => {
  const script = fileURLToPath(new URL('../13_Faculty_Resources/_automation/site_build/test_qbank_downloads.py', import.meta.url));
  const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 110_000 });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
