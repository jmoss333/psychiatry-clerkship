import { defineConfig, devices } from '@playwright/test';

const MS3_URL = process.env.MS3_BASE_URL || 'https://une-ms3-psychiatry.netlify.app';
const RES_URL = process.env.RES_BASE_URL || 'https://mmc-psychiatry-residents-sanford.netlify.app';
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
