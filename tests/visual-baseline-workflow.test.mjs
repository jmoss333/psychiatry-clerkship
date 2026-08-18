import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflowPath = fileURLToPath(
  new URL('../.github/workflows/refresh-baselines.yml', import.meta.url),
);
const packagePath = fileURLToPath(new URL('./smoke/package.json', import.meta.url));

test('Ubuntu baseline refresh rewrites every semantic screenshot regardless of diff tolerance', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(
    workflow,
    /npx playwright test visual-regression\.spec\.js --project=visual --update-snapshots=all(?:\s|$)/,
    'refresh workflow must target the four semantic visuals and force every snapshot rewrite',
  );
});

test('the baseline helper uses the same forced four-screenshot contract', () => {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(
    packageJson.scripts['update-baselines'],
    'playwright test visual-regression.spec.js --project=visual --update-snapshots=all',
  );
});
