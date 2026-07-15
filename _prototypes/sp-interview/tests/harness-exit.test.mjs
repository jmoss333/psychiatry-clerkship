import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const run = spawnSync(process.execPath, ['smoke.test.js'], {
  cwd: dir,
  env: { ...process.env, SP_SMOKE_FORCE_FAIL: '1' },
  encoding: 'utf8',
});

assert.equal(run.status, 1);
assert.match(run.stdout + run.stderr, /FAIL — forced harness check/);
