/**
 * bin/preview-site.sh — the launcher's Pythons must not import from the directory it was run in.
 *
 * Found 2026-09-24: on the owner's Mac, `preview-site.test.mjs` failed "preview did not become
 * ready" on clean main while CI stayed green. That suite spawns the launcher from os.tmpdir(),
 * which held ~120,000 leaked test fixtures. `python3 -` and `python3 -m` both put the cwd on
 * sys.path, so every import the launcher's Pythons made had the import system list that whole
 * directory: `import urllib.request` from there took ~6.5 s against ~0.1 s anywhere else, and
 * the port check, the server and up to fifty readiness probes each paid it. The cost depends on
 * whether the directory is warm in the OS cache, so a timing test here would prove nothing.
 *
 * What this pins instead is the mechanism: a cwd holding a `socket.py`, an `http/` and a
 * `urllib/` that record their own import and then refuse to load. Each of the launcher's three
 * Pythons reaches exactly one of them first (the port check imports socket, `-m http.server`
 * resolves http, the probe imports urllib.request), so a cwd on any one sys.path fails here by
 * name. A cwd that is never on sys.path is never listed, however many entries it holds.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = path.join(ROOT, 'bin', 'preview-site.sh');

// Builtins only: a poison that imported pathlib would pull in urllib.parse, i.e. itself.
const POISON = [
  'open(__file__ + ".imported", "w").close()',
  'raise ImportError("launcher imported " + __name__ + " from its working directory")',
  '',
].join('\n');

function poisonedCwd(root) {
  const cwd = path.join(root, 'cwd');
  fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, 'socket.py'), POISON);
  for (const pkg of ['http', 'urllib']) {
    fs.mkdirSync(path.join(cwd, pkg));
    fs.writeFileSync(path.join(cwd, pkg, '__init__.py'), POISON);
  }
  return cwd;
}

function importedFrom(cwd) {
  return fs.readdirSync(cwd, { recursive: true }).filter((name) => name.endsWith('.imported'));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function get(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.once('end', () => resolve({ status: res.statusCode, body }));
    }).once('error', reject);
  });
}

/**
 * Settle on the launcher's own signals rather than a wall clock: it prints "Preview ready" only
 * after its probe got a 200, and it bounds its own startup (fifty probes, then exit 1).
 */
function readyOrExit(child, read) {
  return new Promise((resolve, reject) => {
    const onData = () => {
      if (!/Preview ready:/.test(read().stdout)) return;
      child.off('close', onClose);
      resolve();
    };
    const onClose = (code, signal) => {
      child.stdout.off('data', onData);
      const { stdout, stderr } = read();
      reject(new Error(`launcher exited ${code ?? signal} before ready\n`
        + `stdout: ${stdout || '[empty]'}\nstderr: ${stderr || '[empty]'}`));
    };
    child.stdout.on('data', onData);
    child.once('close', onClose);
  });
}

// The timeout is a hang backstop, not a readiness budget: the launcher exits on its own.
test('the launcher serves from a cwd whose modules shadow the stdlib', { timeout: 120_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const site = path.join(root, 'site');
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(site, 'index.html'), '<h1>isolation-marker</h1>\n');
  const cwd = poisonedCwd(root);
  const port = await freePort();

  const child = spawn('/bin/bash', [PREVIEW, 'ms3', '--no-build', '--no-open', '--port', String(port)], {
    cwd,
    env: { ...process.env, PREVIEW_SITE_DIR: site },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });

  await readyOrExit(child, () => ({ stdout, stderr }));
  const response = await get(port);
  assert.equal(response.status, 200);
  assert.match(response.body, /isolation-marker/);
  assert.deepEqual(importedFrom(cwd), [], 'a launcher Python imported from its working directory');

  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('close', resolve));
});

test('every python3 the launcher runs is isolated from its cwd (-I)', () => {
  // The behavioural test catches today's three invocations; this catches a fourth added later
  // that happens to import nothing a poison shadows. -I, not -P: -P needs 3.11 and macOS's
  // /usr/bin/python3 is 3.9. -I (3.4+) drops the cwd from sys.path on every version.
  const commands = fs.readFileSync(PREVIEW, 'utf8').split('\n')
    .map((line, index) => ({ line: line.replace(/#.*$/, ''), number: index + 1 }))
    .filter(({ line }) => /(^|[\s;&|(!])python3(\s|$)/.test(line));
  assert.ok(commands.length >= 3, `expected the port check, server and probe; found ${commands.length}`);
  for (const { line, number } of commands) {
    assert.match(line, /\bpython3 -I\s/, `bin/preview-site.sh:${number} runs python3 without -I`);
  }
});
