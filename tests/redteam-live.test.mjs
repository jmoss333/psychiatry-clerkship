import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'redteam-live.sh');

// A stand-in for the deployed endpoint. `reply` decides what every request gets,
// which is enough to drive the script's D0 branch either way.
async function withEndpoint(reply, run) {
  const server = createServer((req, res) => reply(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/sp`;
  try { return await run(url); } finally { await new Promise(r => server.close(r)); }
}

function runScript(endpoint, passcode) {
  return new Promise(resolve => {
    execFile('bash', [script, endpoint, passcode], {timeout: 60000, env: {...process.env, SP_STUDENT_PASSCODE: passcode}},
      (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr}));
  });
}

test('when the credential does not work, the probes that depend on it are skipped rather than passed', async () => {
  // Exactly what a secret-variable placeholder produces: every authenticated
  // request is refused, so D0 fails and nothing below it has been exercised.
  const out = await withEndpoint((req, res) => { res.writeHead(401); res.end('{}'); },
    url => runScript(url, 'a-placeholder-not-the-passcode'));

  assert.match(out.stdout, /FAIL\s+D0/, 'D0 must fail on a 401');
  // D5 checks only for an absent CORS header, which a 401 also lacks; reporting
  // that as a pass is a false green, and B5 never reached its own assertion.
  assert.doesNotMatch(out.stdout, /pass\s+D5/, 'D5 must not pass when the credential failed');
  assert.doesNotMatch(out.stdout, /pass\s+B5/, 'B5 must not pass when the credential failed');
  assert.match(out.stdout, /SKIP\s+D5/, 'D5 is skipped, and says so');
  assert.match(out.stdout, /SKIP\s+B5/, 'B5 is skipped, and says so');
  assert.notEqual(out.code, 0, 'a run that proved nothing must not exit 0');
});

test('a failed credential names the secret-readback trap, not a propagation delay', async () => {
  const out = await withEndpoint((req, res) => { res.writeHead(401); res.end('{}'); },
    url => runScript(url, 'a-placeholder-not-the-passcode'));
  assert.match(out.stdout + out.stderr, /secret/i, 'the diagnosis must mention the secret variable');
  assert.match(out.stdout + out.stderr, /placeholder/i, 'and name the placeholder explicitly');
});

test('with a working credential the dependent probes still run', async () => {
  const out = await withEndpoint((req, res) => {
    if (req.method === 'POST') { res.writeHead(400); res.end('{}'); return; }
    if ((req.headers['x-student-key'] || '') === 'the-real-passcode') { res.writeHead(200); res.end('{"packVersion":"x"}'); return; }
    res.writeHead(401); res.end('{}');
  }, url => runScript(url, 'the-real-passcode'));

  assert.match(out.stdout, /pass\s+D0/, 'D0 passes with a working credential');
  assert.match(out.stdout, /pass\s+D5/, 'and the dependent probes actually run');
  assert.match(out.stdout, /pass\s+B5/);
  assert.doesNotMatch(out.stdout, /SKIP/, 'nothing is skipped when the credential works');
});

import {mkdtempSync, writeFileSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';

// A stand-in `netlify` CLI that returns what a secret variable actually reads back:
// a plausible 20-character placeholder, not the credential.
function fakeNetlify(value) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fake-netlify-'));
  const bin = path.join(dir, 'netlify');
  writeFileSync(bin, `#!/bin/sh\n[ "$1" = "env:get" ] && echo '${value}'\nexit 0\n`);
  chmodSync(bin, 0o755);
  return dir;
}

test('a Netlify readback that cannot authenticate is discarded, not used', async () => {
  const dir = fakeNetlify('PLACEHOLDER1234ABCD');
  const out = await withEndpoint((req, res) => {
    if ((req.headers['x-student-key'] || '') === 'the-real-passcode') { res.writeHead(200); res.end('{}'); return; }
    res.writeHead(401); res.end('{}');
  }, url => new Promise(resolve => {
    execFile('bash', [script, url], {timeout: 60000,
      // No SP_STUDENT_PASSCODE, and stdin is not a TTY, so the prompt cannot run.
      env: {...process.env, SP_STUDENT_PASSCODE: '', PATH: `${dir}:${process.env.PATH}`}},
      (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr}));
  }));

  const all = out.stdout + out.stderr;
  assert.match(all, /does not authenticate|placeholder/i, 'the unusable readback is named as such');
  assert.doesNotMatch(out.stdout, /pass\s+D[015]/, 'no probe reports a pass on a credential that never worked');
  assert.doesNotMatch(out.stdout, /pass\s+B5/);
  assert.notEqual(out.code, 0);
});
