import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { zipFunctions } from '@netlify/zip-it-and-ship-it';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');

test('Netlify 14.5.4 manifest schedules only the private canary and leaves status routing to TOML', {
  timeout: 30_000,
}, async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'sp-health-manifest-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const manifestPath = path.join(temp, 'manifest.json');

  await zipFunctions(FUNCTIONS_DIR, path.join(temp, 'functions'), {
    archiveFormat: 'none',
    manifest: manifestPath,
    repositoryRoot: path.resolve(ROOT, '..'),
    config: {
      '*': {
        nodeBundler: 'esbuild',
        nodeVersion: '20',
      },
    },
  });

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const canary = manifest.functions.find(({ name }) => name === 'sp-health-canary');
  const status = manifest.functions.find(({ name }) => name === 'sp-health-status');

  assert.equal(canary?.runtimeVersion, 'nodejs20.x');
  assert.equal(canary?.schedule, '0 */6 * * *');
  assert.deepEqual(canary?.routes ?? [], []);
  assert.equal(status?.runtimeVersion, 'nodejs20.x');
  assert.equal(status?.schedule, undefined);
  assert.deepEqual(status?.routes ?? [], []);
});
