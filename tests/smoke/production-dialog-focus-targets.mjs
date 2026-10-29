import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export async function observeOrigin(origin, releaseSha) {
  async function read(path) {
    const response = await fetch(new URL(path, origin), {
      redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`Dialog target ${path} returned HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 8 * 1024 * 1024) throw new Error('Dialog target response exceeds size bound');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks).toString('utf8');
  }
  const html = await read('/');
  const revisions = [...html.matchAll(/\bvar FD_CORE_REVISION\s*=\s*["']([0-9a-f]{40})["']/g)].map(m => m[1]);
  const ledger = JSON.parse(await read('/tool-governance.json'));
  if (revisions.length !== 1 || revisions[0] !== releaseSha || !Array.isArray(ledger.items) || !ledger.items.length ||
      ledger.items.some(item => item?.source?.revision !== releaseSha)) {
    throw new Error('Dialog target shell/governance does not serve the requested release');
  }
  return { shellRevision: revisions[0], governanceRevisions: [releaseSha], observedAt: new Date().toISOString() };
}

export default async function setup(config) {
  const { releaseSha, origins, targetReport } = config.metadata;
  const proof = { releaseSha, sites: Object.fromEntries(Object.entries(origins).map(([site, url]) => [site, { url }])) };
  const save = () => {
    mkdirSync(dirname(targetReport), { recursive: true });
    writeFileSync(targetReport, JSON.stringify(proof, null, 2) + '\n');
  };
  async function check(phase) {
    const results = await Promise.allSettled(Object.entries(origins).map(async ([site, origin]) => {
      proof.sites[site][phase] = await observeOrigin(origin, releaseSha);
    }));
    // Save partial evidence even when setup/teardown fails. Never turn a failed probe into a pass.
    save();
    if (results.some(r => r.status === 'rejected')) {
      throw new Error(`Dialog target revision verification failed ${phase} browser checks; see target evidence.`);
    }
  }
  await check('before');
  return () => check('after');
}
