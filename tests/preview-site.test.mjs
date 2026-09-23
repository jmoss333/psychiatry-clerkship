import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = path.join(ROOT, 'bin', 'preview-site.sh');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.once('error', reject);
  });
}

async function waitForServer(port, child) {
  // The launcher has its own five-second startup deadline. Give the test
  // enough time to observe that result even when the full suite is busy.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`preview exited early with ${child.exitCode}`);
    try { return await request(port); } catch (error) {
      if (error.code !== 'ECONNREFUSED') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`preview did not become ready on ${port}`);
}

async function waitForFile(file) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`expected file was not created: ${file}`);
}

async function waitForOutput(read, pattern) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (pattern.test(read())) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`expected launcher output was not observed: ${pattern}`);
}

test('preview launcher serves the selected built site and stops its owned server', async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-site-'));
  const site = path.join(temporary, 'site');
  const commands = path.join(temporary, 'commands');
  const openLog = path.join(temporary, 'open.log');
  fs.mkdirSync(site);
  fs.mkdirSync(commands);
  fs.writeFileSync(path.join(site, 'index.html'), '<h1>preview-marker</h1>\n');
  fs.writeFileSync(path.join(commands, 'open'), '#!/bin/sh\nprintf "%s\\n" "$1" > "$PREVIEW_OPEN_LOG"\n');
  fs.chmodSync(path.join(commands, 'open'), 0o755);
  const reservation = await reservePort();
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const child = spawn('/bin/bash', [PREVIEW, 'ms3', '--no-build', '--port', String(port)], {
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      PATH: `${commands}:${process.env.PATH}`,
      PREVIEW_OPEN_LOG: openLog,
      PREVIEW_SITE_DIR: site,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  const response = await waitForServer(port, child);
  assert.equal(response.status, 200);
  assert.match(response.body, /preview-marker/);
  await waitForOutput(() => stdout, new RegExp(`Preview ready: http://127\\.0\\.0\\.1:${port}/`));
  assert.match(stdout, new RegExp(`Preview ready: http://127\\.0\\.0\\.1:${port}/`));
  assert.equal(stderr, '');
  await waitForFile(openLog);
  assert.equal(fs.readFileSync(openLog, 'utf8'), `http://127.0.0.1:${port}/\n`);

  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('close', resolve));
  await assert.rejects(request(port), /ECONNREFUSED/);
});

test('preview launcher rejects an occupied port instead of trusting another server', async (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-site-occupied-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.writeFileSync(path.join(site, 'index.html'), '<h1>occupied-port fixture</h1>\n');
  const reservation = await reservePort();
  t.after(() => reservation.close());
  const port = reservation.address().port;
  const result = spawnSync('/bin/bash', [PREVIEW, 'res', '--no-build', '--no-open', '--port', String(port)], {
    cwd: os.tmpdir(), encoding: 'utf8',
    env: { ...process.env, PREVIEW_SITE_DIR: site },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`port ${port} is already in use`));
});

test('preview launcher rejects unknown audiences before building', () => {
  const result = spawnSync('/bin/bash', [PREVIEW, 'faculty'], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /audience must be ms3 or res/);
});
