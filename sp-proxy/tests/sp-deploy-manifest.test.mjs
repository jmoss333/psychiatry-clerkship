import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { zipFunctions } from '@netlify/zip-it-and-ship-it';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');

test('Netlify 14.5.4 manifest schedules the private canary and the realtime reaper, and leaves public routing to TOML', {
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
  const byName = (name) => manifest.functions.find((entry) => entry.name === name);
  const canary = byName('sp-health-canary');
  const status = byName('sp-health-status');
  const reaper = byName('sp-realtime-reaper');
  const realtime = byName('sp-realtime');
  const voice = byName('sp-voice');

  assert.equal(canary?.runtimeVersion, 'nodejs20.x');
  assert.equal(canary?.schedule, '0 */6 * * *');
  assert.deepEqual(canary?.routes ?? [], []);
  assert.equal(status?.runtimeVersion, 'nodejs20.x');
  assert.equal(status?.schedule, undefined);
  assert.deepEqual(status?.routes ?? [], []);

  // The reaper is the only other scheduled function: every five minutes, so a
  // call past its deadline is hung up within one cycle.
  assert.equal(reaper?.runtimeVersion, 'nodejs20.x');
  assert.equal(reaper?.schedule, '*/5 * * * *');
  assert.deepEqual(reaper?.routes ?? [], []);
  // The route itself is reached through the TOML rewrite, exactly like sp-voice.
  assert.equal(realtime?.runtimeVersion, 'nodejs20.x');
  assert.equal(realtime?.schedule, undefined);
  assert.deepEqual(realtime?.routes ?? [], []);
  assert.equal(voice?.schedule, undefined);
  assert.deepEqual(voice?.routes ?? [], []);
  assert.deepEqual(
    manifest.functions.filter((entry) => entry.schedule !== undefined).map((entry) => entry.name).sort(),
    ['sp-health-canary', 'sp-realtime-reaper'],
  );
});
