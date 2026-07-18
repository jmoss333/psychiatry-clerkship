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

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

function assertSmokeServerContract(ci) {
  let lastServer = -1;
  for (const { port, directory } of SMOKE_SERVERS) {
    const command = `python3 -m http.server ${port} --directory ${directory} &`;
    assert.equal(
      countOccurrences(ci, command),
      1,
      `${port} must serve ${directory} exactly once`,
    );
    lastServer = Math.max(lastServer, ci.indexOf(command));
  }

  const readinessLoop = 'for port in 4200 4201 4202; do';
  assert.equal(
    countOccurrences(ci, readinessLoop),
    1,
    'readiness loop must check exactly ports 4200, 4201, and 4202',
  );
  const readinessIndex = ci.indexOf(readinessLoop);
  assert.ok(readinessIndex > lastServer, 'readiness loop must follow all three server commands');

  const failureGuard = 'if [ "$ready" != true ]; then';
  const guardIndex = ci.indexOf(failureGuard, readinessIndex);
  assert.ok(guardIndex > readinessIndex, 'readiness loop must retain its fail-closed guard');
  const exitIndex = ci.indexOf('exit 1', guardIndex);
  assert.ok(exitIndex > guardIndex, 'readiness failure must exit nonzero');

  const readyMarker = 'echo "Servers ready"';
  assert.equal(countOccurrences(ci, readyMarker), 1, 'server readiness marker must occur exactly once');
  const readyIndex = ci.indexOf(readyMarker);
  assert.ok(readyIndex > exitIndex, 'success marker must follow the fail-closed readiness path');

  for (const project of ['interview-room', 'faculty-console']) {
    const marker = `--project=${project}`;
    assert.equal(
      countOccurrences(ci, marker),
      1,
      `${project} browser project must run exactly once`,
    );
    assert.ok(
      ci.indexOf(marker) > readyIndex,
      `${project} browser project must follow successful server readiness`,
    );
  }
}

test('CI gates and the three localhost review surfaces are structurally ordered', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const ordered = [
    'uses: actions/setup-node@v4',
    'node-version: "20"',
    'npm --prefix sp-proxy ci',
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
    'build_and_check.sh ms3',
    'build_and_check.sh res',
  ];
  let prior = -1;
  for (const marker of ordered) {
    const index = ci.indexOf(marker);
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
test('CI gates fail the build — no step swallows a nonzero exit', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  assert.equal(/\|\|\s*true\b/.test(ci), false, 'no CI step may mask failure with "|| true"');
  assert.equal(/continue-on-error:\s*true/.test(ci), false, 'no CI step may continue-on-error');
  assert.equal(/^\s*set \+e\b/m.test(ci), false, 'no CI step may disable errexit with "set +e"');

  // The managed-proxy/interview gate runs all three suites in one errexit shell
  // (GitHub Actions default bash -e), so any single failure fails the job.
  const gate = ci.slice(
    ci.indexOf('Test — SP Interview and managed proxy'),
    ci.indexOf('Build + static QA gate (ms3)'),
  );
  assert.ok(gate.length > 0, 'SP managed-proxy gate step must exist');
  for (const marker of [
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
  ]) {
    assert.ok(gate.includes(marker), `SP gate must run ${marker}`);
  }
});
