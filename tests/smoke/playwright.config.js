import { defineConfig, devices } from '@playwright/test';

const MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200';
const RES_URL = process.env.RES_BASE_URL || 'http://localhost:4201';
const FACULTY_URL = process.env.FACULTY_CONSOLE_BASE_URL || 'http://localhost:4202';
const SP_INTERVIEW_URL = process.env.SP_INTERVIEW_BASE_URL || 'http://localhost:4300';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  // One retry in CI covers transient startup races; none locally for fast feedback
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
  ],

  // Baselines live in tests/smoke/baseline/  → committed to the repo.
  // On first run (no baselines), run: npm run update-baselines
  // Threshold is intentionally loose (20 %) to tolerate cross-platform
  // font-rendering differences between macOS (local) and Ubuntu (CI).
  snapshotDir: './baseline',
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.20,
      animations: 'disabled',
    },
  },

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'nav-ms3',
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js'],
      use: { ...devices['Desktop Chrome'], baseURL: MS3_URL },
    },
    {
      name: 'nav-res',
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js'],
      use: { ...devices['Desktop Chrome'], baseURL: RES_URL },
    },
    {
      name: 'lfs',
      testMatch: 'lfs-integrity.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: 'visual-regression.spec.js',
      use: { ...devices['Desktop Chrome'], baseURL: RES_URL },
    },
    {
      name: 'interview-room',
      testMatch: 'interview-room.spec.js',
      use: { ...devices['Desktop Chrome'], baseURL: SP_INTERVIEW_URL },
    },
    {
      name: 'faculty-console',
      testMatch: 'faculty-console.spec.js',
      use: { ...devices['Desktop Chrome'], baseURL: FACULTY_URL },
    },
  ],

  outputDir: 'test-results/artifacts',
});
