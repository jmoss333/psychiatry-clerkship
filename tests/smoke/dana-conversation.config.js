import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// This explicitly invoked local suite serves the unshipped generated preview.
// Production/CI learner smoke projects keep their existing site targets.
export default defineConfig({
  testDir: '.',
  testMatch: ['dana-conversation.spec.js', 'dana-recordings.spec.js', 'dana-live.spec.js', 'dana-retry.spec.js', 'dana-repair.spec.js', 'dana-bookmarks.spec.js', 'voice-cases.spec.js'],
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  outputDir: 'test-results/dana-conversation',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4317', serviceWorkers: 'block' },
  webServer: {
    command: 'python3 -m http.server 4317 --bind 127.0.0.1',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: 'http://127.0.0.1:4317/_prototypes/sp-interview/sp-interview.preview.html',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
