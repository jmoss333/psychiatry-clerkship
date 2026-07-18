# Tested Smoke-Server Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline smoke-server startup in GitHub Actions with one directly tested launcher that automatically starts, verifies, and preserves the MS3, resident, and faculty-console servers for Playwright.

**Architecture:** A Bash 3.2-compatible launcher owns configuration, loopback-only process startup, readiness polling, PID/log state, and fail-closed cleanup. A Node built-in test suite executes that launcher against real temporary sites, while the existing CI contract shrinks to verifying one launcher invocation, workflow ordering, and the absence of duplicate inline server commands.

**Tech Stack:** Bash 3.2+, Python 3 standard-library `http.server` and `socket`, curl, Node.js 20+ built-ins (`node:test`, `child_process`, `http`, `net`, `fs`), GitHub Actions YAML.

## Global Constraints

- CI must invoke the launcher automatically; faculty users must not run a manual prerequisite.
- Default mappings remain `4200 → _build/ms3`, `4201 → _build/res`, and `4202 → faculty-console`.
- Successful startup must leave all three servers alive for later Playwright steps.
- Any validation, startup, liveness, readiness, signal, or timeout failure must stop every process started by the launcher and exit nonzero.
- Servers must bind only to `127.0.0.1`.
- Local/test port and directory overrides are allowed, but CI must use the defaults with no override.
- The launcher must work with macOS Bash 3.2 and Ubuntu Bash; do not use associative arrays, `mapfile`, `wait -n`, `readlink -f`, `realpath`, GNU `timeout`, `ss`, `lsof`, `nc`, `/dev/tcp`, or `disown`.
- Use only existing system/runtime dependencies; add no package, YAML parser, shell framework, or process supervisor.
- Do not change Playwright projects, site builds, deployments, application code, serverless code, curriculum content, faculty attestations, or learner state.
- Preserve `SP_INTERVIEW_BASE_URL: http://localhost:4200/tools/` in CI.
- Preserve unrelated F25/F26 managed-SP fail-closed tests in `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`.
- Do not edit `CLAUDE.md` or `AGENTS.md`; if later work requires either file, they must remain byte-identical.

## File structure

- Create `tests/smoke/start-local-servers.sh` — the only executable owner of smoke-server startup, readiness, state, diagnostics, and failure cleanup.
- Create `tests/smoke-server-launcher.test.mjs` — direct black-box tests using temporary marker sites, dynamic ports, real HTTP requests, and deterministic process cleanup.
- Modify `.github/workflows/ci.yml` — replace the inline server/readiness block with one launcher command.
- Modify `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` — remove server-internal YAML interpretation and retain only launcher invocation/order boundaries plus unrelated CI gates.
- Modify `tests/smoke/README.md` — document automatic CI use, optional local use, matching Playwright URL overrides, and cleanup.

---

### Task 1: Build and directly test the smoke-server launcher

**Files:**
- Create: `tests/smoke/start-local-servers.sh`
- Create: `tests/smoke-server-launcher.test.mjs`

**Interfaces:**
- Consumes: repository root derived from `BASH_SOURCE[0]`; default/optional `SMOKE_*` environment variables; `python3`; `curl`.
- Produces: `bash tests/smoke/start-local-servers.sh` and `--print-config`; tab-delimited `CONFIG`, `STATE_DIR`, and `SERVER_PID` records; `server-pids.tsv` only after complete readiness; `.startup-pids.tsv` for failure diagnosis; one log per surface; final `Servers ready` marker.

- [ ] **Step 1: Write the complete black-box test suite before the launcher exists**

Create `tests/smoke-server-launcher.test.mjs` with the following imports, helpers, and nine behavioral tests. Keep all test resources inside a unique temporary directory and register cleanup immediately.

```js
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
```

- [ ] **Step 2: Run the direct tests and verify RED**

Run:

```bash
node --test tests/smoke-server-launcher.test.mjs
```

Expected: FAIL because `/bin/bash` cannot open `tests/smoke/start-local-servers.sh`; none of the nine behavioral contracts can pass before the launcher exists.

- [ ] **Step 3: Implement the Bash 3.2-compatible launcher**

Create `tests/smoke/start-local-servers.sh` with the following complete implementation. Do not replace the Python socket preflight with a check-then-close loop per port; the single Python process must hold all three sockets until every bind succeeds.

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
cd "$ROOT"

MS3_PORT="${SMOKE_MS3_PORT:-4200}"
RES_PORT="${SMOKE_RES_PORT:-4201}"
FACULTY_PORT="${SMOKE_FACULTY_PORT:-4202}"
MS3_DIR="${SMOKE_MS3_DIR:-_build/ms3}"
RES_DIR="${SMOKE_RES_DIR:-_build/res}"
FACULTY_DIR="${SMOKE_FACULTY_DIR:-faculty-console}"
READY_ATTEMPTS="${SMOKE_READY_ATTEMPTS:-15}"
READY_DELAY="${SMOKE_READY_DELAY_SECONDS:-1}"
READY_PATH="${SMOKE_READY_PATH:-/}"
STATE_DIR="${SMOKE_SERVER_STATE_DIR:-}"

PIDS=()
LABELS=()
PORTS=()
LOGS=()
STARTUP_COMPLETE=0
STARTUP_JOURNAL=""
PID_MANIFEST=""
PID_TMP=""

error() {
  printf 'ERROR: %s\n' "$*" >&2
}

die() {
  error "$*"
  exit 1
}

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$ROOT" "$1" ;;
  esac
}

normalize_port() {
  local name="$1"
  local raw="$2"
  local normalized
  case "$raw" in
    ''|*[!0-9]*) die "$name must be an integer from 1 through 65535" ;;
  esac
  normalized="$raw"
  while [ "${#normalized}" -gt 1 ] && [ "${normalized#0}" != "$normalized" ]; do
    normalized="${normalized#0}"
  done
  if [ "$normalized" = '0' ] || [ "${#normalized}" -gt 5 ]; then
    die "$name must be an integer from 1 through 65535"
  fi
  normalized=$((10#$normalized))
  if [ "$normalized" -gt 65535 ]; then
    die "$name must be an integer from 1 through 65535"
  fi
  printf '%s\n' "$normalized"
}

normalize_attempts() {
  local raw="$1"
  local normalized
  case "$raw" in
    ''|*[!0-9]*) die 'SMOKE_READY_ATTEMPTS must be an integer of at least 1' ;;
  esac
  normalized=$((10#$raw))
  if [ "$normalized" -lt 1 ]; then
    die 'SMOKE_READY_ATTEMPTS must be an integer of at least 1'
  fi
  printf '%s\n' "$normalized"
}

validate_config() {
  MS3_PORT="$(normalize_port SMOKE_MS3_PORT "$MS3_PORT")"
  RES_PORT="$(normalize_port SMOKE_RES_PORT "$RES_PORT")"
  FACULTY_PORT="$(normalize_port SMOKE_FACULTY_PORT "$FACULTY_PORT")"
  READY_ATTEMPTS="$(normalize_attempts "$READY_ATTEMPTS")"

  if [ "$MS3_PORT" = "$RES_PORT" ] \
    || [ "$MS3_PORT" = "$FACULTY_PORT" ] \
    || [ "$RES_PORT" = "$FACULTY_PORT" ]; then
    die 'ports must be distinct'
  fi
  if ! [[ "$READY_DELAY" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    die 'SMOKE_READY_DELAY_SECONDS must be a nonnegative number'
  fi
  case "$READY_PATH" in
    /*) ;;
    *) die 'SMOKE_READY_PATH must begin with /' ;;
  esac
  case "$READY_PATH" in
    *$'\n'*|*$'\r'*) die 'SMOKE_READY_PATH must not contain a newline' ;;
  esac
  [ -n "$MS3_DIR" ] || die 'SMOKE_MS3_DIR must not be empty'
  [ -n "$RES_DIR" ] || die 'SMOKE_RES_DIR must not be empty'
  [ -n "$FACULTY_DIR" ] || die 'SMOKE_FACULTY_DIR must not be empty'
}

print_config() {
  printf 'CONFIG\tms3\t%s\t%s\n' "$MS3_PORT" "$(resolve_path "$MS3_DIR")"
  printf 'CONFIG\tres\t%s\t%s\n' "$RES_PORT" "$(resolve_path "$RES_DIR")"
  printf 'CONFIG\tfaculty\t%s\t%s\n' "$FACULTY_PORT" "$(resolve_path "$FACULTY_DIR")"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

require_directory() {
  local label="$1"
  local directory="$2"
  [ -d "$directory" ] || die "directory for $label does not exist: $directory"
}

preflight_ports() {
  python3 - "$MS3_PORT" "$RES_PORT" "$FACULTY_PORT" <<'PY'
import socket
import sys

sockets = []
try:
    for raw_port in sys.argv[1:]:
        port = int(raw_port)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            sock.close()
            print(f"ERROR: port {port} is already in use on 127.0.0.1", file=sys.stderr)
            raise SystemExit(1)
        sockets.append(sock)
finally:
    for sock in sockets:
        sock.close()
PY
}

refuse_existing_artifact() {
  local artifact="$1"
  local description="$2"
  if [ -e "$artifact" ] || [ -L "$artifact" ]; then
    die "$description already exists: $artifact"
  fi
}

cleanup_processes() {
  local pid
  local attempt=0
  local alive
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" >/dev/null 2>&1 || true
  done
  while [ "$attempt" -lt 20 ]; do
    alive=0
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then alive=1; fi
    done
    [ "$alive" -eq 0 ] && break
    sleep 0.1
    attempt=$((attempt + 1))
  done
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  done
  for pid in "${PIDS[@]}"; do
    wait "$pid" >/dev/null 2>&1 || true
  done
}

print_logs() {
  local index
  local line
  for ((index = 0; index < ${#LOGS[@]}; index++)); do
    [ -f "${LOGS[$index]}" ] || continue
    printf '%s\n' "--- ${LABELS[$index]} server log ---" >&2
    while IFS= read -r line || [ -n "$line" ]; do
      printf '%s\n' "$line" >&2
    done < "${LOGS[$index]}"
  done
}

on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [ "$STARTUP_COMPLETE" -ne 1 ]; then
    [ "$status" -ne 0 ] || status=1
    set +e
    cleanup_processes
    if [ -n "$PID_MANIFEST" ]; then rm -f "$PID_MANIFEST"; fi
    if [ -n "$PID_TMP" ]; then rm -f "$PID_TMP"; fi
    print_logs
  fi
  exit "$status"
}

start_server() {
  local label="$1"
  local port="$2"
  local directory="$3"
  local log="$STATE_DIR/$label.log"
  local pid
  refuse_existing_artifact "$log" "$label log"
  python3 -m http.server "$port" \
    --bind 127.0.0.1 \
    --directory "$directory" >"$log" 2>&1 &
  pid=$!
  LABELS+=("$label")
  PORTS+=("$port")
  LOGS+=("$log")
  PIDS+=("$pid")
  printf '%s\t%s\t%s\n' "$label" "$pid" "$port" >> "$STARTUP_JOURNAL"
  printf 'Started\t%s\t%s\n' "$label" "$pid"
}

wait_until_ready() {
  local label="$1"
  local port="$2"
  local pid="$3"
  local attempt=1
  local url="http://127.0.0.1:${port}${READY_PATH}"
  while [ "$attempt" -le "$READY_ATTEMPTS" ]; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      error "$label server PID $pid exited before becoming ready"
      return 1
    fi
    if curl --connect-timeout 1 --max-time 2 -fsS "$url" >/dev/null 2>&1; then
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        error "$label server PID $pid exited before becoming ready"
        return 1
      fi
      printf 'Ready\t%s\thttp://127.0.0.1:%s%s\n' "$label" "$port" "$READY_PATH"
      return 0
    fi
    if [ "$attempt" -lt "$READY_ATTEMPTS" ]; then sleep "$READY_DELAY"; fi
    attempt=$((attempt + 1))
  done
  error "$label server did not become ready after $READY_ATTEMPTS attempts: $url"
  return 1
}

case "$#" in
  0) MODE='start' ;;
  1)
    [ "$1" = '--print-config' ] || die 'usage: start-local-servers.sh [--print-config]'
    MODE='print-config'
    ;;
  *) die 'usage: start-local-servers.sh [--print-config]' ;;
esac

validate_config
if [ "$MODE" = 'print-config' ]; then
  print_config
  exit 0
fi

require_command python3
require_command curl
MS3_DIR="$(resolve_path "$MS3_DIR")"
RES_DIR="$(resolve_path "$RES_DIR")"
FACULTY_DIR="$(resolve_path "$FACULTY_DIR")"
require_directory ms3 "$MS3_DIR"
require_directory res "$RES_DIR"
require_directory faculty "$FACULTY_DIR"
preflight_ports

if [ -n "$STATE_DIR" ]; then
  STATE_DIR="$(resolve_path "$STATE_DIR")"
  mkdir -p "$STATE_DIR"
else
  STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smoke-servers.XXXXXX")"
fi
PID_MANIFEST="$STATE_DIR/server-pids.tsv"
STARTUP_JOURNAL="$STATE_DIR/.startup-pids.tsv"
PID_TMP="$STATE_DIR/server-pids.tsv.tmp.$$"
refuse_existing_artifact "$PID_MANIFEST" 'PID manifest'
refuse_existing_artifact "$STARTUP_JOURNAL" 'startup journal'
refuse_existing_artifact "$PID_TMP" 'temporary PID manifest'
: > "$STARTUP_JOURNAL"

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

start_server ms3 "$MS3_PORT" "$MS3_DIR"
start_server res "$RES_PORT" "$RES_DIR"
start_server faculty "$FACULTY_PORT" "$FACULTY_DIR"

for ((index = 0; index < ${#PIDS[@]}; index++)); do
  wait_until_ready "${LABELS[$index]}" "${PORTS[$index]}" "${PIDS[$index]}"
done
for ((index = 0; index < ${#PIDS[@]}; index++)); do
  kill -0 "${PIDS[$index]}" >/dev/null 2>&1 \
    || die "${LABELS[$index]} server PID ${PIDS[$index]} exited after readiness"
done

: > "$PID_TMP"
for ((index = 0; index < ${#PIDS[@]}; index++)); do
  printf '%s\t%s\t%s\n' \
    "${LABELS[$index]}" "${PIDS[$index]}" "${PORTS[$index]}" >> "$PID_TMP"
done
mv "$PID_TMP" "$PID_MANIFEST"
rm -f "$STARTUP_JOURNAL"

printf 'STATE_DIR\t%s\n' "$STATE_DIR"
for ((index = 0; index < ${#PIDS[@]}; index++)); do
  printf 'SERVER_PID\t%s\t%s\n' "${LABELS[$index]}" "${PIDS[$index]}"
done
printf 'Stop with: kill'
for pid in "${PIDS[@]}"; do printf ' %s' "$pid"; done
printf '\nServers ready\n'

STARTUP_COMPLETE=1
trap - EXIT HUP INT TERM
```

Make the script executable:

```bash
chmod 755 tests/smoke/start-local-servers.sh
```

- [ ] **Step 4: Run syntax and direct tests to verify GREEN**

Run:

```bash
bash -n tests/smoke/start-local-servers.sh
node --test tests/smoke-server-launcher.test.mjs
```

Expected:

- Bash syntax check exits `0` with no output.
- Node reports 9 tests passing, including all five invalid-port fixtures and signal cleanup, with 0 failures.
- No Python HTTP server remains after the test process exits.

- [ ] **Step 5: Inspect process and artifact cleanup**

Run:

```bash
git status --short
git diff --check
```

Expected: only the launcher and direct test are new for this task; diff check is silent. Temporary state, marker sites, PID files, and logs are under the system temporary directory and are not tracked.

- [ ] **Step 6: Commit the directly tested launcher**

```bash
git add tests/smoke/start-local-servers.sh tests/smoke-server-launcher.test.mjs
git commit -m "test(ci): add tested smoke-server launcher"
```

Expected: one commit containing the executable launcher and its black-box tests.

---

### Task 2: Wire the launcher into CI and remove duplicated YAML interpretation

**Files:**
- Modify: `.github/workflows/ci.yml:130-150`
- Modify: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs:137-528`
- Modify: `tests/smoke/README.md:15-36,65-101`
- Test: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`
- Test: `tests/smoke-server-launcher.test.mjs`

**Interfaces:**
- Consumes: `bash tests/smoke/start-local-servers.sh` and its default CI mappings from Task 1.
- Produces: one automatic smoke-job launcher invocation after builds and Playwright installation; no CI `SMOKE_*` override; no active inline `python3 -m http.server` even when chained or spacing varies; label-insensitive workflow boundary tests; optional local documentation.

- [ ] **Step 1: Replace server-internal CI assertions with the launcher boundary contract**

In `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`, replace the block from `const SMOKE_SERVERS` through the final alternate-block-scalar server mutation test. Keep the later `run-all.sh` and F25 tests. Use this exact replacement so `extractRunSteps`, `countRunCommands`, and `hasExactLine` remain available to `assertCiGatesFailClosed`:

```js
const SMOKE_LAUNCHER_COMMAND = 'bash tests/smoke/start-local-servers.sh';
const SMOKE_CONFIGURATION_PATTERN = /\bSMOKE_(?:MS3_PORT|RES_PORT|FACULTY_PORT|MS3_DIR|RES_DIR|FACULTY_DIR|READY_ATTEMPTS|READY_DELAY_SECONDS|READY_PATH|SERVER_STATE_DIR)\b/;

function leadingIndent(line) {
  return line.length - line.trimStart().length;
}

function extractRunSteps(source) {
  const sourceLines = source.split(/\r?\n/);
  const steps = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index];
    const blockRun = sourceLine.match(/^(\s*)(-\s+)?run:\s*([|>][+-]?)\s*$/);
    if (blockRun) {
      const runIndent = blockRun[1].length + (blockRun[2]?.length ?? 0);
      const lines = [];
      let endLine = index;
      for (let bodyIndex = index + 1; bodyIndex < sourceLines.length; bodyIndex += 1) {
        const bodyLine = sourceLines[bodyIndex];
        if (bodyLine.trim() && leadingIndent(bodyLine) <= runIndent) break;
        lines.push({ text: bodyLine.trim(), sourceLine: bodyIndex });
        endLine = bodyIndex;
      }
      steps.push({ startLine: index, endLine, lines });
      index = endLine;
      continue;
    }

    const inlineRun = sourceLine.match(/^(\s*)(-\s+)?run:\s+(.+?)\s*$/);
    if (!inlineRun) continue;
    steps.push({
      startLine: index,
      endLine: index,
      lines: [{ text: inlineRun[3], sourceLine: index }],
    });
  }
  return steps;
}

function countExactLines(lines, marker) {
  return lines.filter((line) => line.text === marker).length;
}

function hasExactLine(lines, marker) {
  return lines.some((line) => line.text === marker);
}

function countRunCommands(runSteps, command) {
  return runSteps.reduce(
    (count, step) => count + countExactLines(step.lines, command),
    0,
  );
}

function extractWorkflowJob(ci, jobName) {
  const lines = ci.split(/\r?\n/);
  const header = `  ${jobName}:`;
  const start = lines.findIndex((line) => line === header);
  assert.notEqual(start, -1, `${jobName} workflow job must exist`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function uniqueCommandPosition(runSteps, command) {
  const matches = [];
  for (const step of runSteps) {
    for (const line of step.lines) {
      if (line.text === command) matches.push(line.sourceLine);
    }
  }
  assert.equal(matches.length, 1, `${command} must run exactly once in the smoke-tests job`);
  return matches[0];
}

function assertSmokeLauncherContract(ci) {
  const allRunSteps = extractRunSteps(ci);
  assert.equal(
    countRunCommands(allRunSteps, SMOKE_LAUNCHER_COMMAND),
    1,
    'tested smoke-server launcher must run exactly once in CI',
  );
  const activeCi = ci
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
  assert.doesNotMatch(
    activeCi,
    SMOKE_CONFIGURATION_PATTERN,
    'CI must use the launcher default ports, directories, and readiness controls',
  );
  for (const step of allRunSteps) {
    for (const line of step.lines) {
      if (line.text.startsWith('#')) continue;
      assert.doesNotMatch(
        line.text,
        /\bpython3\s+-m\s+http\.server(?:\s|$)/,
        'CI must not duplicate smoke-server startup outside the tested launcher',
      );
    }
  }

  const smokeJob = extractWorkflowJob(ci, 'smoke-tests');
  const smokeRunSteps = extractRunSteps(smokeJob);
  const ordered = [
    'bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3',
    'bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res',
    'npm ci',
    'npx playwright install chromium --with-deps',
    SMOKE_LAUNCHER_COMMAND,
    'npx playwright test --project=nav-ms3 --project=nav-res',
    'npx playwright test --project=interview-room',
    'npx playwright test --project=faculty-console',
    'npx playwright test --project=lfs',
    'npx playwright test --project=visual',
  ];
  let prior = -1;
  for (const command of ordered) {
    const position = uniqueCommandPosition(smokeRunSteps, command);
    assert.ok(position > prior, `${command} must follow the preceding smoke-job command`);
    prior = position;
  }
  assert.match(
    smokeJob,
    /SP_INTERVIEW_BASE_URL:\s*http:\/\/localhost:4200\/tools\//,
  );
}

test('CI gates and tested smoke launcher are structurally ordered', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const ciLines = ci.split(/\r?\n/);
  const managedGateOrder = [
    '- uses: actions/setup-node@v4',
    'node-version: "20"',
    'run: npm --prefix sp-proxy ci',
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
    'run: bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3',
    'run: bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res',
  ];
  let prior = -1;
  for (const marker of managedGateOrder) {
    const index = ciLines.findIndex((line) => line.trim() === marker);
    assert.ok(index > prior, `${marker} must occur after the preceding managed-SP gate`);
    prior = index;
  }
  assertSmokeLauncherContract(ci);
});

test('smoke launcher contract ignores labels and rejects boundary drift', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const relabeled = ci.replace(
    /(\n\s*- name: )[^\n]+(\n\s+run: bash tests\/smoke\/start-local-servers\.sh)/,
    '$1Arbitrary wording that must not affect behavior$2',
  );
  assert.notEqual(relabeled, ci, 'test fixture must relabel the launcher step');
  assert.doesNotThrow(() => assertSmokeLauncherContract(relabeled));

  const overridden = ci.replace(
    `        run: ${SMOKE_LAUNCHER_COMMAND}`,
    `        env:\n          SMOKE_MS3_PORT: "4300"\n        run: ${SMOKE_LAUNCHER_COMMAND}`,
  );
  assert.notEqual(overridden, ci, 'test fixture must add a launcher override');
  assert.throws(
    () => assertSmokeLauncherContract(overridden),
    /must use the launcher default ports, directories, and readiness controls/,
  );

  assert.throws(
    () => assertSmokeLauncherContract(ci.replace(SMOKE_LAUNCHER_COMMAND, 'echo launcher-removed')),
    /launcher must run exactly once/,
  );

  const duplicated = ci.replace(
    `run: ${SMOKE_LAUNCHER_COMMAND}`,
    `run: |\n          ${SMOKE_LAUNCHER_COMMAND}\n          ${SMOKE_LAUNCHER_COMMAND}`,
  );
  assert.throws(
    () => assertSmokeLauncherContract(duplicated),
    /launcher must run exactly once/,
  );

  const withoutLauncherStep = ci.replace(
    /\n\s*- name: [^\n]+\n\s+run: bash tests\/smoke\/start-local-servers\.sh\n/,
    '\n',
  );
  assert.notEqual(withoutLauncherStep, ci, 'test fixture must remove the launcher step');
  const movedBeforeBuild = withoutLauncherStep.replace(
    '          bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3',
    `          ${SMOKE_LAUNCHER_COMMAND}\n          bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`,
  );
  assert.notEqual(movedBeforeBuild, withoutLauncherStep, 'test fixture must move the launcher before builds');
  assert.throws(
    () => assertSmokeLauncherContract(movedBeforeBuild),
    /must follow the preceding smoke-job command/,
  );

  for (const projectCommand of [
    'npx playwright test --project=nav-ms3 --project=nav-res',
    'npx playwright test --project=interview-room',
    'npx playwright test --project=faculty-console',
    'npx playwright test --project=lfs',
    'npx playwright test --project=visual',
  ]) {
    const movedProject = ci
      .replace(projectCommand, '')
      .replace(
        `run: ${SMOKE_LAUNCHER_COMMAND}`,
        `run: |\n          ${projectCommand}\n          ${SMOKE_LAUNCHER_COMMAND}`,
      );
    assert.throws(
      () => assertSmokeLauncherContract(movedProject),
      /must follow the preceding smoke-job command/,
    );
  }

  const duplicatedInlineServer = ci.replace(
    `run: ${SMOKE_LAUNCHER_COMMAND}`,
    `run: |\n          ${SMOKE_LAUNCHER_COMMAND}\n          cd _build/ms3 && python3   -m http.server 4200 &`,
  );
  assert.throws(
    () => assertSmokeLauncherContract(duplicatedInlineServer),
    /must not duplicate smoke-server startup/,
  );
});
```

- [ ] **Step 2: Run the new CI contract against the old inline workflow and verify RED**

Run:

```bash
node --test --test-name-pattern='tested smoke launcher|smoke launcher contract' _prototypes/sp-interview/tests/ci-build-contract.test.mjs
```

Expected: FAIL because the workflow still contains no `bash tests/smoke/start-local-servers.sh` invocation and still contains active inline `python3 -m http.server` commands.

- [ ] **Step 3: Replace inline workflow startup with the tested launcher**

In `.github/workflows/ci.yml`, replace the complete current `Serve built sites on localhost (including faculty console)` block with:

```yaml
      - name: Start local review servers
        run: bash tests/smoke/start-local-servers.sh
```

Do not alter any surrounding build, Playwright-install, browser-project, environment, LFS, visual, or artifact step.

- [ ] **Step 4: Update local and container documentation to use the launcher**

In `tests/smoke/README.md`, replace the main local-running block with:

```bash
# From the repository root:
npm --prefix tests/smoke ci
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash tests/smoke/start-local-servers.sh

# Defaults printed by the launcher:
#   MS3             http://127.0.0.1:4200/
#   Resident        http://127.0.0.1:4201/
#   Faculty console http://127.0.0.1:4202/
# The launcher prints the exact `kill` command to stop all three servers.

cd tests/smoke
SP_INTERVIEW_BASE_URL=http://localhost:4200/tools/ npx playwright test
npx playwright test --project=nav-ms3
npx playwright test --project=nav-res
npx playwright test --project=faculty-console
npx playwright test --project=lfs
npx playwright test --project=visual
```

Immediately below it, add this conflict-free local override example. The Playwright URL variables must match the launcher ports; do not imply that changing only the launcher environment redirects Playwright:

```bash
export SMOKE_MS3_PORT=4300
export SMOKE_RES_PORT=4301
export SMOKE_FACULTY_PORT=4302
bash tests/smoke/start-local-servers.sh

cd tests/smoke
MS3_BASE_URL=http://127.0.0.1:4300 \
RES_BASE_URL=http://127.0.0.1:4301 \
FACULTY_CONSOLE_BASE_URL=http://127.0.0.1:4302 \
SP_INTERVIEW_BASE_URL=http://127.0.0.1:4300/tools/ \
npx playwright test
```

In both Docker visual-baseline snippets, replace the inline Python server commands and manual readiness loops with this one repository-root command:

```bash
bash tests/smoke/start-local-servers.sh
```

Keep the container image, volumes, Playwright install, visual commands, and baseline warnings unchanged.

- [ ] **Step 5: Run focused integration tests and verify GREEN**

Run:

```bash
bash -n tests/smoke/start-local-servers.sh
node --test tests/smoke-server-launcher.test.mjs
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
git diff --check
```

Expected:

- launcher syntax exits `0`;
- direct launcher suite passes all 9 tests;
- CI contract reports 8 tests passed, 0 failed;
- aggregate Interview Room runner prints `ALL SUITES PASSED`;
- diff check is silent.

- [ ] **Step 6: Review scope and commit CI integration**

Run:

```bash
git status --short
git diff -- .github/workflows/ci.yml _prototypes/sp-interview/tests/ci-build-contract.test.mjs tests/smoke/README.md
```

Expected: the workflow diff is one launcher step, the contract diff deletes server-internal YAML interpretation, and README examples use the shared launcher. No application, build, deploy, proxy, curriculum, or attestation file changes.

Commit:

```bash
git add .github/workflows/ci.yml _prototypes/sp-interview/tests/ci-build-contract.test.mjs tests/smoke/README.md
git commit -m "ci: use tested smoke-server launcher"
```

---

### Task 3: Run integrated release gates and publish the follow-up PR

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: Task 1 launcher/tests and Task 2 CI/docs integration.
- Produces: clean local evidence, independent review, a pushed branch, a focused pull request, and terminal remote CI results.

- [ ] **Step 1: Run all non-browser repository gates**

Run:

```bash
npm --prefix sp-proxy ci
npm --prefix sp-proxy test
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
node --test tests/*.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git diff --check origin/main...HEAD
```

Expected:

- proxy install and 212-test suite pass;
- both Python validators report success;
- root Node suite reports 356 passing tests with 0 failures;
- aggregate Interview Room suites pass;
- both site build/static-QA gates exit `0` (known soft metadata warnings remain non-blocking);
- full-range diff check is silent.

- [ ] **Step 2: Run the real local browser surfaces through the new launcher**

Run from the repository root:

```bash
set -euo pipefail
STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smoke-launcher-manual.XXXXXX")"
cleanup_manual_servers() {
  status=$?
  trap - EXIT
  set +e
  if [ -f "$STATE_DIR/server-pids.tsv" ]; then
    while IFS=$'\t' read -r label pid port; do
      kill "$pid" >/dev/null 2>&1 || true
    done < "$STATE_DIR/server-pids.tsv"
  fi
  rm -rf "$STATE_DIR"
  exit "$status"
}
trap cleanup_manual_servers EXIT
SMOKE_SERVER_STATE_DIR="$STATE_DIR" bash tests/smoke/start-local-servers.sh
cd tests/smoke
npm ci
SP_INTERVIEW_BASE_URL=http://127.0.0.1:4200/tools/ \
npx playwright test \
  --project=nav-ms3 \
  --project=nav-res \
  --project=interview-room \
  --project=faculty-console
cd ../..
cleanup_manual_servers
```

Expected: launcher prints three `SERVER_PID` records and `Servers ready`; all selected browser projects pass; cleanup terminates the three local Python servers. If Playwright hangs under the default Node 25 runtime, prepend `/usr/local/bin` to `PATH` and rerun with the repository's known Node 22 runtime before diagnosing an application regression.

- [ ] **Step 3: Obtain independent final review**

Request review of `origin/main...HEAD` against the approved design and this plan. Require explicit checks for:

- Bash 3.2/macOS and Ubuntu compatibility;
- no leaked processes on every failure path;
- final PID manifest only after complete readiness;
- no inherited child stdout/stderr pipes;
- exact default mappings and loopback binding;
- rejection of overflow-sized port values and any CI `SMOKE_*` override;
- launcher ordering before every local Playwright project;
- absence of duplicate active `python3 -m http.server` workflow commands;
- no application, curriculum, deployment, or attestation behavior change.

Fix every Critical or Important finding, rerun affected tests, and repeat review until none remain.

- [ ] **Step 4: Confirm the final branch is clean and focused**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: clean worktree; design and plan commits plus two implementation commits; only the approved spec/plan, launcher, launcher test, workflow, CI contract, and smoke README differ from `main`.

- [ ] **Step 5: Push and create the pull request**

Run:

```bash
git push -u origin codex/smoke-server-launcher
gh pr create \
  --base main \
  --head codex/smoke-server-launcher \
  --title "Use a directly tested smoke-server launcher" \
  --body "Automates the three local review servers through one tested launcher, removes duplicated inline CI startup logic, and preserves all existing Playwright behavior. Local and repository gates are documented in the commits."
```

Expected: a ready-for-review follow-up PR with no unrelated faculty-console or curriculum diff.

- [ ] **Step 6: Monitor remote checks to terminal status**

Run:

```bash
gh pr checks --watch
gh pr view --json mergeStateStatus,mergeable
```

Expected before completion is claimed:

- `build-test-validate` passes;
- `Smoke tests (nav crawl · faculty console · LFS · visual)` passes;
- Netlify contexts pass or skip/neutral exactly as configured;
- no failed or pending required check remains;
- `gh pr view` reports `mergeStateStatus: CLEAN` and `mergeable: MERGEABLE`.
