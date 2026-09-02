import { defineConfig, devices } from '@playwright/test';

import { isRemoteTarget } from './net-resilience.js';

const MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200';
const RES_URL = process.env.RES_BASE_URL || 'http://localhost:4201';
const FACULTY_URL = process.env.FACULTY_CONSOLE_BASE_URL || 'http://localhost:4202';
const SP_INTERVIEW_URL = process.env.SP_INTERVIEW_BASE_URL || new URL('/tools/', `${MS3_URL}/`).href;

// The production canary and the CI deploy-preview projects point these same specs at Netlify
// over the public internet, where a round-trip costs ~100x a loopback one. The budgets below
// are the ONLY thing that changes for those runs — everything about a localhost run stays
// exactly as it was. Detected from the base URLs the run is already given, so no workflow edit
// is needed (the scheduled-workflow validator pins that file by step inventory and sha256).
const REMOTE = [MS3_URL, RES_URL, FACULTY_URL, SP_INTERVIEW_URL].some(isRemoteTarget);

export default defineConfig({
  testDir: '.',
  // Remote runs crawl ~200 routes per project across a real CDN; 60s is a loopback budget.
  timeout: REMOTE ? 120_000 : 60_000,
  // One retry in CI covers transient startup races; none locally for fast feedback.
  // Deliberately NOT raised for remote runs: transport noise is now handled at the transport
  // layer (net-resilience.js), and a larger whole-test retry budget would start masking real
  // intermittent product bugs, which is exactly what the canary exists to surface.
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
  ],

  // Baselines live in tests/smoke/baseline/ and are generated only by the repository's
  // Ubuntu/Chromium refresh workflow. Never update them from a macOS workstation.
  snapshotDir: './baseline',
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',
  expect: {
    // 5s is right for loopback. Against a real origin a first paint can depend on a ~600KB
    // JSON fetch, and the default expired mid-fetch — the canary's "route.fetch: Test ended"
    // failures were the expectation giving up while its own network call was still in flight.
    // A longer budget delays a genuine failure; it never converts one into a pass.
    timeout: REMOTE ? 15_000 : 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.20,
      animations: 'disabled',
    },
  },

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The learner shell registers a service worker on any non-preview load. Playwright's
    // page.route CANNOT intercept requests once a SW controls the page, which silently breaks
    // every spec that simulates failures via route fulfillment (first casualty: the faculty
    // console's preview-failure spec — its clean-fallback tab registers the SW mid-test).
    // Block SWs everywhere; the dedicated 'offline' project opts back in below.
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'nav-ms3',
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'qbank-retired.spec.js', 'aria-live.spec.js', 'communication-practice.spec.js', 'ward-capture.spec.js', 'frontdoor-runtime.spec.js', 'front-door.spec.js', 'tool-expand.spec.js', 'governance-warnings.spec.js', 'mse-builder.spec.js', 'rotation-curator.spec.js', 'rotation-edition-v2.spec.js'],
      use: { ...devices['Desktop Chrome'], baseURL: MS3_URL },
    },
    {
      name: 'nav-res',
      testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'communication-practice.spec.js', 'frontdoor-runtime.spec.js', 'front-door.spec.js', 'tool-expand.spec.js', 'governance-warnings.spec.js', 'mse-builder.spec.js', 'rotation-curator.spec.js', 'rotation-edition-v2.spec.js'],
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
    {
      name: 'offline',
      testMatch: 'offline.spec.js',
      // The one project whose subject IS the service worker.
      use: { ...devices['Desktop Chrome'], baseURL: MS3_URL, serviceWorkers: 'allow' },
    },
  ],

  outputDir: 'test-results/artifacts',
});
