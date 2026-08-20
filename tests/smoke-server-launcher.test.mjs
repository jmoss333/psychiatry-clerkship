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
const RUNNER = path.join(ROOT, 'tests/smoke/run-local-playwright.sh');
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

function processGroupHasMembers(pgid) {
  const rows = spawnSync('ps', ['-axo', 'pid=,pgid='], { encoding: 'utf8' }).stdout.split(/\r?\n/);
  return rows.some((row) => {
    const match = row.match(/^\s*(\d+)\s+(\d+)\s*$/);
    return match && Number(match[2]) === pgid;
  });
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

function runRunner(context, {
  args = ['rotation-curator.spec.js'], env = cleanEnvironment(), cwd = os.tmpdir(),
  timeoutMs = 12_000, onSpawn = () => {},
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [RUNNER, ...args], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    context.processGroups.add(child.pid); onSpawn(child);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; }); child.once('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') reject(error); }
    }, timeoutMs);
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, timedOut, pgid: child.pid }); });
  });
}

async function waitFor(predicate, message, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await sleep(25); }
  assert.fail(message);
}

function runnerStateDirectories(temporary) {
  if (!fs.existsSync(temporary)) return [];
  return fs.readdirSync(temporary).filter((name) => name.startsWith('smoke-playwright.')).map((name) => path.join(temporary, name));
}

function installNpxStandIn(context, body) {
  const bin = path.join(context.temporary, `runner-bin-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(bin);
  const executable = path.join(bin, 'npx');
  fs.writeFileSync(executable, `#!/usr/bin/env bash\nset -u\n${body}\n`);
  fs.chmodSync(executable, 0o755);
  return bin;
}

async function runnerEnvironment(context, overrides = {}) {
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  return { ports, env: makeLauncherEnvironment(context, ports, { TMPDIR: context.temporary, ...overrides }) };
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

function realCurlExecutable() {
  const result = spawnSync('/bin/sh', ['-c', 'command -v curl'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function installHostileCurlFixture(context, proxyPort) {
  const home = path.join(context.temporary, 'hostile-curl-home');
  const bin = path.join(context.temporary, 'curl-bin');
  const trace = path.join(context.temporary, 'curl-args.tsv');
  const proxyUrl = `http://127.0.0.1:${proxyPort}`;
  fs.mkdirSync(home);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(home, '.curlrc'), `proxy = "${proxyUrl}"\n`);
  const wrapper = path.join(bin, 'curl');
  fs.writeFileSync(wrapper, `#!/usr/bin/env bash
printf '%s\\t%s\\t%s\\n' "\${1:-}" "\${2:-}" "\${3:-}" >> ${shellQuote(trace)}
exec ${shellQuote(realCurlExecutable())} "$@"
`);
  fs.chmodSync(wrapper, 0o755);
  return { bin, home, proxyUrl, trace };
}

function installSignalRaceBashEnv(context) {
  const bashEnv = path.join(context.temporary, 'signal-race.bash');
  fs.writeFileSync(bashEnv, [
    'set -T',
    'SMOKE_PID_ASSIGNMENTS=0',
    `trap 'if [ "\${BASH_COMMAND:-}" = "pid=\\$!" ]; then`,
    '  SMOKE_PID_ASSIGNMENTS=$((SMOKE_PID_ASSIGNMENTS + 1))',
    '  if [ "$SMOKE_PID_ASSIGNMENTS" -eq 3 ]; then',
    '    kill -TERM "$$"',
    '  fi',
    "fi' DEBUG",
    '',
  ].join('\n'));
  return bashEnv;
}

function assertExpectedStartupRecords(records, ports) {
  assert.deepEqual(records.map(({ label, port }) => [label, port]), [
    ['ms3', ports[0]],
    ['res', ports[1]],
    ['faculty', ports[2]],
  ]);
  assert.equal(new Set(records.map(({ pid }) => pid)).size, 3);
}

async function assertFailureCleanedUp(stateDir, ports) {
  const startupJournal = path.join(stateDir, '.startup-pids.tsv');
  assert.equal(fs.existsSync(startupJournal), true, 'startup journal must be retained on failure');
  const records = readPidFile(startupJournal);
  assertExpectedStartupRecords(records, ports);
  for (const { pid } of records) {
    assert.equal(isPidAlive(pid), false, `launcher leaked PID ${pid}`);
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

test('launcher serves all three configured marker sites and leaves their PIDs alive', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(4);
  const ports = reservations.slice(0, 3).map(({ port }) => port);
  const proxyPort = reservations[3].port;
  await releaseReservations(reservations);
  const curlFixture = installHostileCurlFixture(context, proxyPort);
  const env = makeLauncherEnvironment(context, ports, {
    PATH: `${curlFixture.bin}${path.delimiter}${process.env.PATH}`,
    HOME: curlFixture.home,
    CURL_HOME: curlFixture.home,
    XDG_CONFIG_HOME: curlFixture.home,
    ALL_PROXY: curlFixture.proxyUrl,
    all_proxy: curlFixture.proxyUrl,
    HTTP_PROXY: curlFixture.proxyUrl,
    http_proxy: curlFixture.proxyUrl,
    HTTPS_PROXY: curlFixture.proxyUrl,
    https_proxy: curlFixture.proxyUrl,
    NO_PROXY: '',
    no_proxy: '',
    SMOKE_READY_ATTEMPTS: '5',
    SMOKE_READY_DELAY_SECONDS: '0.05',
  });
  const result = await runLauncher(context, { env });
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Servers ready/);
  const curlInvocations = fs.readFileSync(curlFixture.trace, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split('\t'));
  assert.ok(curlInvocations.length >= 3, 'each server must receive a readiness probe');
  for (const invocation of curlInvocations) {
    assert.deepEqual(invocation, ['-q', '--noproxy', '*']);
  }
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

test('launcher preserves a trapped failure before recording its first PID', async (t) => {
  const context = createTestContext(t);
  const sentinel = 'do-not-overwrite\n';
  const ms3Log = path.join(context.stateDir, 'ms3.log');
  fs.writeFileSync(ms3Log, sentinel);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);

  const result = await runLauncher(context, { env: makeLauncherEnvironment(context, ports) });

  assert.equal(result.timedOut, false);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /ERROR: ms3 log already exists:/);
  assert.doesNotMatch(result.stderr, /PIDS\[@\]: unbound variable/);
  assert.equal(parseRecords(result.stdout, 'Started').length, 0);
  assert.equal(fs.readFileSync(ms3Log, 'utf8'), sentinel);
  assert.equal(fs.readFileSync(path.join(context.stateDir, '.startup-pids.tsv'), 'utf8'), '');
  assert.equal(fs.existsSync(path.join(context.stateDir, 'server-pids.tsv')), false);
  assert.deepEqual(
    fs.readdirSync(context.stateDir).filter((entry) => entry.startsWith('server-pids.tsv.tmp.')),
    [],
  );
  await waitForPortsClosed(ports);
});

test('launcher rejects invalid and duplicate startup configuration before startup', async (t) => {
  const context = createTestContext(t);
  const cases = [
    { name: 'zero', override: { SMOKE_MS3_PORT: '0' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'too large', override: { SMOKE_MS3_PORT: '65536' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'overflow-sized', override: { SMOKE_MS3_PORT: '18446744073709555816' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'nonnumeric', override: { SMOKE_MS3_PORT: 'abc' }, pattern: /must be an integer from 1 through 65535/ },
    { name: 'duplicate', override: { SMOKE_RES_PORT: '4200', SMOKE_MS3_PORT: '4200' }, pattern: /ports must be distinct/ },
    { name: 'overflow-sized attempts', override: { SMOKE_READY_ATTEMPTS: '18446744073709551617' }, pattern: /SMOKE_READY_ATTEMPTS must be an integer of at least 1/ },
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
    TMPDIR: context.temporary,
  });
  delete env.SMOKE_SERVER_STATE_DIR;
  const result = await runLauncher(context, { env });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /ms3 server did not become ready after 2 attempts/);
  assert.doesNotMatch(result.stdout, /Servers ready/);
  const stateRecords = parseRecords(result.stdout, 'STATE_DIR');
  assert.equal(stateRecords.length, 1);
  const stateDir = stateRecords[0][0];
  assert.equal(path.dirname(stateDir), context.temporary);
  assert.match(path.basename(stateDir), /^smoke-servers\./);
  for (const label of ['ms3', 'res', 'faculty']) {
    assert.equal(fs.existsSync(path.join(stateDir, `${label}.log`)), true);
  }
  await assertFailureCleanedUp(stateDir, ports);
  fs.rmSync(stateDir, { recursive: true });
  assert.equal(fs.existsSync(stateDir), false);
});

test('launcher cleans up every child when it receives SIGTERM during startup', async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const bashEnv = installSignalRaceBashEnv(context);
  const resultPromise = runLauncher(context, {
    env: makeLauncherEnvironment(context, ports, {
      BASH_ENV: bashEnv,
      SMOKE_READY_ATTEMPTS: '100',
      SMOKE_READY_DELAY_SECONDS: '0.1',
      SMOKE_READY_PATH: '/never-ready',
    }),
  });
  const startupJournal = path.join(context.stateDir, '.startup-pids.tsv');
  const startupRecords = await waitForPidRecords(startupJournal, 3);
  assert.equal(fs.existsSync(startupJournal), true);
  assertExpectedStartupRecords(startupRecords, ports);
  assert.equal(fs.existsSync(path.join(context.stateDir, 'server-pids.tsv')), false);
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

test('self-contained Playwright runner pins FIFO ownership and never signals manifest PIDs', () => {
  const source = fs.readFileSync(RUNNER, 'utf8');
  assert.match(source, /mktemp -d/);
  assert.match(source, /mkfifo/);
  assert.match(source, /exec 9<>/);
  assert.match(source, /LAUNCHER="\$SCRIPT_DIR\/start-local-servers\.sh"/);
  assert.match(source, /"\$LAUNCHER" --wait/);
  assert.match(source, /9>&-/);
  assert.match(source, /printf ['"]STOP\\n['"] >&9/);
  assert.doesNotMatch(source, /\bkill\b|pkill|server-pids[^\n]*kill/);
});

test('launcher wait mode validates one FIFO before preflight and owns cleanup through STOP or EOF', () => {
  const source = fs.readFileSync(LAUNCHER, 'utf8');
  assert.match(source, /--wait/);
  assert.match(source, /CONTROL_READY/);
  assert.match(source, /SERVERS_READY/);
  assert.match(source, /read[^\n]+CONTROL/);
  assert.match(source, /STOP/);
  assert.match(source, /jobs -pr/);
});

test('runner preserves the Playwright exit code and removes its private state', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t);
  const reservations = await reserveLoopbackPorts(3);
  const ports = reservations.map(({ port }) => port);
  await releaseReservations(reservations);
  const bin = path.join(context.temporary, 'bin'); fs.mkdirSync(bin);
  const trace = path.join(context.temporary, 'npx.trace');
  const fake = path.join(bin, 'npx');
  fs.writeFileSync(fake, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > ${shellQuote(trace)}\nexit 23\n`);
  fs.chmodSync(fake, 0o755);
  const result = await runRunner(context, { args: ['rotation-curator.spec.js', '--project=nav-ms3'], env: makeLauncherEnvironment(context, ports, { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: context.temporary }) });
  assert.equal(result.timedOut, false); assert.equal(result.code, 23, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(trace, 'utf8').trim(), 'playwright test rotation-curator.spec.js --project=nav-ms3');
  assert.deepEqual(fs.readdirSync(context.stateDir), []);
  assert.deepEqual(runnerStateDirectories(context.temporary), []);
  await waitForPortsClosed(ports);
});

test('runner passes arguments unchanged and closes descriptor 9 in the Playwright stand-in and grandchild', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t); const trace = path.join(context.temporary, 'fd.trace');
  const bin = installNpxStandIn(context, `
if [ -e /dev/fd/9 ]; then echo parent-leak > ${shellQuote(trace)}; exit 90; fi
/bin/bash -c 'if [ -e /dev/fd/9 ]; then exit 91; fi' || exit $?
printf '%s\n' "$*" > ${shellQuote(trace)}
exit 0`);
  const configured = await runnerEnvironment(context, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  const result = await runRunner(context, { args: ['one.spec.js', 'two.spec.js', '--project=nav-ms3', '--grep', 'exact words'], env: configured.env });
  assert.equal(result.timedOut, false); assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(trace, 'utf8').trim(), 'playwright test one.spec.js two.spec.js --project=nav-ms3 --grep exact words');
  assert.deepEqual(runnerStateDirectories(context.temporary), []); await waitForPortsClosed(configured.ports);
});

test('runner can restart immediately on the same clean ports without a TIME_WAIT false positive', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t);
  const bin = installNpxStandIn(context, 'exit 0');
  const configured = await runnerEnvironment(context, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  const first = await runRunner(context, { env: configured.env });
  assert.equal(first.timedOut, false); assert.equal(first.code, 0, first.stdout + first.stderr);
  const second = await runRunner(context, { env: configured.env });
  assert.equal(second.timedOut, false); assert.equal(second.code, 0, second.stdout + second.stderr);
  assert.deepEqual(runnerStateDirectories(context.temporary), []); await waitForPortsClosed(configured.ports);
});

test('hostile three-row stale manifest is rejected without signaling its unrelated live PID', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t), ready = path.join(context.temporary, 'test.ready'), release = path.join(context.temporary, 'test.release');
  const bin = installNpxStandIn(context, `
: > ${shellQuote(ready)}
attempt=0
while [ ! -f ${shellQuote(release)} ] && [ "$attempt" -lt 160 ]; do sleep 0.05; attempt=$((attempt+1)); done
[ -f ${shellQuote(release)} ] || exit 92
exit 0`);
  const configured = await runnerEnvironment(context, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  let runner;
  const resultPromise = runRunner(context, { env: configured.env, onSpawn: (child) => { runner = child; } });
  const stateDir = await waitFor(() => runnerStateDirectories(context.temporary)[0], 'runner state was not created');
  const manifest = path.join(stateDir, 'server-pids.tsv');
  await waitFor(() => fs.existsSync(manifest) && fs.existsSync(ready), 'runner did not reach active test');
  const unrelated = spawn('/bin/bash', ['-c', 'trap "" TERM; while :; do sleep 1; done'], { detached: true, stdio: 'ignore' });
  context.processGroups.add(unrelated.pid);
  fs.writeFileSync(manifest, [
    `ms3\t${unrelated.pid}\t${configured.ports[0]}`,
    `res\t${unrelated.pid}\t${configured.ports[1]}`,
    `faculty\t${unrelated.pid}\t${configured.ports[2]}`,
  ].join('\n') + '\n');
  fs.writeFileSync(release, 'continue\n');
  const result = await resultPromise;
  assert.equal(result.timedOut, false); assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.equal(isPidAlive(unrelated.pid), true, 'manifest PID was improperly signaled');
  assert.deepEqual(runnerStateDirectories(context.temporary), []); await waitForPortsClosed(configured.ports);
  assert.ok(runner.pid > 0);
});

test('preflight failure occurs after CONTROL_READY, never invokes tests, and leaves no private state', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t); fs.rmSync(context.sites.ms3, { recursive: true });
  const invoked = path.join(context.temporary, 'must-not-run');
  const bin = installNpxStandIn(context, `: > ${shellQuote(invoked)}; exit 0`);
  const configured = await runnerEnvironment(context, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  const result = await runRunner(context, { env: configured.env });
  assert.equal(result.timedOut, false); assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /unbound variable/, 'empty preflight cleanup must be safe under Bash nounset');
  assert.equal(fs.existsSync(invoked), false); assert.deepEqual(runnerStateDirectories(context.temporary), []);
  await waitForPortsClosed(configured.ports);
});

for (const signal of ['SIGTERM', 'SIGKILL']) test(`runner ${signal} before CONTROL_READY closes the FIFO without deadlock or residue`, {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t), bashEnv = path.join(context.temporary, 'hold-launcher.sh');
  const firstShell = path.join(context.temporary, 'wrapper-sourced'), holdReady = path.join(context.temporary, 'launcher-held'), holdRelease = path.join(context.temporary, 'launcher-release');
  fs.writeFileSync(bashEnv, `if [ ! -f ${shellQuote(firstShell)} ]; then : > ${shellQuote(firstShell)}; else : > ${shellQuote(holdReady)}; attempt=0; while [ ! -f ${shellQuote(holdRelease)} ] && [ "$attempt" -lt 240 ]; do sleep 0.025; attempt=$((attempt+1)); done; fi\n`);
  const bin = installNpxStandIn(context, 'exit 93');
  const configured = await runnerEnvironment(context, { BASH_ENV: bashEnv, PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  let child; const resultPromise = runRunner(context, { env: configured.env, onSpawn: (value) => { child = value; } });
  const stateDir = await waitFor(() => runnerStateDirectories(context.temporary)[0], 'runner state was not created');
  await waitFor(() => fs.existsSync(holdReady), 'launcher did not enter the pre-control hold');
  assert.doesNotMatch(fs.readFileSync(path.join(stateDir, 'launcher.stdout'), 'utf8'), /CONTROL_READY/);
  child.kill(signal);
  if (signal === 'SIGTERM') {
    await waitFor(() => fs.existsSync(path.join(stateDir, '.wrapper-cleaning')), 'runner did not enter its TERM cleanup');
  } else {
    await waitFor(() => !isPidAlive(child.pid), 'SIGKILL did not terminate the runner');
  }
  fs.writeFileSync(holdRelease, 'release\n');
  const result = await resultPromise; assert.equal(result.timedOut, false);
  if (signal === 'SIGTERM') assert.equal(result.code, 143, result.stdout + result.stderr); else assert.equal(result.signal, 'SIGKILL');
  await waitFor(() => runnerStateDirectories(context.temporary).length === 0, 'private runner state survived signal', 6_000);
  await waitForPortsClosed(configured.ports);
});

for (const signal of ['SIGTERM', 'SIGKILL']) test(`runner ${signal} during an active test tree releases launcher ownership and server state`, {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t), ready = path.join(context.temporary, 'active.ready'), childDone = path.join(context.temporary, 'grandchild.done');
  const bin = installNpxStandIn(context, `
/bin/bash -c 'sleep 1; : > ${shellQuote(childDone)}' &
: > ${shellQuote(ready)}
wait
exit 0`);
  const configured = await runnerEnvironment(context, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  let child; const resultPromise = runRunner(context, { env: configured.env, onSpawn: (value) => { child = value; } });
  await waitFor(() => fs.existsSync(ready), 'test stand-in did not become active'); child.kill(signal);
  const result = await resultPromise; assert.equal(result.timedOut, false);
  if (signal === 'SIGTERM') assert.equal(result.code, 143, result.stdout + result.stderr); else assert.equal(result.signal, 'SIGKILL');
  await waitFor(() => fs.existsSync(childDone), 'test grandchild did not finish its descriptor-safe path');
  await waitFor(() => runnerStateDirectories(context.temporary).length === 0, 'active-signal state survived', 6_000);
  await waitForPortsClosed(configured.ports);
  await waitFor(() => !processGroupHasMembers(child.pid), 'active test process group survived', 6_000);
  context.processGroups.delete(child.pid);
});

test('launcher ownership loss after readiness fails closed and remains bounded', {
  skip: process.env.NETLIFY === 'true' && 'server spawning is blocked in Netlify build containers',
}, async (t) => {
  const context = createTestContext(t), ready = path.join(context.temporary, 'owner.ready'), release = path.join(context.temporary, 'owner.release');
  const bin = installNpxStandIn(context, `: > ${shellQuote(ready)}; while [ ! -f ${shellQuote(release)} ]; do sleep 0.05; done; exit 0`);
  const configured = await runnerEnvironment(context, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  let wrapper; const resultPromise = runRunner(context, { env: configured.env, onSpawn: (value) => { wrapper = value; } });
  await waitFor(() => fs.existsSync(ready), 'test stand-in did not become active');
  const launcherPid = await waitFor(() => {
    const rows = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).stdout.split(/\r?\n/);
    for (const row of rows) {
      const match = row.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (match && Number(match[2]) === wrapper.pid && match[3].includes('start-local-servers.sh')) return Number(match[1]);
    }
    return null;
  }, 'launcher direct child was not found');
  process.kill(launcherPid, 'SIGTERM'); fs.writeFileSync(release, 'continue\n');
  const result = await resultPromise; assert.equal(result.timedOut, false); assert.notEqual(result.code, 0);
  await waitFor(() => runnerStateDirectories(context.temporary).length === 0, 'ownership-loss state survived', 6_000);
  await waitForPortsClosed(configured.ports);
});
