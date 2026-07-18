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
const LAUNCHER = path.join(ROOT, 'tests/smoke/start-local-servers.sh');
const SMOKE_ENV_KEYS = [
  'SMOKE_MS3_PORT',
  'SMOKE_RES_PORT',
  'SMOKE_FACULTY_PORT',
  'SMOKE_MS3_DIR',
  'SMOKE_RES_DIR',
  'SMOKE_FACULTY_DIR',
  'SMOKE_READY_ATTEMPTS',
  'SMOKE_READY_DELAY_SECONDS',
  'SMOKE_READY_PATH',
  'SMOKE_SERVER_STATE_DIR',
];

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of SMOKE_ENV_KEYS) delete env[key];
  return env;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function terminateProcessGroup(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 0) return;
  try {
    process.kill(-pgid, 'SIGTERM');
  } catch (error) {
    if (error.code === 'ESRCH') return;
    throw error;
  }
  await sleep(150);
  try {
    process.kill(-pgid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function createTestContext(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-server-launcher-'));
  const sites = {
    ms3: path.join(temporary, 'ms3'),
    res: path.join(temporary, 'res'),
    faculty: path.join(temporary, 'faculty'),
  };
  for (const [label, directory] of Object.entries(sites)) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), `${label}-marker\n`);
  }
  const stateDir = path.join(temporary, 'state');
  fs.mkdirSync(stateDir);
  const processGroups = new Set();

  t.after(async () => {
    for (const pgid of processGroups) await terminateProcessGroup(pgid);
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  return { temporary, sites, stateDir, processGroups };
}

function runLauncher(context, {
  args = [],
  env = cleanEnvironment(),
  cwd = os.tmpdir(),
  timeoutMs = 15_000,
  onSpawn = () => {},
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [LAUNCHER, ...args], {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    context.processGroups.add(child.pid);
    onSpawn(child);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') reject(error);
      }
    }, timeoutMs);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, pgid: child.pid });
    });
  });
}

async function reserveLoopbackPorts(count) {
  const reservations = [];
  for (let index = 0; index < count; index += 1) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    reservations.push({ server, port: server.address().port });
  }
  return reservations;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function releaseReservations(reservations) {
  await Promise.all(reservations.map(({ server }) => closeServer(server)));
}

function makeLauncherEnvironment(context, ports, overrides = {}) {
  return {
    ...cleanEnvironment(),
    SMOKE_MS3_PORT: String(ports[0]),
    SMOKE_RES_PORT: String(ports[1]),
    SMOKE_FACULTY_PORT: String(ports[2]),
    SMOKE_MS3_DIR: context.sites.ms3,
    SMOKE_RES_DIR: context.sites.res,
    SMOKE_FACULTY_DIR: context.sites.faculty,
    SMOKE_READY_ATTEMPTS: '15',
    SMOKE_READY_DELAY_SECONDS: '0.05',
    SMOKE_READY_PATH: '/',
    SMOKE_SERVER_STATE_DIR: context.stateDir,
    ...overrides,
  };
}

function parseRecords(text, prefix) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`${prefix}\t`))
    .map((line) => line.split('\t').slice(1));
}

function readPidFile(file) {
  return fs.readFileSync(file, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [label, pid, port] = line.split('\t');
      return { label, pid: Number(pid), port: Number(port) };
    });
}

function requestText(port, pathname = '/') {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 2_000 }, (response) => {
      response.setEncoding('utf8');
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${body}`));
        } else {
          resolve(body);
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('request timed out')));
    request.once('error', reject);
  });
}

function canBind(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

async function waitForPortsClosed(ports, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const available = await Promise.all(ports.map((port) => canBind(port)));
    if (available.every(Boolean)) return;
    await sleep(50);
  }
  assert.fail(`ports remained occupied after launcher failure: ${ports.join(', ')}`);
}

async function waitForPidRecords(file, count, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const records = readPidFile(file);
      if (records.length >= count) return records;
    }
    await sleep(25);
  }
  assert.fail(`launcher did not record ${count} startup PIDs: ${file}`);
}

function realPythonExecutable() {
  const result = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function installFailingPythonWrapper(context, deadPort) {
  const bin = path.join(context.temporary, 'bin');
  fs.mkdirSync(bin);
  const wrapper = path.join(bin, 'python3');
  fs.writeFileSync(wrapper, `#!/usr/bin/env bash
if [ "\${1:-}" = "-m" ] && [ "\${2:-}" = "http.server" ] && [ "\${3:-}" = "${deadPort}" ]; then
  echo "intentional test child death" >&2
  exit 23
fi
exec ${shellQuote(realPythonExecutable())} "$@"
`);
  fs.chmodSync(wrapper, 0o755);
  return bin;
}

async function assertFailureCleanedUp(stateDir, ports) {
  const startupJournal = path.join(stateDir, '.startup-pids.tsv');
  if (fs.existsSync(startupJournal)) {
    for (const { pid } of readPidFile(startupJournal)) {
      assert.equal(isPidAlive(pid), false, `launcher leaked PID ${pid}`);
    }
  }
  assert.equal(fs.existsSync(path.join(stateDir, 'server-pids.tsv')), false);
  await waitForPortsClosed(ports);
}

test('--print-config reports the default CI mappings without starting servers', async (t) => {
  const context = createTestContext(t);
  const result = await runLauncher(context, { args: ['--print-config'] });
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.deepEqual(parseRecords(result.stdout, 'CONFIG'), [
    ['ms3', '4200', path.join(ROOT, '_build/ms3')],
    ['res', '4201', path.join(ROOT, '_build/res')],
    ['faculty', '4202', path.join(ROOT, 'faculty-console')],
  ]);
  assert.equal(parseRecords(result.stdout, 'SERVER_PID').length, 0);
  assert.doesNotMatch(result.stdout, /Servers ready/);
});

test('launcher serves all three configured marker sites and leaves their PIDs alive', async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const result = await runLauncher(context, { env: makeLauncherEnvironment(context, ports) });
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Servers ready/);
  const manifest = readPidFile(path.join(context.stateDir, 'server-pids.tsv'));
  assert.deepEqual(manifest.map(({ label, port }) => [label, port]), [
    ['ms3', ports[0]],
    ['res', ports[1]],
    ['faculty', ports[2]],
  ]);
  assert.deepEqual(parseRecords(result.stdout, 'STATE_DIR'), [[context.stateDir]]);
  assert.deepEqual(
    parseRecords(result.stdout, 'SERVER_PID'),
    manifest.map(({ label, pid }) => [label, String(pid)]),
  );
  assert.equal(new Set(manifest.map(({ pid }) => pid)).size, 3);
  for (const { pid } of manifest) assert.equal(isPidAlive(pid), true);
  assert.equal(await requestText(ports[0]), 'ms3-marker\n');
  assert.equal(await requestText(ports[1]), 'res-marker\n');
  assert.equal(await requestText(ports[2]), 'faculty-marker\n');
});

test('launcher rejects a missing directory before starting any server', async (t) => {
  const context = createTestContext(t);
  fs.rmSync(context.sites.ms3, { recursive: true });
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const result = await runLauncher(context, { env: makeLauncherEnvironment(context, ports) });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /ERROR: directory for ms3 does not exist:/);
  assert.equal(fs.existsSync(path.join(context.stateDir, '.startup-pids.tsv')), false);
  await waitForPortsClosed(ports);
});

test('launcher rejects invalid and duplicate port configuration before startup', async (t) => {
  const context = createTestContext(t);
  const cases = [
    { name: 'zero', override: { SMOKE_MS3_PORT: '0' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'too large', override: { SMOKE_MS3_PORT: '65536' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'overflow-sized', override: { SMOKE_MS3_PORT: '18446744073709555816' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'nonnumeric', override: { SMOKE_MS3_PORT: 'abc' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'duplicate', override: { SMOKE_RES_PORT: '4200', SMOKE_MS3_PORT: '4200' }, pattern: /ports must be distinct/ },
  ];
  for (const fixture of cases) {
    const result = await runLauncher(context, {
      args: ['--print-config'],
      env: { ...cleanEnvironment(), ...fixture.override },
    });
    assert.notEqual(result.code, 0, fixture.name);
    assert.match(result.stderr, fixture.pattern, fixture.name);
    assert.equal(fs.existsSync(path.join(context.stateDir, '.startup-pids.tsv')), false);
  }
});

test('launcher refuses an occupied port without disturbing its owner', async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await closeServer(reservations[0].server);
  await closeServer(reservations[1].server);
  t.after(() => closeServer(reservations[2].server));
  const result = await runLauncher(context, { env: makeLauncherEnvironment(context, ports) });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, new RegExp(`ERROR: port ${ports[2]} is already in use on 127\\.0\\.0\\.1`));
  assert.equal(reservations[2].server.listening, true);
  assert.equal(fs.existsSync(path.join(context.stateDir, '.startup-pids.tsv')), false);
});

test('launcher detects a child that exits during startup and cleans up its siblings', async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const bin = installFailingPythonWrapper(context, ports[2]);
  const env = makeLauncherEnvironment(context, ports, {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  });
  const result = await runLauncher(context, { env });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /faculty server PID \d+ exited before becoming ready/);
  assert.match(result.stderr, /intentional test child death/);
  await assertFailureCleanedUp(context.stateDir, ports);
});

test('launcher times out an unreachable readiness path and cleans up every server', async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const env = makeLauncherEnvironment(context, ports, {
    SMOKE_READY_ATTEMPTS: '2',
    SMOKE_READY_DELAY_SECONDS: '0',
    SMOKE_READY_PATH: '/never-ready',
  });
  const result = await runLauncher(context, { env });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /ms3 server did not become ready after 2 attempts/);
  assert.doesNotMatch(result.stdout, /Servers ready/);
  for (const label of ['ms3', 'res', 'faculty']) {
    assert.equal(fs.existsSync(path.join(context.stateDir, `${label}.log`)), true);
  }
  await assertFailureCleanedUp(context.stateDir, ports);
});

test('launcher cleans up every child when it receives SIGTERM during startup', async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  let shellPid;
  const resultPromise = runLauncher(context, {
    env: makeLauncherEnvironment(context, ports, {
      SMOKE_READY_ATTEMPTS: '100',
      SMOKE_READY_DELAY_SECONDS: '0.1',
      SMOKE_READY_PATH: '/never-ready',
    }),
    onSpawn(child) { shellPid = child.pid; },
  });
  await waitForPidRecords(path.join(context.stateDir, '.startup-pids.tsv'), 3);
  process.kill(shellPid, 'SIGTERM');
  const result = await resultPromise;
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 143, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /Servers ready/);
  await assertFailureCleanedUp(context.stateDir, ports);
});

test('launcher refuses to overwrite an existing PID manifest', async (t) => {
  const context = createTestContext(t);
  const sentinel = 'do-not-overwrite\n';
  const manifest = path.join(context.stateDir, 'server-pids.tsv');
  fs.writeFileSync(manifest, sentinel);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const result = await runLauncher(context, { env: makeLauncherEnvironment(context, ports) });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /PID manifest already exists:/);
  assert.equal(fs.readFileSync(manifest, 'utf8'), sentinel);
  assert.equal(fs.existsSync(path.join(context.stateDir, '.startup-pids.tsv')), false);
  await waitForPortsClosed(ports);
});
