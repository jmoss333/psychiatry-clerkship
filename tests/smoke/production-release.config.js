import { defineConfig, devices } from '@playwright/test';

function requiredBaseUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must identify the exact production deploy permalink`);
  return value;
}

const MS3_URL = requiredBaseUrl('MS3_BASE_URL');
const RES_URL = requiredBaseUrl('RES_BASE_URL');
const REPORT_PATH = process.env.RELEASE_JOURNEY_REPORT || 'test-results/production-release-journeys.json';

export default defineConfig({
  testDir: '.',
  testMatch: 'production-release.spec.js',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 2,
  workers: 1,
  outputDir: 'test-results/production-release-artifacts',
  reporter: [['json', { outputFile: REPORT_PATH }]],
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'release-ms3', use: { baseURL: MS3_URL } },
    { name: 'release-res', use: { baseURL: RES_URL } },
  ],
});
