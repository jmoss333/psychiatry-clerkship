import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const VOICE_TEST = fileURLToPath(new URL('./sp-voice.test.mjs', import.meta.url));
const PROVIDER_TEST = fileURLToPath(new URL('./sp-speech-provider.test.mjs', import.meta.url));
const LOW_MEMORY_PATTERN = 'one-byte.*(64 MiB heap|full adapter)';

test('voice stream regressions pass in a real 64 MiB child heap', () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    '--max-old-space-size=64',
    '--test',
    `--test-name-pattern=${LOW_MEMORY_PATTERN}`,
    VOICE_TEST,
    PROVIDER_TEST,
  ], {
    encoding: 'utf8',
    env: childEnvironment,
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    `64 MiB voice regression failed\n${result.stdout}\n${result.stderr}`,
  );
  assert.match(result.stdout, /pass 3|# pass 3/);
  assert.doesNotMatch(result.stdout + result.stderr, /heap out of memory/i);
});
