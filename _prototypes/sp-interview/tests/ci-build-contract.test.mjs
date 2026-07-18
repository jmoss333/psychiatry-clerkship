import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MANIFEST = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/site_manifest.json',
);
const BUILD = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/build_deploy.py',
);
const CHECKER = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/check-static-site.mjs',
);
const CI = path.join(ROOT, '.github/workflows/ci.yml');

const EXPECTED_ASSETS = [
  ['_prototypes/sp-interview/sp-interview.pack.json', 'sp-interview.pack.json'],
  ['_prototypes/sp-interview/sp-interview.voice.js', 'sp-interview.voice.js'],
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

test('manifest drives both Interview Room runtime assets into a real site build', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  assert.deepEqual(manifest.toolAssets, EXPECTED_ASSETS);
  for (const [source] of EXPECTED_ASSETS) {
    assert.equal(fs.existsSync(path.join(ROOT, source)), true, `missing source asset: ${source}`);
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-build-contract-'));
  const output = path.join(temporary, 'site');
  try {
    const result = run('python3', [BUILD], {
      env: { ...process.env, OUT_DIR: output },
      timeout: 60_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const [, destination] of EXPECTED_ASSETS) {
      assert.equal(
        fs.existsSync(path.join(output, 'tools', destination)),
        true,
        `built site omitted tools/${destination}`,
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(`${output}.source-map.json`, { force: true });
  }
});

test('static QA rejects a missing relative script dependency', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-static-contract-'));
  const sourceMap = `${site}.source-map.json`;
  const tools = path.join(site, 'tools');
  fs.mkdirSync(tools);
  fs.writeFileSync(
    path.join(tools, 'fixture.html'),
    '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width"><!-- [RC-META] --><script src="./missing.js"></script>',
  );
  fs.writeFileSync(
    path.join(site, 'nav.json'),
    JSON.stringify([{ section: 'Fixture', items: [{ k: 'tool', f: 'fixture.html' }] }]),
  );
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  fs.writeFileSync(
    sourceMap,
    JSON.stringify({ sources: [...manifest.tools, ...manifest.md].map(([source]) => source) }),
  );
  try {
    const missing = run(process.execPath, [CHECKER, site]);
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.match(missing.stdout + missing.stderr, /missing relative script source.*missing\.js/i);

    fs.writeFileSync(path.join(tools, 'missing.js'), 'export {};\n');
    const present = run(process.execPath, [CHECKER, site]);
    assert.equal(present.status, 0, present.stdout + present.stderr);
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
    fs.rmSync(sourceMap, { force: true });
  }
});

// F24 — shipped JS toolAssets (e.g. sp-interview.voice.js) were never scanned;
// only tools/*.html was read. A CDN dependency inside a shipped script blanks
// the tool on offline/ward networks the same way one in the HTML would.
test('static QA rejects a CDN dependency inside a shipped JS asset', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-static-js-'));
  const sourceMap = `${site}.source-map.json`;
  const tools = path.join(site, 'tools');
  fs.mkdirSync(tools);
  fs.writeFileSync(
    path.join(tools, 'fixture.html'),
    '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width"><!-- [RC-META] --><script src="./fixture.js"></script>',
  );
  fs.writeFileSync(
    path.join(tools, 'fixture.js'),
    'const cdn = "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js";\n',
  );
  fs.writeFileSync(
    path.join(site, 'nav.json'),
    JSON.stringify([{ section: 'Fixture', items: [{ k: 'tool', f: 'fixture.html' }] }]),
  );
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  fs.writeFileSync(
    sourceMap,
    JSON.stringify({ sources: [...manifest.tools, ...manifest.md].map(([source]) => source) }),
  );
  try {
    const flagged = run(process.execPath, [CHECKER, site]);
    assert.equal(flagged.status, 1, flagged.stdout + flagged.stderr);
    assert.match(flagged.stdout + flagged.stderr, /external CDN dependency in tools\/fixture\.js/i);

    fs.writeFileSync(path.join(tools, 'fixture.js'), 'export {};\n');
    const clean = run(process.execPath, [CHECKER, site]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
    fs.rmSync(sourceMap, { force: true });
  }
});

const SMOKE_SERVERS = Object.freeze([
  { port: '4200', directory: '_build/ms3' },
  { port: '4201', directory: '_build/res' },
  { port: '4202', directory: 'faculty-console' },
]);

function leadingIndent(line) {
  return line.length - line.trimStart().length;
}

function extractRunBlocks(ci) {
  const sourceLines = ci.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const run = sourceLines[index].match(/^(\s*)run:\s*\|\s*$/);
    if (!run) continue;

    const runIndent = run[1].length;
    const lines = [];
    let endLine = index;
    for (let bodyIndex = index + 1; bodyIndex < sourceLines.length; bodyIndex += 1) {
      const sourceLine = sourceLines[bodyIndex];
      if (sourceLine.trim() && leadingIndent(sourceLine) <= runIndent) break;
      lines.push({
        text: sourceLine.trim(),
        indent: leadingIndent(sourceLine),
      });
      endLine = bodyIndex;
    }
    blocks.push({ startLine: index, endLine, lines });
    index = endLine;
  }
  return blocks;
}

function countExactLines(lines, marker) {
  return lines.filter((line) => line.text === marker).length;
}

function hasExactLine(lines, marker) {
  return lines.some((line) => line.text === marker);
}

function findExactLineIndex(lines, marker, fromIndex = 0) {
  return lines.findIndex((line, index) => index >= fromIndex && line.text === marker);
}

function findMatchingEndIndex(lines, openerIndex, marker) {
  const openerIndent = lines[openerIndex].indent;
  return lines.findIndex((line, index) => (
    index > openerIndex
      && line.text === marker
      && line.indent === openerIndent
  ));
}

function countRunCommands(runBlocks, command) {
  return runBlocks.reduce(
    (count, block) => count + countExactLines(block.lines, command),
    0,
  );
}

function assertSmokeServerContract(ci) {
  const runBlocks = extractRunBlocks(ci);
  const serverCommands = [];
  for (const { port, directory } of SMOKE_SERVERS) {
    const command = `python3 -m http.server ${port} --directory ${directory} &`;
    serverCommands.push(command);
    const invocation = new RegExp(`^python3 -m http\\.server ${port}(?:\\s|$)`);
    const invocations = runBlocks.flatMap((block) => (
      block.lines.filter((line) => invocation.test(line.text))
    ));
    assert.equal(
      invocations.length,
      1,
      `${port} must serve ${directory} exactly once; ${port} must have exactly one active server invocation`,
    );
    assert.equal(
      invocations[0].text,
      command,
      `${port} must serve ${directory} exactly once`,
    );
  }

  const matchingServerBlocks = runBlocks.filter((block) => (
    serverCommands.every((command) => hasExactLine(block.lines, command))
  ));
  assert.equal(
    matchingServerBlocks.length,
    1,
    'all three localhost servers must run in one workflow block',
  );
  const serverBlock = matchingServerBlocks[0];
  const lastServer = Math.max(
    ...serverCommands.map((command) => findExactLineIndex(serverBlock.lines, command)),
  );

  const readinessLoop = 'for port in 4200 4201 4202; do';
  assert.equal(
    countExactLines(serverBlock.lines, readinessLoop),
    1,
    'readiness loop must check exactly ports 4200, 4201, and 4202',
  );
  const readinessIndex = findExactLineIndex(serverBlock.lines, readinessLoop);
  assert.ok(readinessIndex > lastServer, 'readiness loop must follow all three server commands');
  const readinessIndent = serverBlock.lines[readinessIndex].indent;

  const retryLoop = 'for i in $(seq 1 15); do';
  assert.equal(
    countExactLines(serverBlock.lines, retryLoop),
    1,
    'readiness loop must retain exactly one bounded retry loop',
  );
  const retryIndex = findExactLineIndex(serverBlock.lines, retryLoop);
  assert.ok(
    retryIndex > readinessIndex
      && serverBlock.lines[retryIndex].indent > readinessIndent,
    'bounded retry loop must remain inside the per-port readiness loop',
  );
  const retryEndIndex = findMatchingEndIndex(serverBlock.lines, retryIndex, 'done');
  assert.ok(retryEndIndex > retryIndex, 'bounded retry loop must retain its matching done');

  const readinessEndIndex = findMatchingEndIndex(serverBlock.lines, readinessIndex, 'done');
  assert.ok(
    readinessEndIndex > retryEndIndex,
    'per-port readiness loop must close after the bounded retry loop',
  );

  const failureGuard = 'if [ "$ready" != true ]; then';
  assert.equal(
    countExactLines(serverBlock.lines, failureGuard),
    1,
    'readiness loop must retain exactly one fail-closed guard',
  );
  const guardIndex = findExactLineIndex(serverBlock.lines, failureGuard);
  assert.ok(
    guardIndex > retryEndIndex
      && guardIndex < readinessEndIndex
      && serverBlock.lines[guardIndex].indent > readinessIndent,
    'fail-closed guard must remain inside the per-port readiness loop',
  );
  assert.equal(
    countExactLines(serverBlock.lines, 'exit 1'),
    1,
    'readiness failure must exit nonzero exactly once',
  );
  const exitIndex = findExactLineIndex(serverBlock.lines, 'exit 1', guardIndex + 1);
  const guardEndIndex = findMatchingEndIndex(serverBlock.lines, guardIndex, 'fi');
  assert.ok(
    exitIndex > guardIndex
      && exitIndex < guardEndIndex
      && serverBlock.lines[exitIndex].indent > serverBlock.lines[guardIndex].indent,
    'readiness failure must exit nonzero inside the fail-closed guard',
  );
  assert.ok(
    guardEndIndex > exitIndex && guardEndIndex < readinessEndIndex,
    'readiness failure exit must remain inside the fail-closed guard',
  );

  const readyMarker = 'echo "Servers ready"';
  assert.equal(
    countExactLines(serverBlock.lines, readyMarker),
    1,
    'server readiness marker must occur exactly once',
  );
  const readyIndex = findExactLineIndex(serverBlock.lines, readyMarker);
  assert.ok(
    readyIndex > readinessEndIndex,
    'success marker must follow the complete per-port readiness loop',
  );

  for (const project of ['interview-room', 'faculty-console']) {
    const command = `npx playwright test --project=${project}`;
    assert.equal(
      countRunCommands(runBlocks, command),
      1,
      `${project} browser project must run exactly once`,
    );
    const projectBlock = runBlocks.find((block) => hasExactLine(block.lines, command));
    assert.ok(
      projectBlock.startLine > serverBlock.endLine,
      `${project} browser project must follow successful server readiness`,
    );
  }
}

test('CI gates and the three localhost review surfaces are structurally ordered', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const ciLines = ci.split(/\r?\n/);
  const ordered = [
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
  for (const marker of ordered) {
    const index = ciLines.findIndex((line) => line.trim() === marker);
    assert.ok(index > prior, `${marker} must occur after the preceding managed-SP gate`);
    prior = index;
  }

  assertSmokeServerContract(ci);
  assert.match(ci, /SP_INTERVIEW_BASE_URL:\s*http:\/\/localhost:4200\/tools\//);
});

test('localhost server contract ignores labels and rejects structural drift', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const relabeled = ci.replace(
    /(\n\s*- name: )[^\n]+(\n\s+run: \|\n\s+python3 -m http\.server 4200 --directory _build\/ms3 &)/,
    '$1Arbitrary wording that must not affect behavior$2',
  );
  assert.notEqual(relabeled, ci, 'test fixture must locate and relabel the server step');
  assert.doesNotThrow(() => assertSmokeServerContract(relabeled));

  const commands = [
    'python3 -m http.server 4200 --directory _build/ms3 &',
    'python3 -m http.server 4201 --directory _build/res &',
    'python3 -m http.server 4202 --directory faculty-console &',
  ];
  for (const command of commands) {
    const port = command.match(/http\.server (\d+)/)?.[1];
    assert.throws(
      () => assertSmokeServerContract(ci.replace(command, '')),
      new RegExp(`${port} must serve`),
    );
  }

  assert.throws(
    () => assertSmokeServerContract(ci.replace(
      'python3 -m http.server 4202 --directory faculty-console &',
      'python3 -m http.server 4202 --directory _build/ms3 &',
    )),
    /4202 must serve faculty-console/,
  );
  assert.throws(
    () => assertSmokeServerContract(ci.replace(
      'for port in 4200 4201 4202; do',
      'for port in 4200 4201; do',
    )),
    /readiness loop must check exactly ports 4200, 4201, and 4202/,
  );

  for (const project of ['interview-room', 'faculty-console']) {
    const command = `npx playwright test --project=${project}`;
    const moved = ci
      .replace(command, '')
      .replace('echo "Servers ready"', `${command}\n          echo "Servers ready"`);
    assert.throws(
      () => assertSmokeServerContract(moved),
      new RegExp(`${project} browser project must follow successful server readiness`),
    );
  }
});

test('localhost server contract rejects commented server commands', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const command = 'python3 -m http.server 4200 --directory _build/ms3 &';
  const commented = ci.replace(
    command,
    `# ${command}\n          python3 -m http.server 4200 --directory _build/res &`,
  );
  assert.notEqual(commented, ci, 'test fixture must comment out the correct server command');
  assert.throws(
    () => assertSmokeServerContract(commented),
    /4200 must serve _build\/ms3 exactly once/,
  );
});

test('localhost server contract rejects a commented readiness exit', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const commented = ci.replace('\n              exit 1\n', '\n              # exit 1\n');
  assert.notEqual(commented, ci, 'test fixture must comment out the readiness exit');
  assert.throws(
    () => assertSmokeServerContract(commented),
    /readiness failure must exit nonzero/,
  );
});

test('localhost server contract rejects suffixed Playwright projects', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  for (const project of ['interview-room', 'faculty-console']) {
    const command = `npx playwright test --project=${project}`;
    const suffixed = ci.replace(command, `${command}-disabled`);
    assert.notEqual(suffixed, ci, `test fixture must replace the ${project} project`);
    assert.throws(
      () => assertSmokeServerContract(suffixed),
      new RegExp(`${project} browser project must run exactly once`),
    );
  }
});

test('localhost server contract rejects a guard after the per-port readiness loop', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const nestedGuard = [
    '            if [ "$ready" != true ]; then',
    '              echo "::error::Server on port $port did not become ready"',
    '              exit 1',
    '            fi',
  ].join('\n');
  const topLevelGuard = nestedGuard
    .split('\n')
    .map((line) => line.slice(2))
    .join('\n');
  const moved = ci.replace(
    `${nestedGuard}\n          done\n          echo "Servers ready"`,
    `          done\n${topLevelGuard}\n          echo "Servers ready"`,
  );
  assert.notEqual(moved, ci, 'test fixture must move the guard after the per-port loop');
  assert.throws(
    () => assertSmokeServerContract(moved),
    /fail-closed guard must remain inside the per-port readiness loop/,
  );
});

test('localhost server contract rejects competing server mappings on a required port', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const approved = 'python3 -m http.server 4200 --directory _build/ms3 &';
  const competing = ci.replace(
    approved,
    `${approved}\n          python3 -m http.server 4200 --directory _build/res &`,
  );
  assert.notEqual(competing, ci, 'test fixture must add a competing 4200 server');
  assert.throws(
    () => assertSmokeServerContract(competing),
    /4200 must have exactly one active server invocation/,
  );
});

// F26's other half: CI invoking run-all.sh (locked above) only helps if
// run-all.sh itself keeps every suite wired — deleting one line would
// silently re-orphan a test with CI green.
test('run-all.sh keeps the review-filter suite wired', () => {
  const runAll = fs.readFileSync(
    path.join(ROOT, '_prototypes/sp-interview/tests/run-all.sh'),
    'utf8',
  );
  assert.match(
    runAll,
    /node review-filter\.test\.mjs/,
    'review-filter.test.mjs must stay invoked by run-all.sh',
  );
});

// F25 — a gate that runs but can never fail the build is worse than no gate. The
// order test above does not catch a step neutered with `|| true` / continue-on-error.
function assertCiGatesFailClosed(ci) {
  assert.equal(/\|\|\s*true\b/.test(ci), false, 'no CI step may mask failure with "|| true"');
  assert.equal(/continue-on-error:\s*true/.test(ci), false, 'no CI step may continue-on-error');
  assert.equal(/^\s*set \+e\b/m.test(ci), false, 'no CI step may disable errexit with "set +e"');

  // The managed-proxy/interview gate runs all three suites in one errexit shell
  // (GitHub Actions default bash -e), so any single failure fails the job.
  const runBlocks = extractRunBlocks(ci);
  const commands = [
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
  ];
  for (const command of commands) {
    assert.equal(
      countRunCommands(runBlocks, command),
      1,
      `SP gate must run ${command} exactly once`,
    );
  }
  const gates = runBlocks.filter((block) => (
    commands.every((command) => hasExactLine(block.lines, command))
  ));
  assert.equal(gates.length, 1, 'SP managed-proxy gate commands must share one run block');
}

test('CI gates fail the build — no step swallows a nonzero exit', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  assertCiGatesFailClosed(ci);
});

test('managed SP fail-closed gate ignores workflow labels', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const relabeled = ci
    .replace('Test — SP Interview and managed proxy', 'Arbitrary managed test wording')
    .replace('Build + static QA gate (ms3)', 'Arbitrary managed build wording');
  for (const label of [
    'Test — SP Interview and managed proxy',
    'Build + static QA gate (ms3)',
  ]) {
    assert.equal(relabeled.includes(label), false, `test fixture must relabel ${label}`);
  }
  assert.doesNotThrow(() => assertCiGatesFailClosed(relabeled));
});
