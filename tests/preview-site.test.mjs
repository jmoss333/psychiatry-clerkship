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
// Readiness waits return the moment their condition holds and fail as soon as the
// launcher closes, so this bound only runs out on a launcher that is alive but stuck;
// passing and crashing runs never pay for it. It is generous because the launcher
// prints "Preview ready" only after its own probe (a fresh python3 per attempt) gets
// a 200, which on a loaded machine can trail this test's request by seconds: a fixed
// 2 s output wait blocked pre-push runs on 2026-09-24. Deadlines that prove a server
// stops, refuses or reports promptly stay tight and never use this.
const READINESS_TIMEOUT_MS = 60_000;

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(port, timeoutMs = 2_000, child) {
  return new Promise((resolve, reject) => {
    let timeout;
    let settled = false;
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child?.off('exit', onChildExit);
      complete(value);
    };
    const onChildExit = () => {
      const error = new Error('preview process exited during request');
      error.code = 'ECHILDEXIT';
      req.destroy(error);
    };
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.once('end', () => finish(resolve, { status: res.statusCode, body }));
      res.once('error', (error) => finish(reject, error));
    });
    req.once('error', (error) => finish(reject, error));
    timeout = setTimeout(() => {
      const error = new Error('preview request timed out');
      error.code = 'ETIMEDOUT';
      req.destroy(error);
    }, Math.max(1, timeoutMs));
    child?.once('exit', onChildExit);
    if (child && (child.exitCode !== null || child.signalCode !== null)) onChildExit();
  });
}

function previewStartupError(message, readOutput) {
  if (!readOutput) return new Error(message);
  const { stdout = '', stderr = '' } = readOutput();
  return new Error(`${message}\nstdout (last 2000 characters): ${stdout.slice(-2_000) || '[empty]'}\nstderr (last 2000 characters): ${stderr.slice(-2_000) || '[empty]'}`);
}

function waitBrieflyForChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve();
    };
    const timer = setTimeout(onExit, timeoutMs);
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) onExit();
  });
}

async function waitForServer(port, child, readOutput, maxWaitMs = READINESS_TIMEOUT_MS) {
  // The launcher makes up to 50 readiness attempts, each with a 200 ms request
  // timeout and a 100 ms pause. Allow that cycle plus process startup overhead.
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw previewStartupError(`preview exited early with ${child.exitCode ?? child.signalCode}`, readOutput);
    }
    try { return await request(port, deadline - Date.now(), child); } catch (error) {
      // The socket can close just before Node reports the child exit.
      if (error.code === 'ECONNRESET' && child.exitCode === null && child.signalCode === null) {
        await waitBrieflyForChildExit(child, Math.min(200, Math.max(1, deadline - Date.now())));
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw previewStartupError(`preview exited early with ${child.exitCode ?? child.signalCode}`, readOutput);
      }
      if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw previewStartupError(`preview did not become ready on ${port}`, readOutput);
}

async function waitUntil(condition, failure, { child, readOutput, timeoutMs = READINESS_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  // 'exit' can precede the last stdout chunk; only 'close' means all output is in.
  let closed = false;
  const onClose = () => { closed = true; };
  child?.once('close', onClose);
  try {
    while (Date.now() < deadline) {
      if (condition()) return;
      if (closed) throw previewStartupError(`${failure} — preview exited with ${child.exitCode ?? child.signalCode}`, readOutput);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    child?.off('close', onClose);
  }
  throw previewStartupError(failure, readOutput);
}

function waitForFile(file, options) {
  return waitUntil(() => fs.existsSync(file), `expected file was not created: ${file}`, options);
}

function waitForOutput(read, pattern, options) {
  return waitUntil(() => pattern.test(read()), `expected launcher output was not observed: ${pattern}`, options);
}

test('preview launcher serves the selected built site and stops its owned server', async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-site-'));
  const site = path.join(temporary, 'site');
  const commands = path.join(temporary, 'commands');
  const openLog = path.join(temporary, 'open.log');
  fs.mkdirSync(site);
  fs.mkdirSync(commands);
  fs.writeFileSync(path.join(site, 'index.html'), '<h1>preview-marker</h1>\n');
  // The redirect creates the log before printf fills it, so write then rename:
  // once waitForFile sees the log it is complete, never momentarily empty.
  fs.writeFileSync(path.join(commands, 'open'), [
    '#!/bin/sh',
    'printf "%s\\n" "$1" > "$PREVIEW_OPEN_LOG.tmp"',
    'mv "$PREVIEW_OPEN_LOG.tmp" "$PREVIEW_OPEN_LOG"',
    '',
  ].join('\n'));
  fs.chmodSync(path.join(commands, 'open'), 0o755);
  const reservation = await reservePort();
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const child = spawn('/bin/bash', [PREVIEW, 'ms3', '--no-build', '--port', String(port)], {
    // A small private cwd, never os.tmpdir(): each python3 the launcher starts puts
    // its cwd first on sys.path, and listing a $TMPDIR that test runs had filled with
    // ~120k entries made every one of those imports take seconds (2026-09-24).
    cwd: temporary,
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

  const readOutput = () => ({ stdout, stderr });
  const response = await waitForServer(port, child, readOutput);
  assert.equal(response.status, 200);
  assert.match(response.body, /preview-marker/);
  await waitForOutput(() => stdout, new RegExp(`Preview ready: http://127\\.0\\.0\\.1:${port}/`), { child, readOutput });
  assert.match(stdout, new RegExp(`Preview ready: http://127\\.0\\.0\\.1:${port}/`));
  assert.equal(stderr, '');
  await waitForFile(openLog, { child, readOutput });
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
    cwd: site, encoding: 'utf8',
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

test('preview readiness accepts a healthy server starting after five seconds', async (t) => {
  const reservation = await reservePort();
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http');
    setTimeout(() => {
      http.createServer((_request, response) => response.end('delayed-preview'))
        .listen(${port}, '127.0.0.1');
    }, 5_250);
  `], { stdio: 'ignore' });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });

  const response = await waitForServer(port, child);
  assert.equal(response.status, 200);
  assert.equal(response.body, 'delayed-preview');
});

test('preview output wait accepts a launcher that prints late and exits at once', async (t) => {
  // Past the old fixed 2 s output wait, and exiting right after printing so the
  // line must still count when 'close' follows it immediately.
  const child = spawn(process.execPath, ['-e', `
    setTimeout(() => process.stdout.write('Preview ready: late\\n', () => process.exit(0)), 3_000);
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });

  await waitForOutput(() => stdout, /Preview ready: late/, { child, readOutput: () => ({ stdout, stderr: '' }) });
});

test('preview output wait fails on child close instead of running out its deadline', async () => {
  const child = spawn(process.execPath, ['-e', `
    process.stderr.write('launcher gave up');
    process.exit(3);
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const error = await waitForOutput(() => stdout, /Preview ready/, {
    child, readOutput: () => ({ stdout, stderr }),
  }).then(
    () => assert.fail('a child that never printed should not satisfy the wait'),
    (failure) => failure,
  );
  assert.match(error.message, /not observed: \/Preview ready\/ — preview exited with 3[\s\S]*launcher gave up/);
});

test('preview startup errors include bounded child output', async () => {
  const reservation = await reservePort();
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['-e', `
    process.stdout.write('startup diagnostics');
    process.stderr.write('HEAD-' + 'x'.repeat(3_000) + '-TAIL');
    process.exit(7);
  `], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  await new Promise((resolve) => child.once('close', resolve));

  const error = await waitForServer(port, child, () => ({ stdout, stderr })).then(
    () => assert.fail('exited child should not become ready'),
    (failure) => failure,
  );
  assert.match(error.message, /preview exited early with 7[\s\S]*startup diagnostics/);
  assert.match(error.message, /-TAIL/);
  assert.doesNotMatch(error.message, /HEAD-/);
});

test('preview readiness deadline interrupts a server that accepts without responding', async (t) => {
  const reservation = await reservePort();
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http');
    http.createServer(() => {}).listen(${port}, '127.0.0.1', () => console.log('LISTENING'));
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await waitForOutput(() => stdout, /LISTENING/);

  const wait = waitForServer(port, child, () => ({ stdout, stderr: '' }), 150).then(
    () => 'ready',
    (error) => error,
  );
  let watchdog;
  const stalled = new Promise((resolve) => { watchdog = setTimeout(() => resolve('stalled'), 800); });
  const result = await Promise.race([wait, stalled]);
  clearTimeout(watchdog);
  assert.ok(result instanceof Error, `readiness wait ${result} after its deadline`);
  assert.match(result.message, /preview did not become ready/);
});

test('preview readiness reports child exit while a response is pending', async (t) => {
  const reservation = await reservePort();
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http');
    http.createServer(() => {
      console.error('accepted then exited');
      setTimeout(() => process.exit(9), 75);
    }).listen(${port}, '127.0.0.1', () => console.log('LISTENING'));
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await waitForOutput(() => stdout, /LISTENING/);

  const started = Date.now();
  const error = await waitForServer(port, child, () => ({ stdout, stderr }), 2_000).then(
    () => assert.fail('exited child should not become ready'),
    (failure) => failure,
  );
  assert.match(error.message, /preview exited early with 9[\s\S]*accepted then exited/);
  assert.ok(Date.now() - started < 1_000, 'child exit should interrupt the pending request promptly');
});
