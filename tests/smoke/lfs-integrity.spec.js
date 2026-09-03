/**
 * Check 2 — Media / LFS integrity.
 *
 * Git-LFS audio files (.m4a) are served as ~133-byte pointer stubs when GitHub
 * LFS quota is exhausted or the Netlify build doesn't fetch LFS objects.
 * This check runs against the ACTUAL DEPLOYED URL (Netlify), not a local build,
 * because only the deploy environment resolves LFS correctly.
 *
 * Deploy URL detection (in order of preference):
 *   1. MS3_DEPLOY_URL / RES_DEPLOY_URL env vars (explicit override)
 *   2. Constructed from NETLIFY_PR env var:
 *        https://deploy-preview-{N}--une-ms3-psychiatry.netlify.app
 *   3. Skipped with a clear notice if none available
 *
 * HARD FAIL: any audio file returns a Git-LFS pointer stub.
 * Graceful skip: deploy URL not set or deploy not yet live.
 *
 * Files sampled: first 5 .m4a files from /audio/ (ordered by filename).
 */

import { test } from '@playwright/test';
import { requestGetWithRetry, requestHeadWithRetry } from './net-resilience.js';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

// ~133 bytes: LFS pointer stubs are never real audio
const LFS_STUB_MAX_BYTES = 512;
const LFS_HEADER = 'version https://git-lfs';
const AUDIO_SAMPLE_COUNT = 5;

function resolveDeployUrl(site) {
  const direct = process.env[`${site.toUpperCase()}_DEPLOY_URL`];
  if (direct) return direct;
  const prNum = process.env.NETLIFY_PR;
  if (!prNum) return null;
  const slug = site === 'ms3'
    ? 'une-ms3-psychiatry'
    : 'mmc-psychiatry-residents-sanford';
  return `https://deploy-preview-${prNum}--${slug}.netlify.app`;
}

function sampleAudioFiles(site) {
  const audioDir = join(REPO_ROOT, `_build/${site}/audio`);
  if (!existsSync(audioDir)) return [];
  return readdirSync(audioDir)
    .filter(f => f.endsWith('.m4a') || f.endsWith('.mp4') || f.endsWith('.mp3'))
    .sort()
    .slice(0, AUDIO_SAMPLE_COUNT)
    .map(f => `audio/${f}`);
}

for (const site of ['ms3', 'res']) {
  test(`${site}: audio files are real bytes — not LFS pointer stubs`, async ({ request }) => {
    const deployUrl = resolveDeployUrl(site);

    if (!deployUrl) {
      // Graceful skip — no deploy URL available yet
      console.log(
        `  ⚠ Check 2 (${site}) skipped — no deploy URL.\n` +
        `    Set ${site.toUpperCase()}_DEPLOY_URL or NETLIFY_PR env var to enable.`,
      );
      test.skip();
    }

    // Probe the deploy (it may not be live yet)
    const probe = await requestHeadWithRetry(request, deployUrl, {
      timeout: 15_000,
      failOnStatusCode: false,
    });
    if (!probe.ok()) {
      console.log(
        `  ⚠ Check 2 (${site}) skipped — deploy at ${deployUrl} ` +
        `returned ${probe.status()} (not ready yet).`,
      );
      test.skip();
    }

    const audioFiles = sampleAudioFiles(site);
    if (audioFiles.length === 0) {
      console.log(`  ⚠ No audio files found in _build/${site}/audio — skipping LFS check`);
      return;
    }

    const failures = [];
    const rows = [];

    for (const relPath of audioFiles) {
      const url = `${deployUrl}/${relPath}`;
      const resp = await requestGetWithRetry(request, url, {
        timeout: 20_000,
        failOnStatusCode: false,
      });

      const status = resp.status();
      if (status !== 200) {
        failures.push(`${relPath}: HTTP ${status} from ${url}`);
        rows.push(`✗  ${status}  ${relPath}  (HTTP error)`);
        continue;
      }

      const body = await resp.body();
      const contentType = resp.headers()['content-type'] || '';
      const isStub = body.toString('latin1', 0, 23).startsWith(LFS_HEADER);
      const isSmall = body.length < LFS_STUB_MAX_BYTES;
      const isAudioType = /^audio\/|^video\//.test(contentType) || contentType === 'application/octet-stream';

      if (isStub || isSmall) {
        failures.push(
          `${relPath}: LFS pointer stub served ` +
          `(${body.length} bytes, content-type: ${contentType}) — ` +
          `GitHub LFS quota may be exhausted on ${site}`,
        );
        rows.push(`✗  ${status}  ${relPath}  LFS-STUB ${body.length}B`);
      } else {
        rows.push(`✓  ${status}  ${relPath}  ${body.length}B  ${contentType}`);
      }
    }

    console.log(`\n── LFS check: ${deployUrl}\n${'─'.repeat(72)}`);
    console.log(rows.join('\n'));
    console.log(`${'─'.repeat(72)}`);

    if (failures.length > 0) {
      throw new Error(
        `HARD FAIL — ${failures.length} audio file(s) are LFS pointer stubs on ${site}:\n` +
        failures.map(f => `  ✗ ${f}`).join('\n') +
        '\n\n  Fix: re-deploy Netlify without cache (forces fresh LFS fetch).',
      );
    }

    console.log(`✓ ${audioFiles.length} audio files verified real on ${site}\n`);
  });
}
