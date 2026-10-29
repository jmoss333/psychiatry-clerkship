import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import setup, { observeOrigin } from './smoke/production-dialog-focus-targets.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sha = 'a'.repeat(40);
async function server(t, handler) {
  const s = http.createServer(handler);
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => s.close(resolve)));
  return `http://127.0.0.1:${s.address().port}`;
}
function payload(res, path, revision = sha) {
  res.end(path === '/' ? `<script>var FD_CORE_REVISION="${revision}";</script>` :
    JSON.stringify({ items: [{ id: 'example', source: { revision } }] }));
}
test('dialog provenance reads the actual shell and nonempty governance revisions', async t => {
  const origin = await server(t, (req, res) => payload(res, req.url));
  const result = await observeOrigin(origin, sha);
  assert.equal(result.shellRevision, sha);
  assert.deepEqual(result.governanceRevisions, [sha]);
  assert.ok(result.observedAt);
});
test('wrong shell, empty ledger, redirected or unavailable targets cannot become verified', async t => {
  for (const mode of ['wrong-shell', 'empty-ledger', 'redirect', 'unavailable']) {
    const origin = await server(t, (req, res) => {
      if (mode === 'redirect') { res.writeHead(302, { Location: '/elsewhere' }); res.end(); }
      else if (mode === 'unavailable') { res.writeHead(503); res.end(); }
      else if (mode === 'empty-ledger' && req.url !== '/') res.end('{"items":[]}');
      else payload(res, req.url, mode === 'wrong-shell' && req.url === '/' ? 'b'.repeat(40) : sha);
    });
    await assert.rejects(observeOrigin(origin, sha));
  }
});

test('a changed revision after the run preserves partial evidence and fails teardown', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dialog-targets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let revision = sha;
  const ms3 = await server(t, (req, res) => payload(res, req.url));
  const res = await server(t, (req, res) => payload(res, req.url, revision));
  const targetReport = join(directory, 'targets.json');
  const teardown = await setup({ metadata: { releaseSha: sha, origins: { ms3, res }, targetReport } });
  revision = 'b'.repeat(40);
  await assert.rejects(teardown(), /failed after/);
  const evidence = JSON.parse(await readFile(targetReport, 'utf8'));
  assert.equal(evidence.sites.ms3.before.shellRevision, sha);
  assert.equal(evidence.sites.ms3.after.shellRevision, sha);
  assert.equal(evidence.sites.res.before.shellRevision, sha);
  assert.equal(evidence.sites.res.after, undefined);
});
