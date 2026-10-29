import { defineConfig } from '@playwright/test';
import shared from './playwright.config.js';

const releaseSha = process.env.RELEASE_SHA;
if (!/^[0-9a-f]{40}$/.test(releaseSha || '')) throw new Error('RELEASE_SHA must be an exact commit revision');
const origins = {};
for (const [site, slug] of [['ms3', 'une-ms3-psychiatry'], ['res', 'mmc-psychiatry-residents-sanford']]) {
  const value = process.env[`${site.toUpperCase()}_BASE_URL`];
  if (!new RegExp(`^https://[0-9a-f]{24}--${slug}\\.netlify\\.app$`).test(value || '')) {
    throw new Error(`${site} must identify an exact production deploy permalink`);
  }
  origins[site] = value;
}
const targetReport = process.env.RELEASE_DIALOG_TARGETS;
const report = process.env.RELEASE_DIALOG_REPORT;
if (!targetReport || !report) throw new Error('Dialog result and target report paths are required');

export default defineConfig({
  ...shared,
  projects: shared.projects.filter(p => ['nav-ms3', 'nav-res', 'interview-room'].includes(p.name)).map(p => ({
    ...p,
    testMatch: p.name === 'interview-room' ? ['interview-room.spec.js'] : ['dialog-loading-focus.spec.js', 'rotation-edition-v2.spec.js'],
  })),
  grep: /delayed dialog focus:/,
  globalTimeout: 15 * 60 * 1000,
  retries: 0,
  workers: 1,
  forbidOnly: true,
  metadata: { releaseSha, origins, targetReport },
  globalSetup: './production-dialog-focus-targets.mjs',
  reporter: [['json', { outputFile: report }]],
  outputDir: 'test-results/production-dialog-artifacts',
});
